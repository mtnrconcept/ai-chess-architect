begin;

insert into auth.users (id)
values
  ('d0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000003')
on conflict (id) do nothing;

insert into public.chess_rating_seasons (
  id, slug, name, status, starts_at, ends_at
)
values (
  'd0000000-0000-4000-8000-000000000010',
  'foundation-test-season',
  'Foundation test season',
  'active',
  now() - interval '1 day',
  now() + interval '1 day'
);

insert into public.chess_quests (
  id, slug, name, description, cadence, objective_type, target,
  xp_reward, starts_at, ends_at
)
values (
  'd0000000-0000-4000-8000-000000000011',
  'foundation-play-one',
  'Play one test game',
  'Complete one verified game.',
  'once',
  'games_played',
  1,
  20,
  now() - interval '1 day',
  now() + interval '1 day'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'd0000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $client_tests$
declare
  v_user_a constant uuid := 'd0000000-0000-4000-8000-000000000001';
  v_user_b constant uuid := 'd0000000-0000-4000-8000-000000000002';
  v_user_c constant uuid := 'd0000000-0000-4000-8000-000000000003';
  v_public_room uuid;
  v_public_room_again uuid;
  v_private_room uuid;
  v_match uuid;
  v_private_match uuid;
  v_token text;
  v_command uuid;
  v_command_again uuid;
  v_sequence bigint;
  v_revision bigint;
  v_ticket_b uuid;
  v_ticket_c uuid;
  v_queue_match uuid;
  v_status text;
begin
  select created.room_id into v_public_room
  from public.create_chess_room(
    'Public rated test',
    'public',
    'd0000000-0000-4000-8000-000000000100',
    '{}'::uuid[],
    true,
    600,
    5,
    'white'
  ) created;
  select created.room_id into v_public_room_again
  from public.create_chess_room(
    'Public rated test',
    'public',
    'd0000000-0000-4000-8000-000000000100',
    '{}'::uuid[],
    true,
    600,
    5,
    'white'
  ) created;
  if v_public_room is null or v_public_room_again <> v_public_room then
    raise exception 'ROOM_CREATION_MUST_BE_IDEMPOTENT';
  end if;

  select created.room_id into v_private_room
  from public.create_chess_room(
    'Private invitation test',
    'private',
    'd0000000-0000-4000-8000-000000000101',
    '{}'::uuid[],
    false,
    300,
    0,
    'black'
  ) created;
  select invitation.invitation_token into v_token
  from public.create_chess_room_invitation(
    v_private_room,
    v_user_b,
    60
  ) invitation;
  if v_token is null or char_length(v_token) <> 64 then
    raise exception 'INVITATION_TOKEN_NOT_RETURNED_ONCE';
  end if;

  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  if exists (
    select 1 from public.chess_rooms where id = v_private_room
  ) then
    raise exception 'PRIVATE_ROOM_VISIBLE_BEFORE_JOIN';
  end if;
  if not exists (
    select 1 from public.chess_rooms where id = v_public_room
  ) then
    raise exception 'PUBLIC_OPEN_ROOM_NOT_VISIBLE';
  end if;

  select joined.match_id into v_match
  from public.join_chess_room(v_public_room, null) joined;
  if v_match is null then
    raise exception 'PUBLIC_ROOM_DID_NOT_START_AT_CAPACITY';
  end if;
  select joined.match_id into v_private_match
  from public.join_chess_room(v_private_room, v_token) joined;
  if v_private_match is null then
    raise exception 'PRIVATE_INVITATION_DID_NOT_START_MATCH';
  end if;

  perform set_config('request.jwt.claim.sub', v_user_c::text, true);
  begin
    perform public.join_chess_room(v_public_room, null);
    raise exception 'THIRD_PLAYER_JOINED_FULL_ROOM';
  exception
    when serialization_failure then null;
  end;

  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  select command.command_id, command.command_sequence,
      command.authoritative_revision
    into v_command, v_sequence, v_revision
  from public.submit_chess_move_command(
    v_match,
    0,
    'd0000000-0000-4000-8000-000000000200',
    'e2e4',
    599000
  ) command;
  select command.command_id into v_command_again
  from public.submit_chess_move_command(
    v_match,
    0,
    'd0000000-0000-4000-8000-000000000200',
    'e2e4',
    599000
  ) command;
  if v_command is null or v_command_again <> v_command
    or v_sequence <> 1 or v_revision <> 0 then
    raise exception 'MOVE_COMMAND_IDEMPOTENCY_OR_SEQUENCE_FAILED';
  end if;

  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  begin
    perform public.submit_chess_move_command(
      v_match,
      0,
      'd0000000-0000-4000-8000-000000000201',
      'e7e5',
      599000
    );
    raise exception 'OUT_OF_TURN_COMMAND_ACCEPTED';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.chess_match_moves (
      match_id, ply, revision, actor_id, client_move_id, uci,
      fen_before, fen_after
    ) values (
      v_match, 1, 1, v_user_a,
      'd0000000-0000-4000-8000-000000000202',
      'e2e4', 'forbidden direct write', 'forbidden direct write'
    );
    raise exception 'DIRECT_MOVE_WRITE_ALLOWED';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.finalize_chess_match_server(
      v_match,
      '1-0',
      'test',
      'client-cannot-verify',
      0
    );
    raise exception 'CLIENT_FINALIZED_AUTHORITATIVE_RESULT';
  exception
    when insufficient_privilege then null;
  end;

  -- Sequential calls exercise the same serialized queue section used by
  -- concurrent callers; the second player must atomically consume the first.
  select queued.ticket_id, queued.ticket_status
    into v_ticket_b, v_status
  from public.enqueue_chess_matchmaking(
    'd0000000-0000-4000-8000-000000000300',
    '{}'::uuid[], false, 180, 0, 200
  ) queued;
  if v_status <> 'queued' then
    raise exception 'FIRST_MATCHMAKING_TICKET_NOT_QUEUED';
  end if;

  perform set_config('request.jwt.claim.sub', v_user_c::text, true);
  select queued.ticket_id, queued.ticket_status, queued.match_id
    into v_ticket_c, v_status, v_queue_match
  from public.enqueue_chess_matchmaking(
    'd0000000-0000-4000-8000-000000000301',
    '{}'::uuid[], false, 180, 0, 200
  ) queued;
  if v_status <> 'matched' or v_queue_match is null then
    raise exception 'SECOND_MATCHMAKING_TICKET_NOT_MATCHED';
  end if;
  if not exists (
    select 1 from public.chess_matchmaking_tickets ticket_row
    where ticket_row.id = v_ticket_c
      and ticket_row.matched_match_id = v_queue_match
  ) then
    raise exception 'MATCHMAKING_RESULT_NOT_VISIBLE_TO_SECOND_PLAYER';
  end if;

  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  if not exists (
    select 1 from public.chess_matchmaking_tickets ticket_row
    where ticket_row.id = v_ticket_b
      and ticket_row.status = 'matched'
      and ticket_row.matched_match_id = v_queue_match
  ) then
    raise exception 'MATCHMAKING_CANDIDATE_NOT_ATOMICALLY_UPDATED';
  end if;
end;
$client_tests$;

reset role;
set local role service_role;

do $server_tests$
declare
  v_user_a constant uuid := 'd0000000-0000-4000-8000-000000000001';
  v_user_b constant uuid := 'd0000000-0000-4000-8000-000000000002';
  v_match uuid;
  v_command uuid;
  v_move uuid;
  v_revision bigint;
  v_finalized boolean;
  v_white_rating integer;
  v_black_rating integer;
begin
  select match_row.id into v_match
  from public.chess_matches match_row
  join public.chess_rooms room_row on room_row.id = match_row.room_id
  where room_row.owner_id = v_user_a
    and room_row.request_key = 'd0000000-0000-4000-8000-000000000100';
  select command_row.id into v_command
  from public.chess_move_commands command_row
  where command_row.match_id = v_match
    and command_row.client_command_id =
      'd0000000-0000-4000-8000-000000000200';

  select committed.move_id, committed.revision
    into v_move, v_revision
  from public.commit_chess_move_server(
    v_command,
    'e4',
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    '{"whiteMs":599000,"blackMs":600000,"incrementMs":5000}'::jsonb,
    'white',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    1000,
    '{"validatedBy":"test-engine"}'::jsonb
  ) committed;
  if v_move is null or v_revision <> 1 then
    raise exception 'AUTHORITATIVE_MOVE_COMMIT_FAILED';
  end if;
  if not exists (
    select 1 from public.chess_matches match_row
    where match_row.id = v_match and match_row.side_to_move = 'white'
  ) then
    raise exception 'SERVER_VALIDATED_EXTRA_TURN_WAS_OVERRIDDEN';
  end if;
  if (select count(*) from public.chess_match_events where match_id = v_match) <> 2 then
    raise exception 'MOVE_EVENT_NOT_APPENDED_EXACTLY_ONCE';
  end if;
  if not exists (
    select 1 from public.chess_match_events event_row
    where event_row.match_id = v_match
      and event_row.revision = 1
      and event_row.sequence = 2
      and event_row.payload ->> 'nextSide' = 'white'
      and event_row.payload ->> 'clientMoveId' =
        'd0000000-0000-4000-8000-000000000200'
      and event_row.payload ? 'clockState'
      and event_row.payload ? 'ruleStateHash'
      and event_row.payload ? 'positionHash'
  ) then
    raise exception 'MOVE_EVENT_REPLAY_PAYLOAD_INCOMPLETE';
  end if;

  select finalized.finalized, finalized.white_rating,
      finalized.black_rating
    into v_finalized, v_white_rating, v_black_rating
  from public.finalize_chess_match_server(
    v_match,
    '1-0',
    'resignation',
    'test-engine-signature-0001',
    1
  ) finalized;
  if not v_finalized or v_white_rating <> 1216 or v_black_rating <> 1184 then
    raise exception 'VERIFIED_ELO_UPDATE_FAILED: %, %, %',
      v_finalized, v_white_rating, v_black_rating;
  end if;
  if not exists (
    select 1 from public.chess_matches match_row
    where match_row.id = v_match
      and match_row.verification_status = 'verified'
      and match_row.rating_processed_at is not null
  ) then
    raise exception 'MATCH_VERIFICATION_GATE_NOT_PERSISTED';
  end if;
  if (select count(*) from public.chess_rating_history where match_id = v_match) <> 2 then
    raise exception 'RATING_HISTORY_NOT_AUDITABLE';
  end if;
end;
$server_tests$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'd0000000-0000-4000-8000-000000000001',
  true
);

