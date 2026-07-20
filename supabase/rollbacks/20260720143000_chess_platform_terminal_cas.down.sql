begin;

drop function if exists public.commit_and_finalize_chess_move_server(
  uuid, text, text, text, jsonb, text, text, integer, jsonb,
  text, text, text
);
drop function if exists public.claim_chess_timeout(uuid, bigint);
drop function if exists public.resign_chess_match(uuid, bigint);
drop function if exists public.finalize_chess_timeout_server(uuid, bigint, text);
drop function if exists public.finalize_chess_match_server(
  uuid, text, text, text, bigint
);
drop function if exists private.chess_timeout_has_mating_material(text, text);
drop index if exists public.chess_move_commands_one_pending_revision_idx;

-- Restore the journal ACL captured before CAS. For compatibility with an
-- already-applied older CAS revision that has no snapshot, default to the
-- former foundation behavior (all four direct DML rights granted).
do $restore_chess_terminal_cas_acl$
declare
  v_acl record;
begin
  if to_regclass('private.chess_terminal_cas_acl_snapshot') is null then
    select true as moves_insert, true as moves_update,
      true as moves_delete, true as moves_truncate,
      true as events_insert, true as events_update,
      true as events_delete, true as events_truncate
    into v_acl;
  else
    select * into v_acl
    from private.chess_terminal_cas_acl_snapshot
    where singleton;
  end if;

  if v_acl.moves_insert then
    execute 'grant insert on public.chess_match_moves to service_role';
  else
    execute 'revoke insert on public.chess_match_moves from service_role';
  end if;
  if v_acl.moves_update then
    execute 'grant update on public.chess_match_moves to service_role';
  else
    execute 'revoke update on public.chess_match_moves from service_role';
  end if;
  if v_acl.moves_delete then
    execute 'grant delete on public.chess_match_moves to service_role';
  else
    execute 'revoke delete on public.chess_match_moves from service_role';
  end if;
  if v_acl.moves_truncate then
    execute 'grant truncate on public.chess_match_moves to service_role';
  else
    execute 'revoke truncate on public.chess_match_moves from service_role';
  end if;
  if v_acl.events_insert then
    execute 'grant insert on public.chess_match_events to service_role';
  else
    execute 'revoke insert on public.chess_match_events from service_role';
  end if;
  if v_acl.events_update then
    execute 'grant update on public.chess_match_events to service_role';
  else
    execute 'revoke update on public.chess_match_events from service_role';
  end if;
  if v_acl.events_delete then
    execute 'grant delete on public.chess_match_events to service_role';
  else
    execute 'revoke delete on public.chess_match_events from service_role';
  end if;
  if v_acl.events_truncate then
    execute 'grant truncate on public.chess_match_events to service_role';
  else
    execute 'revoke truncate on public.chess_match_events from service_role';
  end if;
end;
$restore_chess_terminal_cas_acl$;

drop table if exists private.chess_terminal_cas_acl_snapshot;

