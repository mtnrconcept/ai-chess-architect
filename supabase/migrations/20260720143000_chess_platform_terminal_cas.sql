begin;

-- Reassert the custom-runtime gate for environments where the foundation was
-- already deployed before this hardening migration existed.
create or replace function private.enforce_chess_custom_runtime_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ruleset_type = 'custom' then
    raise exception 'CUSTOM_RULES_VALIDATOR_NOT_AVAILABLE'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_chess_custom_runtime_gate()
  from public, anon, authenticated;

drop trigger if exists chess_rooms_custom_runtime_gate on public.chess_rooms;
create trigger chess_rooms_custom_runtime_gate
before insert or update of ruleset_type on public.chess_rooms
for each row execute function private.enforce_chess_custom_runtime_gate();

-- Remember the pre-CAS journal ACL once. Older staging foundations granted
-- these rights while a fresh, already-hardened foundation revokes them; the
-- down migration must faithfully restore either starting point.
create table if not exists private.chess_terminal_cas_acl_snapshot (
  singleton boolean primary key default true check (singleton),
  moves_insert boolean not null,
  moves_update boolean not null,
  moves_delete boolean not null,
  moves_truncate boolean not null,
  events_insert boolean not null,
  events_update boolean not null,
  events_delete boolean not null,
  events_truncate boolean not null
);
insert into private.chess_terminal_cas_acl_snapshot (
  singleton,
  moves_insert,
  moves_update,
  moves_delete,
  moves_truncate,
  events_insert,
  events_update,
  events_delete,
  events_truncate
)
select
  true,
  has_table_privilege('service_role', 'public.chess_match_moves', 'INSERT'),
  has_table_privilege('service_role', 'public.chess_match_moves', 'UPDATE'),
  has_table_privilege('service_role', 'public.chess_match_moves', 'DELETE'),
  has_table_privilege('service_role', 'public.chess_match_moves', 'TRUNCATE'),
  has_table_privilege('service_role', 'public.chess_match_events', 'INSERT'),
  has_table_privilege('service_role', 'public.chess_match_events', 'UPDATE'),
  has_table_privilege('service_role', 'public.chess_match_events', 'DELETE'),
  has_table_privilege('service_role', 'public.chess_match_events', 'TRUNCATE')
on conflict (singleton) do nothing;
revoke all on table private.chess_terminal_cas_acl_snapshot
  from public, anon, authenticated, service_role;

-- Preserve SELECT for diagnostics while forcing all writes through the
-- audited owner RPCs, including when the caller holds service_role.
revoke insert, update, delete, truncate on table
  public.chess_match_moves,
  public.chess_match_events
from service_role;

-- Serialize one authoritative command per match revision. Existing duplicate
-- pending commands are closed deterministically before the partial unique
-- index is installed.
with ranked_pending as (
  select command_row.id,
    row_number() over (
      partition by command_row.match_id, command_row.expected_revision
      order by command_row.sequence, command_row.id
    ) as pending_rank
  from public.chess_move_commands command_row
  where command_row.status = 'pending'
)
update public.chess_move_commands command_row
set status = 'superseded',
    processed_at = now(),
    rejection_reason = 'duplicate pending command closed during CAS upgrade'
from ranked_pending ranked
where ranked.id = command_row.id
  and ranked.pending_rank > 1;