do $progress_and_puzzle_tests$
declare
  v_user_a constant uuid := 'd0000000-0000-4000-8000-000000000001';
  v_puzzle constant uuid := 'c4000000-0000-4000-8000-000000000001';
  v_available boolean;
  v_solved boolean;
  v_xp integer;
  v_match uuid;
  v_snapshot_sequence bigint;
  v_snapshot_side text;
  v_replay_count integer;
begin
  if not exists (
    select 1 from public.chess_player_ratings rating_row
    where rating_row.user_id = v_user_a and rating_row.rating = 1216
  ) then
    raise exception 'PLAYER_CANNOT_READ_OWN_RATING';
  end if;
  if not exists (
    select 1 from public.chess_player_progress progress_row
    where progress_row.user_id = v_user_a
      and progress_row.games_played = 1
      and progress_row.wins = 1
      and progress_row.total_xp = 25
  ) then
    raise exception 'VERIFIED_GAME_PROGRESS_NOT_AWARDED';
  end if;
  if not exists (
    select 1 from public.chess_player_badges player_badge
    join public.chess_badges badge on badge.id = player_badge.badge_id
    where player_badge.user_id = v_user_a and badge.slug = 'first-win'
  ) then
    raise exception 'FIRST_WIN_BADGE_NOT_AWARDED';
  end if;

  select match_row.id into v_match
  from public.chess_matches match_row
  join public.chess_rooms room_row on room_row.id = match_row.room_id
  where room_row.request_key = 'd0000000-0000-4000-8000-000000000100';
  select snapshot.event_sequence, snapshot.side_to_move
    into v_snapshot_sequence, v_snapshot_side
  from public.get_chess_match_snapshot(v_match) snapshot;
  if v_snapshot_sequence <> 3 or v_snapshot_side <> 'white' then
    raise exception 'MATCH_SNAPSHOT_NOT_AUTHORITATIVE';
  end if;
  select count(*) into v_replay_count
  from public.get_chess_match_events_since(v_match, -1, 100);
  if v_replay_count <> 3 then
    raise exception 'MATCH_EVENT_REPLAY_NOT_CONTIGUOUS';
  end if;
  perform public.heartbeat_chess_room(
    (select room_id from public.chess_matches where id = v_match),
    2
  );

  select puzzle.available into v_available
  from public.get_daily_chess_puzzle(date '2026-07-20') puzzle;
  if not v_available then
    raise exception 'CURATED_DAILY_PUZZLE_MISSING';
  end if;
  select puzzle.available into v_available
  from public.get_daily_chess_puzzle(date '2099-01-01') puzzle;
  if v_available then
    raise exception 'MISSING_PUZZLE_MUST_RETURN_EXPLICIT_EMPTY_STATE';
  end if;

  select attempt.solved, attempt.xp_awarded into v_solved, v_xp
  from public.submit_daily_chess_puzzle(
    v_puzzle,
    array['f7f8'],
    2500
  ) attempt;
  if not v_solved or v_xp <> 30 then
    raise exception 'DAILY_PUZZLE_SOLUTION_NOT_REWARDED';
  end if;
  select attempt.xp_awarded into v_xp
  from public.submit_daily_chess_puzzle(
    v_puzzle,
    array['f7f8'],
    2500
  ) attempt;
  if v_xp <> 0 then
    raise exception 'PUZZLE_XP_IDEMPOTENCY_FAILED';
  end if;

  begin
    perform 1 from public.chess_daily_puzzles;
    raise exception 'PUZZLE_SOLUTION_TABLE_EXPOSED_TO_CLIENT';
  exception
    when insufficient_privilege then null;
  end;
  begin
    update public.chess_player_ratings set rating = 4000
    where user_id = v_user_a;
    raise exception 'CLIENT_DIRECTLY_CHANGED_ELO';
  exception
    when insufficient_privilege then null;
  end;