-- Restore the pre-CAS submission contract. Commands already marked
-- superseded by the forward migration remain auditable and are not revived.
create or replace function public.submit_chess_move_command(
  p_match_id uuid,
  p_expected_revision bigint,
  p_client_command_id uuid,
  p_uci text,
  p_submitted_clock_ms integer default null
)
returns table (
  command_id uuid,
  command_sequence bigint,
  command_status text,
  authoritative_revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_match public.chess_matches%rowtype;
  v_existing public.chess_move_commands%rowtype;
  v_id uuid;
  v_sequence bigint;
  v_clock_ms bigint;
  v_elapsed_ms bigint;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_client_command_id is null or p_expected_revision is null then
    raise exception 'COMMAND_ID_AND_REVISION_REQUIRED' using errcode = '22023';
  end if;
  if p_uci is null or char_length(trim(p_uci)) not between 4 and 32 then
    raise exception 'INVALID_MOVE_NOTATION' using errcode = '22023';
  end if;
  if p_submitted_clock_ms is not null
    and p_submitted_clock_ms not between 0 and 604800000 then
    raise exception 'INVALID_CLIENT_CLOCK' using errcode = '22023';
  end if;

  select * into v_match
  from public.chess_matches
  where id = p_match_id
  for update;
  if not found then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_existing
  from public.chess_move_commands command_row
  where command_row.match_id = p_match_id
    and command_row.actor_id = v_user_id
    and command_row.client_command_id = p_client_command_id;
  if found then
    if v_existing.expected_revision <> p_expected_revision
      or v_existing.uci <> lower(trim(p_uci)) then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;
    return query select v_existing.id, v_existing.sequence,
      v_existing.status, v_match.revision;
    return;
  end if;

  if v_match.status <> 'active' then
    raise exception 'MATCH_NOT_ACTIVE' using errcode = '55000';
  end if;
  if v_match.revision <> p_expected_revision then
    raise exception 'STALE_MATCH_REVISION' using errcode = '40001';
  end if;
  if (v_match.side_to_move = 'white' and v_match.white_player_id <> v_user_id)
    or (v_match.side_to_move = 'black' and v_match.black_player_id <> v_user_id) then
    raise exception 'NOT_YOUR_TURN' using errcode = '42501';
  end if;

  v_clock_ms := case v_match.side_to_move
    when 'white' then coalesce((v_match.clock_state ->> 'whiteMs')::bigint, 0)
    else coalesce((v_match.clock_state ->> 'blackMs')::bigint, 0)
  end;
  v_elapsed_ms := greatest(
    0,
    floor(extract(epoch from (
      clock_timestamp() - coalesce(v_match.last_move_at, v_match.started_at)
    )) * 1000)::bigint
  );
  if v_clock_ms - v_elapsed_ms <= 0 then
    raise exception 'CLOCK_EXPIRED' using errcode = '55000';
  end if;

  v_sequence := v_match.command_sequence + 1;
  update public.chess_matches
  set command_sequence = v_sequence
  where id = p_match_id;

  insert into public.chess_move_commands (
    match_id, actor_id, client_command_id, sequence, expected_revision,
    uci, submitted_clock_ms
  ) values (
    p_match_id, v_user_id, p_client_command_id, v_sequence,
    p_expected_revision, lower(trim(p_uci)), p_submitted_clock_ms
  ) returning id into v_id;

  return query select v_id, v_sequence, 'pending'::text, v_match.revision;
end;
$$;

revoke all on function public.submit_chess_move_command(
  uuid, bigint, uuid, text, integer
) from public, anon, authenticated;
grant execute on function public.submit_chess_move_command(
  uuid, bigint, uuid, text, integer
) to authenticated;

-- The safer match -> command lock order in commit_chess_move_server is kept;
-- it is API-compatible and reverting it would deliberately reintroduce a
-- deadlock risk. The four-argument finalization API is restored below.
create or replace function public.finalize_chess_match_server(
  p_match_id uuid,
  p_result text,
  p_termination text,
  p_verification_reference text
)
returns table (
  finalized boolean,
  white_rating integer,
  black_rating integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.chess_matches%rowtype;
  v_season public.chess_rating_seasons%rowtype;
  v_white public.chess_player_ratings%rowtype;
  v_black public.chess_player_ratings%rowtype;
  v_white_score numeric;
  v_black_score numeric;
  v_white_expected numeric;
  v_black_expected numeric;
  v_white_after integer;
  v_black_after integer;
  v_white_outcome text;
  v_black_outcome text;
  v_event_revision bigint;
begin
  if p_result not in ('1-0', '0-1', '1/2-1/2') then
    raise exception 'INVALID_MATCH_RESULT' using errcode = '22023';
  end if;
  if p_verification_reference is null
    or char_length(trim(p_verification_reference)) not between 8 and 300 then
    raise exception 'AUTHORITATIVE_VERIFICATION_REQUIRED' using errcode = '22023';
  end if;
  if p_termination is null or char_length(trim(p_termination)) not between 2 and 100 then
    raise exception 'INVALID_TERMINATION' using errcode = '22023';
  end if;

  select * into v_match
  from public.chess_matches
  where id = p_match_id
  for update;
  if not found then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_match.status = 'completed' then
    if v_match.result <> p_result
      or v_match.verification_reference <> trim(p_verification_reference) then
      raise exception 'FINALIZATION_CONFLICT' using errcode = '55000';
    end if;
    if v_match.rated then
      select rating into v_white_after
      from public.chess_player_ratings
      where season_id = v_match.season_id and user_id = v_match.white_player_id;
      select rating into v_black_after
      from public.chess_player_ratings
      where season_id = v_match.season_id and user_id = v_match.black_player_id;
    end if;
    return query select false, v_white_after, v_black_after;
    return;
  end if;
  if v_match.status <> 'active'
    or v_match.white_player_id is null
    or v_match.black_player_id is null then
    raise exception 'MATCH_NOT_FINALIZABLE' using errcode = '55000';
  end if;

  v_white_score := case p_result when '1-0' then 1 when '0-1' then 0 else 0.5 end;
  v_black_score := 1 - v_white_score;
  v_white_outcome := case when v_white_score = 1 then 'win'
    when v_white_score = 0 then 'loss' else 'draw' end;
  v_black_outcome := case when v_black_score = 1 then 'win'
    when v_black_score = 0 then 'loss' else 'draw' end;

  if v_match.rated then
    select * into v_season
    from public.chess_rating_seasons
    where id = v_match.season_id
    for update;
    if not found then
      raise exception 'RATING_SEASON_NOT_FOUND' using errcode = 'P0002';
    end if;

    insert into public.chess_player_ratings (
      season_id, user_id, rating, peak_rating
    ) values
      (v_season.id, v_match.white_player_id, v_season.initial_rating, v_season.initial_rating),
      (v_season.id, v_match.black_player_id, v_season.initial_rating, v_season.initial_rating)
    on conflict (season_id, user_id) do nothing;

    perform 1 from public.chess_player_ratings rating_row
    where rating_row.season_id = v_season.id
      and rating_row.user_id in (v_match.white_player_id, v_match.black_player_id)
    order by rating_row.user_id
    for update;
    select * into v_white from public.chess_player_ratings
    where season_id = v_season.id and user_id = v_match.white_player_id;
    select * into v_black from public.chess_player_ratings
    where season_id = v_season.id and user_id = v_match.black_player_id;

    v_white_expected := 1 / (
      1 + power(10::numeric, (v_black.rating - v_white.rating)::numeric / 400)
    );
    v_black_expected := 1 - v_white_expected;
    v_white_after := greatest(
      v_season.rating_floor,
      round(v_white.rating + v_season.k_factor * (v_white_score - v_white_expected))::integer
    );
    v_black_after := greatest(
      v_season.rating_floor,
      round(v_black.rating + v_season.k_factor * (v_black_score - v_black_expected))::integer
    );

    update public.chess_player_ratings
    set rating = v_white_after,
        peak_rating = greatest(peak_rating, v_white_after),
        games_played = games_played + 1,
        wins = wins + case when v_white_score = 1 then 1 else 0 end,
        draws = draws + case when v_white_score = 0.5 then 1 else 0 end,
        losses = losses + case when v_white_score = 0 then 1 else 0 end,
        provisional = games_played + 1 < 10
    where season_id = v_season.id and user_id = v_match.white_player_id;
    update public.chess_player_ratings
    set rating = v_black_after,
        peak_rating = greatest(peak_rating, v_black_after),
        games_played = games_played + 1,
        wins = wins + case when v_black_score = 1 then 1 else 0 end,
        draws = draws + case when v_black_score = 0.5 then 1 else 0 end,
        losses = losses + case when v_black_score = 0 then 1 else 0 end,
        provisional = games_played + 1 < 10
    where season_id = v_season.id and user_id = v_match.black_player_id;

    insert into public.chess_rating_history (
      season_id, user_id, match_id, rating_before, rating_after, delta,
      expected_score, actual_score
    ) values
      (
        v_season.id, v_match.white_player_id, v_match.id, v_white.rating,
        v_white_after, v_white_after - v_white.rating,
        v_white_expected, v_white_score
      ),
      (
        v_season.id, v_match.black_player_id, v_match.id, v_black.rating,
        v_black_after, v_black_after - v_black.rating,
        v_black_expected, v_black_score
      );
  end if;

  v_event_revision := v_match.revision + 1;
  update public.chess_matches
  set status = 'completed',
      result = p_result,
      termination = left(trim(p_termination), 100),
      revision = v_event_revision,
      ended_at = now(),
      verification_status = 'verified',
      verification_reference = trim(p_verification_reference),
      verified_at = now(),
      rating_processed_at = case when rated then now() else null end
  where id = v_match.id;
  update public.chess_rooms
  set status = 'completed', closed_at = now(), revision = revision + 1
  where id = v_match.room_id;
  insert into public.chess_match_events (
    match_id, revision, event_type, payload
  ) values (
    v_match.id,
    v_event_revision,
    'match_verified',
    jsonb_build_object(
      'result', p_result,
      'termination', left(trim(p_termination), 100),
      'verificationReference', trim(p_verification_reference),
      'rated', v_match.rated,
      'whiteRating', v_white_after,
      'blackRating', v_black_after
    )
  );

  perform public.apply_verified_game_progress_internal(
    v_match.white_player_id, v_white_outcome, v_match.id
  );
  perform public.apply_verified_game_progress_internal(
    v_match.black_player_id, v_black_outcome, v_match.id
  );
  return query select true, v_white_after, v_black_after;
end;
$$;

revoke all on function public.finalize_chess_match_server(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.finalize_chess_match_server(
  uuid, text, text, text
) to service_role;

notify pgrst, 'reload schema';

commit;