create unique index if not exists chess_move_commands_one_pending_revision_idx
  on public.chess_move_commands (match_id, expected_revision)
  where status = 'pending';

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
  v_pending public.chess_move_commands%rowtype;
  v_id uuid;
  v_sequence bigint;
  v_clock_ms bigint;
  v_elapsed_ms bigint;
  v_attempt_count integer;
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

  -- All command lifecycle functions lock the match before a command row.
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

  select * into v_pending
  from public.chess_move_commands command_row
  where command_row.match_id = p_match_id
    and command_row.expected_revision = p_expected_revision
    and command_row.status = 'pending';
  if found then
    raise exception 'MOVE_ALREADY_PENDING' using errcode = '55000';
  end if;

  select count(*) into v_attempt_count
  from public.chess_move_commands command_row
  where command_row.match_id = p_match_id
    and command_row.actor_id = v_user_id
    and command_row.expected_revision = p_expected_revision
    and command_row.status <> 'accepted';
  if v_attempt_count >= 32 then
    raise exception 'COMMAND_RATE_LIMITED' using errcode = '55000';
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
    uci, submitted_clock_ms, created_at
  ) values (
    p_match_id, v_user_id, p_client_command_id, v_sequence,
    p_expected_revision, lower(trim(p_uci)), p_submitted_clock_ms,
    clock_timestamp()
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

create or replace function public.commit_chess_move_server(
  p_command_id uuid,
  p_san text,
  p_fen_before text,
  p_fen_after text,
  p_clock_state jsonb,
  p_next_side text,
  p_rule_state_hash text,
  p_spent_ms integer default 0,
  p_event_payload jsonb default '{}'::jsonb
)
returns table (
  move_id uuid,
  match_id uuid,
  ply integer,
  revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_command public.chess_move_commands%rowtype;
  v_match public.chess_matches%rowtype;
  v_match_id uuid;
  v_move_id uuid;
  v_ply integer;
  v_revision bigint;
  v_position_hash text;
begin
  if p_command_id is null
    or p_fen_before is null
    or p_fen_after is null
    or jsonb_typeof(coalesce(p_clock_state, 'null'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_event_payload, 'null'::jsonb)) <> 'object' then
    raise exception 'INVALID_AUTHORITATIVE_MOVE' using errcode = '22023';
  end if;
  if p_next_side not in ('white', 'black')
    or p_rule_state_hash is null
    or char_length(p_rule_state_hash) not between 16 and 128 then
    raise exception 'INVALID_AUTHORITATIVE_RULE_STATE' using errcode = '22023';
  end if;
  if p_spent_ms not between 0 and 604800000 then
    raise exception 'INVALID_MOVE_DURATION' using errcode = '22023';
  end if;

  -- Resolve the parent without a row lock, then acquire locks in the same
  -- match -> command order as submit/finalize to avoid lock inversion.
  select command_row.match_id into v_match_id
  from public.chess_move_commands command_row
  where command_row.id = p_command_id;
  if not found then
    raise exception 'MOVE_COMMAND_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_match
  from public.chess_matches match_row
  where match_row.id = v_match_id
  for update;
  if not found then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_command
  from public.chess_move_commands command_row
  where command_row.id = p_command_id
    and command_row.match_id = v_match.id
  for update;
  if not found then
    raise exception 'MOVE_COMMAND_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_command.status = 'accepted' then
    return query
    select move_row.id, move_row.match_id, move_row.ply, move_row.revision
    from public.chess_match_moves move_row
    where move_row.match_id = v_command.match_id
      and move_row.actor_id = v_command.actor_id
      and move_row.client_move_id = v_command.client_command_id;
    return;
  end if;
  if v_command.status <> 'pending' or v_match.status <> 'active' then
    raise exception 'MOVE_COMMAND_NOT_COMMITTABLE' using errcode = '55000';
  end if;
  if v_command.expected_revision <> v_match.revision then
    raise exception 'STALE_MOVE_COMMAND' using errcode = '40001';
  end if;
  if v_match.current_fen <> p_fen_before then
    raise exception 'FEN_REVISION_MISMATCH' using errcode = '40001';
  end if;
  if (v_match.side_to_move = 'white' and v_match.white_player_id <> v_command.actor_id)
    or (v_match.side_to_move = 'black' and v_match.black_player_id <> v_command.actor_id) then
    raise exception 'COMMAND_ACTOR_MISMATCH' using errcode = '42501';
  end if;

  v_ply := v_match.ply_count + 1;
  v_revision := v_match.revision + 1;
  v_position_hash := encode(
    extensions.digest(convert_to(p_fen_after, 'UTF8'), 'sha256'),
    'hex'
  );
  insert into public.chess_match_moves (
    match_id, ply, revision, actor_id, client_move_id, command_sequence,
    side, next_side, uci, san, fen_before, fen_after, spent_ms,
    clock_state, rule_state_hash, position_hash
  ) values (
    v_match.id, v_ply, v_revision, v_command.actor_id,
    v_command.client_command_id, v_command.sequence,
    v_match.side_to_move, p_next_side, v_command.uci,
    nullif(left(trim(p_san), 64), ''), p_fen_before, p_fen_after,
    p_spent_ms, p_clock_state, p_rule_state_hash, v_position_hash
  ) returning id into v_move_id;

  update public.chess_matches
  set current_fen = p_fen_after,
      side_to_move = p_next_side,
      ply_count = v_ply,
      revision = v_revision,
      clock_state = p_clock_state,
      rule_state_hash = p_rule_state_hash,
      position_hash = v_position_hash,
      state = jsonb_set(
        state,
        '{ruleStateHash}',
        to_jsonb(p_rule_state_hash),
        true
      ),
      last_move_at = now()
  where id = v_match.id;

  update public.chess_move_commands as accepted_command
  set status = 'accepted', processed_at = now()
  where accepted_command.id = p_command_id;
  update public.chess_move_commands as pending_command
  set status = 'superseded', processed_at = now(),
      rejection_reason = 'authoritative revision already consumed'
  where pending_command.match_id = v_match.id
    and pending_command.expected_revision = v_match.revision
    and pending_command.id <> p_command_id
    and pending_command.status = 'pending';

  insert into public.chess_match_events (
    match_id, revision, event_type, actor_id, payload
  ) values (
    v_match.id,
    v_revision,
    'move_committed',
    v_command.actor_id,
    p_event_payload || jsonb_build_object(
      'moveId', v_move_id,
      'commandId', p_command_id,
      'clientMoveId', v_command.client_command_id,
      'sequence', v_revision + 1,
      'commandSequence', v_command.sequence,
      'revision', v_revision,
      'ply', v_ply,
      'side', v_match.side_to_move,
      'nextSide', p_next_side,
      'uci', v_command.uci,
      'san', nullif(left(trim(p_san), 64), ''),
      'from', substr(v_command.uci, 1, 2),
      'to', substr(v_command.uci, 3, 2),
      'durationMs', p_spent_ms,
      'fenBefore', p_fen_before,
      'fenAfter', p_fen_after,
      'clockState', p_clock_state,
      'clock_state', p_clock_state,
      'turnStartedAt', now(),
      'serverNow', now(),
      'ruleStateHash', p_rule_state_hash,
      'positionHash', v_position_hash,
      'rulesetHash', v_match.ruleset_hash,
      'matchSeed', v_match.shared_seed,
      'engineVersion', v_match.engine_version
    )
  );

  return query select v_move_id, v_match.id, v_ply, v_revision;
end;
$$;

revoke all on function public.commit_chess_move_server(
  uuid, text, text, text, jsonb, text, text, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.commit_chess_move_server(
  uuid, text, text, text, jsonb, text, text, integer, jsonb
) to service_role;

drop function if exists public.finalize_chess_match_server(
  uuid, text, text, text
);

create or replace function public.finalize_chess_match_server(
  p_match_id uuid,
  p_result text,
  p_termination text,
  p_verification_reference text,
  p_expected_revision bigint
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
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'EXPECTED_REVISION_REQUIRED' using errcode = '22023';
  end if;
  if p_verification_reference is null
    or char_length(trim(p_verification_reference)) not between 8 and 300 then
    raise exception 'AUTHORITATIVE_VERIFICATION_REQUIRED' using errcode = '22023';
  end if;
  if p_termination is null or char_length(trim(p_termination)) not between 2 and 100 then
    raise exception 'INVALID_TERMINATION' using errcode = '22023';
  end if;

  select * into v_match
  from public.chess_matches match_row
  where match_row.id = p_match_id
  for update;
  if not found then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_match.status = 'completed' then
    if v_match.result <> p_result
      or v_match.termination <> left(trim(p_termination), 100)
      or v_match.verification_reference <> trim(p_verification_reference)
      or v_match.revision <> p_expected_revision + 1 then
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
  if v_match.revision <> p_expected_revision then
    raise exception 'STALE_MATCH_REVISION' using errcode = '40001';
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

  update public.chess_move_commands as pending_command
  set status = 'superseded',
      processed_at = now(),
      rejection_reason = 'match finalized at authoritative revision'
  where pending_command.match_id = v_match.id
    and pending_command.expected_revision = p_expected_revision
    and pending_command.status = 'pending';

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
  uuid, text, text, text, bigint
) from public, anon, authenticated;
grant execute on function public.finalize_chess_match_server(
  uuid, text, text, text, bigint
) to service_role;

create or replace function private.chess_timeout_has_mating_material(
  p_fen text,
  p_claimant_side text
)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_board text := split_part(trim(p_fen), ' ', 1);
  v_minor_count integer;
begin
  if p_claimant_side not in ('white', 'black')
    or v_board = ''
    or v_board !~ '^[prnbqkPRNBQK1-8/]+$'
    or array_length(string_to_array(v_board, '/'), 1) <> 8 then
    raise exception 'INVALID_AUTHORITATIVE_POSITION' using errcode = '22023';
  end if;

  if p_claimant_side = 'white' then
    if v_board ~ '[PQR]' then
      return true;
    end if;
    v_minor_count :=
      char_length(v_board) - char_length(replace(v_board, 'B', ''))
      + char_length(v_board) - char_length(replace(v_board, 'N', ''));
  else
    if v_board ~ '[pqr]' then
      return true;
    end if;
    v_minor_count :=
      char_length(v_board) - char_length(replace(v_board, 'b', ''))
      + char_length(v_board) - char_length(replace(v_board, 'n', ''));
  end if;

  -- Chess.com-compatible timeout policy: K, K+B, and K+N draw; any
  -- rook/queen/pawn or at least two minor pieces (including two knights) wins.
  return v_minor_count >= 2;
end;
$$;

revoke all on function private.chess_timeout_has_mating_material(text, text)
  from public, anon, authenticated;

create or replace function public.finalize_chess_timeout_server(
  p_match_id uuid,
  p_expected_revision bigint,
  p_verification_reference text
)
returns table (
  finalized boolean,
  result text,
  termination text,
  white_rating integer,
  black_rating integer,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.chess_matches%rowtype;
  v_clock_ms bigint;
  v_elapsed_ms bigint;
  v_result text;
  v_termination text;
  v_claimant_side text;
  v_has_mating_material boolean;
  v_finalization record;
  v_white_after integer;
  v_black_after integer;
  v_now timestamptz;
begin
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'EXPECTED_REVISION_REQUIRED' using errcode = '22023';
  end if;
  if p_verification_reference is null
    or char_length(trim(p_verification_reference)) not between 8 and 300 then
    raise exception 'AUTHORITATIVE_VERIFICATION_REQUIRED' using errcode = '22023';
  end if;

  select * into v_match
  from public.chess_matches match_row
  where match_row.id = p_match_id
  for update;
  if not found then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_now := clock_timestamp();

  if v_match.state ->> 'rulesetType' is distinct from 'standard' then
    raise exception 'CUSTOM_RULES_VALIDATOR_NOT_AVAILABLE'
      using errcode = '55000';
  end if;

  v_claimant_side := case v_match.side_to_move
    when 'white' then 'black'
    else 'white'
  end;
  v_has_mating_material := private.chess_timeout_has_mating_material(
    v_match.current_fen,
    v_claimant_side
  );
  if v_has_mating_material then
    v_result := case v_claimant_side
      when 'white' then '1-0'
      else '0-1'
    end;
    v_termination := 'timeout';
  else
    v_result := '1/2-1/2';
    v_termination := 'timeout-insufficient-material';
  end if;

  if v_match.status = 'completed' then
    if v_match.result is distinct from v_result
      or v_match.termination is distinct from v_termination
      or v_match.verification_reference <> trim(p_verification_reference)
      or v_match.revision <> p_expected_revision + 1 then
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
    return query select false, v_match.result, v_match.termination,
      v_white_after, v_black_after, v_now;
    return;
  end if;

  if v_match.status <> 'active'
    or v_match.revision <> p_expected_revision
    or v_match.started_at is null then
    raise exception 'STALE_MATCH_REVISION' using errcode = '40001';
  end if;

  v_clock_ms := case v_match.side_to_move
    when 'white' then (v_match.clock_state ->> 'whiteMs')::bigint
    else (v_match.clock_state ->> 'blackMs')::bigint
  end;
  if v_clock_ms is null or v_clock_ms < 0 then
    raise exception 'INVALID_CLOCK_STATE' using errcode = '22023';
  end if;

  v_elapsed_ms := greatest(
    0,
    floor(extract(epoch from (
      v_now - coalesce(v_match.last_move_at, v_match.started_at)
    )) * 1000)::bigint
  );
  if v_clock_ms - v_elapsed_ms > 0 then
    raise exception 'CLOCK_NOT_EXPIRED' using errcode = '55000';
  end if;

  select * into v_finalization
  from public.finalize_chess_match_server(
    v_match.id,
    v_result,
    v_termination,
    p_verification_reference,
    p_expected_revision
  );

  return query select v_finalization.finalized, v_result, v_termination,
    v_finalization.white_rating, v_finalization.black_rating, v_now;
end;
$$;

revoke all on function public.finalize_chess_timeout_server(
  uuid, bigint, text
) from public, anon, authenticated;
grant execute on function public.finalize_chess_timeout_server(
  uuid, bigint, text
) to service_role;

create or replace function public.claim_chess_timeout(
  p_match_id uuid,
  p_expected_revision bigint
)
returns table (
  finalized boolean,
  result text,
  termination text,
  authoritative_revision bigint,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_match public.chess_matches%rowtype;
  v_claimant uuid;
  v_reference text;
  v_timeout record;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'EXPECTED_REVISION_REQUIRED' using errcode = '22023';
  end if;

  select * into v_match
  from public.chess_matches match_row
  where match_row.id = p_match_id
  for update;
  if not found then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_match.state ->> 'rulesetType' is distinct from 'standard' then
    raise exception 'CUSTOM_RULES_VALIDATOR_NOT_AVAILABLE' using errcode = '55000';
  end if;
  if v_match.status = 'active' and v_match.revision <> p_expected_revision then
    raise exception 'STALE_MATCH_REVISION' using errcode = '40001';
  end if;
  if v_match.status not in ('active', 'completed') then
    raise exception 'MATCH_NOT_TIMEOUT_CLAIMABLE' using errcode = '55000';
  end if;

  v_claimant := case v_match.side_to_move
    when 'white' then v_match.black_player_id
    else v_match.white_player_id
  end;
  if v_claimant is null or v_claimant <> v_user_id then
    raise exception 'TIMEOUT_OPPONENT_REQUIRED' using errcode = '42501';
  end if;

  v_reference := 'standard-timeout-claim-v1:' || encode(
    extensions.digest(
      convert_to(
        concat_ws(
          ':',
          'standard-timeout-claim-v1',
          v_match.id::text,
          p_expected_revision::text,
          v_match.current_fen,
          v_match.ruleset_hash
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select * into v_timeout
  from public.finalize_chess_timeout_server(
    v_match.id,
    p_expected_revision,
    v_reference
  );

  return query select v_timeout.finalized, v_timeout.result,
    v_timeout.termination, p_expected_revision + 1, v_timeout.server_now;
end;
$$;

revoke all on function public.claim_chess_timeout(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.claim_chess_timeout(uuid, bigint)
  to authenticated;

create or replace function public.resign_chess_match(
  p_match_id uuid,
  p_expected_revision bigint
)
returns table (
  finalized boolean,
  result text,
  termination text,
  authoritative_revision bigint,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_match public.chess_matches%rowtype;
  v_result text;
  v_reference text;
  v_finalization record;
  v_now timestamptz;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'EXPECTED_REVISION_REQUIRED' using errcode = '22023';
  end if;

  select * into v_match
  from public.chess_matches match_row
  where match_row.id = p_match_id
  for update;
  if not found then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_now := clock_timestamp();

  if v_user_id = v_match.white_player_id then
    v_result := '0-1';
  elsif v_user_id = v_match.black_player_id then
    v_result := '1-0';
  else
    raise exception 'MATCH_PARTICIPANT_REQUIRED' using errcode = '42501';
  end if;
  if v_match.status = 'active' and v_match.revision <> p_expected_revision then
    raise exception 'STALE_MATCH_REVISION' using errcode = '40001';
  end if;
  if v_match.status not in ('active', 'completed') then
    raise exception 'MATCH_NOT_RESIGNABLE' using errcode = '55000';
  end if;

  v_reference := 'player-resignation-v1:' || encode(
    extensions.digest(
      convert_to(
        concat_ws(
          ':',
          'player-resignation-v1',
          v_match.id::text,
          p_expected_revision::text,
          v_user_id::text,
          v_result,
          v_match.ruleset_hash
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select * into v_finalization
  from public.finalize_chess_match_server(
    v_match.id,
    v_result,
    'resignation',
    v_reference,
    p_expected_revision
  );

  return query select v_finalization.finalized, v_result,
    'resignation'::text, p_expected_revision + 1, v_now;
end;
$$;

revoke all on function public.resign_chess_match(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.resign_chess_match(uuid, bigint)
  to authenticated;

create or replace function public.commit_and_finalize_chess_move_server(
  p_command_id uuid,
  p_san text,
  p_fen_before text,
  p_fen_after text,
  p_clock_state jsonb,
  p_next_side text,
  p_rule_state_hash text,
  p_spent_ms integer default 0,
  p_event_payload jsonb default '{}'::jsonb,
  p_terminal_result text default null,
  p_terminal_termination text default null,
  p_verification_reference text default null
)
returns table (
  move_id uuid,
  match_id uuid,
  ply integer,
  move_revision bigint,
  authoritative_revision bigint,
  finalized boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_move record;
  v_finalization record;
  v_has_terminal boolean;
begin
  v_has_terminal := p_terminal_result is not null
    and p_terminal_termination is not null
    and p_verification_reference is not null;

  if v_has_terminal <> (
    p_terminal_result is not null
    or p_terminal_termination is not null
    or p_verification_reference is not null
  ) then
    raise exception 'INVALID_TERMINAL_ENVELOPE' using errcode = '22023';
  end if;

  select * into v_move
  from public.commit_chess_move_server(
    p_command_id,
    p_san,
    p_fen_before,
    p_fen_after,
    p_clock_state,
    p_next_side,
    p_rule_state_hash,
    p_spent_ms,
    p_event_payload
  );
  if not found then
    raise exception 'AUTHORITATIVE_COMMIT_FAILED' using errcode = '55000';
  end if;

  if v_has_terminal then
    select * into v_finalization
    from public.finalize_chess_match_server(
      v_move.match_id,
      p_terminal_result,
      p_terminal_termination,
      p_verification_reference,
      v_move.revision
    );

    return query select v_move.move_id, v_move.match_id, v_move.ply,
      v_move.revision, v_move.revision + 1, v_finalization.finalized;
    return;
  end if;

  return query select v_move.move_id, v_move.match_id, v_move.ply,
    v_move.revision, v_move.revision, false;
end;
$$;

revoke all on function public.commit_and_finalize_chess_move_server(
  uuid, text, text, text, jsonb, text, text, integer, jsonb,
  text, text, text
) from public, anon, authenticated;
grant execute on function public.commit_and_finalize_chess_move_server(
  uuid, text, text, text, jsonb, text, text, integer, jsonb,
  text, text, text
) to service_role;

notify pgrst, 'reload schema';

commit;