end;
$progress_and_puzzle_tests$;

reset role;

do $security_catalog_tests$
declare
  v_expected_tables constant integer := 20;
  v_tables constant text[] := array[
    'chess_rating_seasons',
    'chess_rooms',
    'chess_room_members',
    'chess_room_rule_versions',
    'chess_room_invitations',
    'chess_matches',
    'chess_move_commands',
    'chess_match_moves',
    'chess_match_events',
    'chess_player_ratings',
    'chess_rating_history',
    'chess_player_progress',
    'chess_xp_events',
    'chess_badges',
    'chess_player_badges',
    'chess_quests',
    'chess_player_quests',
    'chess_daily_puzzles',
    'chess_puzzle_attempts',
    'chess_matchmaking_tickets'
  ];
  v_functions constant text[] := array[
    'chess_platform_touch_updated_at',
    'is_current_user_chess_room_member',
    'enforce_chess_custom_runtime_gate',
    'chess_timeout_has_mating_material',
    'compute_chess_ruleset_hash',
    'create_chess_room',
    'list_open_chess_rooms',
    'create_chess_room_invitation',
    'create_chess_match_internal',
    'join_chess_room',
    'get_chess_match_snapshot',
    'get_chess_match_events_since',
    'heartbeat_chess_room',
    'request_chess_match_abandonment',
    'submit_chess_move_command',
    'commit_chess_move_server',
    'commit_and_finalize_chess_move_server',
    'reject_chess_move_command_server',
    'finalize_chess_timeout_server',
    'claim_chess_timeout',
    'resign_chess_match',
    'enqueue_chess_matchmaking',
    'cancel_chess_matchmaking',
    'grant_chess_xp_internal',
    'award_chess_badge_internal',
    'advance_chess_quests_internal',
    'apply_verified_game_progress_internal',
    'finalize_chess_match_server',
    'get_chess_leaderboard',
    'claim_chess_quest',
    'get_daily_chess_puzzle',
    'submit_daily_chess_puzzle',
    'cleanup_chess_matchmaking_server'
  ];
  v_count integer;
begin
  select count(*) into v_count
  from pg_catalog.pg_class class_row
  join pg_catalog.pg_namespace namespace_row
    on namespace_row.oid = class_row.relnamespace
  where namespace_row.nspname = 'public'
    and class_row.relname = any(v_tables)
    and class_row.relkind = 'r'
    and class_row.relrowsecurity;
  if v_count <> v_expected_tables then
    raise exception 'NOT_ALL_CHESS_TABLES_HAVE_RLS: %', v_count;
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants table_grant
    where table_grant.grantee = 'authenticated'
      and table_grant.table_schema = 'public'
      and table_grant.table_name = any(v_tables)
      and table_grant.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  ) then
    raise exception 'CLIENT_HAS_DIRECT_CHESS_WRITE_GRANT';
  end if;

  if has_table_privilege(
    'service_role', 'public.chess_match_moves', 'INSERT'
  ) or has_table_privilege(
    'service_role', 'public.chess_match_moves', 'UPDATE'
  ) or has_table_privilege(
    'service_role', 'public.chess_match_moves', 'DELETE'
  ) or has_table_privilege(
    'service_role', 'public.chess_match_moves', 'TRUNCATE'
  ) or has_table_privilege(
    'service_role', 'public.chess_match_events', 'INSERT'
  ) or has_table_privilege(
    'service_role', 'public.chess_match_events', 'UPDATE'
  ) or has_table_privilege(
    'service_role', 'public.chess_match_events', 'DELETE'
  ) or has_table_privilege(
    'service_role', 'public.chess_match_events', 'TRUNCATE'
  ) or not has_table_privilege(
    'service_role', 'public.chess_match_moves', 'SELECT'
  ) or not has_table_privilege(
    'service_role', 'public.chess_match_events', 'SELECT'
  ) then
    raise exception 'SERVICE_ROLE_MATCH_JOURNAL_ACL_INVALID';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.commit_chess_move_server(uuid,text,text,text,jsonb,text,text,integer,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.finalize_chess_match_server(uuid,text,text,text,bigint)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.finalize_chess_timeout_server(uuid,bigint,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.commit_and_finalize_chess_move_server(uuid,text,text,text,jsonb,text,text,integer,jsonb,text,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.reject_chess_move_command_server(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'SERVER_ONLY_RPC_EXPOSED_TO_AUTHENTICATED';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = function_row.pronamespace
    where namespace_row.nspname in ('public', 'private')
      and function_row.proname = any(v_functions)
      and function_row.prosecdef
      and not exists (
        select 1
        from unnest(coalesce(function_row.proconfig, '{}'::text[])) config
        where config like 'search_path=%'
      )
  ) then
    raise exception 'SECURITY_DEFINER_WITHOUT_EMPTY_SEARCH_PATH';
  end if;
end;
$security_catalog_tests$;

rollback;
