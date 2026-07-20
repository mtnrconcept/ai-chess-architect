begin;

insert into auth.users (id)
values
  ('e0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

do $timeout_material_policy_tests$
begin
  if private.chess_timeout_has_mating_material(
    '7k/8/8/8/8/8/8/K7 w - - 0 1',
    'white'
  ) then
    raise exception 'KING_ALONE_WAS_TREATED_AS_MATING_MATERIAL';
  end if;
  if not private.chess_timeout_has_mating_material(
    '7k/8/8/8/8/8/8/KNN5 w - - 0 1',
    'white'
  ) then
    raise exception 'TWO_KNIGHTS_WERE_NOT_TREATED_AS_MATING_MATERIAL';
  end if;
end;
$timeout_material_policy_tests$;

insert into public.rule_compilations (
  id, user_id, prompt, prompt_hash, model, status, blueprint,
  compiled_rule, content_hash, request_key
) values (
  'e0000000-0000-4000-8000-000000000300',
  'e0000000-0000-4000-8000-000000000001',
  'Custom gate SQL test',
  repeat('a', 64),
  'test-model',
  'published',
  '{}'::jsonb,
  '{}'::jsonb,
  repeat('b', 64),
  'e0000000-0000-4000-8000-000000000301'
);
insert into public.rule_blueprints (
  id, owner_id, rule_key, title, description, category, visibility
) values (
  'e0000000-0000-4000-8000-000000000302',
  'e0000000-0000-4000-8000-000000000001',
  'custom-gate-test',
  'Custom gate test',
  'Rule version used only to verify the multiplayer runtime gate.',
  'test',
  'public'
);
insert into public.rule_versions (
  id, blueprint_id, compilation_id, version_number, schema_version,
  engine_version, legacy_rule_id, blueprint_json, rule_json,
  content_hash, visibility, created_by
) values (
  'e0000000-0000-4000-8000-000000000303',
  'e0000000-0000-4000-8000-000000000302',
  'e0000000-0000-4000-8000-000000000300',
  1,
  '2.0.0',
  '2.0.0',
  'custom-gate-test-v1',
  '{}'::jsonb,
  '{}'::jsonb,
  repeat('c', 64),
  'public',
  'e0000000-0000-4000-8000-000000000001'
);
update public.rule_blueprints
set current_version_id = 'e0000000-0000-4000-8000-000000000303'
where id = 'e0000000-0000-4000-8000-000000000302';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e0000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $custom_room_runtime_gate_test$
begin
  begin
    perform public.create_chess_room(
      'Custom room must fail',
      'public',
      'e0000000-0000-4000-8000-000000000304',
      array['e0000000-0000-4000-8000-000000000303'::uuid],
      false,
      600,
      0,
      'white'
    );
    raise exception 'CUSTOM_ROOM_CREATED_WITHOUT_RUNTIME';
  exception
    when object_not_in_prerequisite_state then
      if sqlerrm not like '%CUSTOM_RULES_VALIDATOR_NOT_AVAILABLE%' then
        raise;
      end if;
  end;
end;
$custom_room_runtime_gate_test$;

do $create_standard_cas_match$
declare
  v_room uuid;
begin
  select created.room_id into v_room
  from public.create_chess_room(
    'CAS standard match',
    'public',
    'e0000000-0000-4000-8000-000000000100',
    '{}'::uuid[],
    false,
    600,
    0,
    'white'
  ) created;

  perform set_config(
    'request.jwt.claim.sub',
    'e0000000-0000-4000-8000-000000000002',
    true
  );
  perform public.join_chess_room(v_room, null);
  perform set_config(
    'request.jwt.claim.sub',
    'e0000000-0000-4000-8000-000000000001',
    true
  );

  perform public.submit_chess_move_command(
    (select id from public.chess_matches where room_id = v_room),
    0,
    'e0000000-0000-4000-8000-000000000200',
    'e2e4',
    null
  );

  begin
    perform public.submit_chess_move_command(
      (select id from public.chess_matches where room_id = v_room),
      0,
      'e0000000-0000-4000-8000-000000000201',
      'd2d4',
      null
    );
    raise exception 'SECOND_PENDING_COMMAND_ACCEPTED';
  exception
    when object_not_in_prerequisite_state then
      if sqlerrm not like '%MOVE_ALREADY_PENDING%' then
        raise;
      end if;
  end;
end;
$create_standard_cas_match$;

reset role;
set local role service_role;

do $commit_and_cas_tests$
declare
  v_match uuid;
  v_command uuid;
  v_move uuid;
  v_move_revision bigint;
  v_authoritative_revision bigint;
  v_finalized boolean;
begin
  select match_row.id into v_match
  from public.chess_matches match_row
  join public.chess_rooms room_row on room_row.id = match_row.room_id
  where room_row.request_key = 'e0000000-0000-4000-8000-000000000100';
  select command_row.id into v_command
  from public.chess_move_commands command_row
  where command_row.match_id = v_match
    and command_row.client_command_id =
      'e0000000-0000-4000-8000-000000000200';

  select committed.move_id, committed.move_revision,
      committed.authoritative_revision
    into v_move, v_move_revision, v_authoritative_revision
  from public.commit_and_finalize_chess_move_server(
    v_command,
    'e4',
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    '{"whiteMs":599000,"blackMs":600000,"incrementMs":0}'::jsonb,
    'black',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    1000,
    '{"validatedBy":"terminal-cas-test"}'::jsonb,
    null,
    null,
    null
  ) committed;
  if v_move is null or v_move_revision <> 1 or v_authoritative_revision <> 1 then
    raise exception 'COMBINED_NON_TERMINAL_COMMIT_FAILED';
  end if;

  begin
    perform public.finalize_chess_match_server(
      v_match,
      '1-0',
      'resignation',
      'terminal-cas-stale-reference',
      0
    );
    raise exception 'STALE_FINALIZATION_ACCEPTED';
  exception
    when serialization_failure then null;
  end;

  select finalized.finalized into v_finalized
  from public.finalize_chess_match_server(
    v_match,
    '1-0',
    'resignation',
    'terminal-cas-valid-reference',
    1
  ) finalized;
  if not v_finalized then
    raise exception 'CAS_FINALIZATION_DID_NOT_COMPLETE';
  end if;

  begin
    perform public.finalize_chess_match_server(
      v_match,
      '1-0',
      'checkmate',
      'terminal-cas-valid-reference',
      1
    );
    raise exception 'FINALIZATION_TERMINATION_CONFLICT_ACCEPTED';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  -- Idempotent replay resolves the accepted command without another move.
  select committed.move_id, committed.move_revision
    into v_move, v_move_revision
  from public.commit_and_finalize_chess_move_server(
    v_command,
    'e4',
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    '{"whiteMs":599000,"blackMs":600000,"incrementMs":0}'::jsonb,
    'black',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    1000,
    '{}'::jsonb,
    null,
    null,
    null
  ) committed;
  if v_move is null or v_move_revision <> 1 then
    raise exception 'COMBINED_COMMIT_REPLAY_NOT_IDEMPOTENT';
  end if;
end;
$commit_and_cas_tests$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e0000000-0000-4000-8000-000000000001',
  true
);

do $create_timeout_match$
declare
  v_room uuid;
begin
  select created.room_id into v_room
  from public.create_chess_room(
    'CAS timeout match',
    'public',
    'e0000000-0000-4000-8000-000000000101',
    '{}'::uuid[],
    false,
    30,
    0,
    'white'
  ) created;
  perform set_config(
    'request.jwt.claim.sub',
    'e0000000-0000-4000-8000-000000000002',
    true
  );
  perform public.join_chess_room(v_room, null);
  perform set_config(
    'request.jwt.claim.sub',
    'e0000000-0000-4000-8000-000000000001',
    true
  );
  perform public.submit_chess_move_command(
    (select id from public.chess_matches where room_id = v_room),
    0,
    'e0000000-0000-4000-8000-000000000210',
    'e2e4',
    null
  );
end;
$create_timeout_match$;

reset role;

update public.chess_matches match_row
set clock_state = jsonb_build_object(
      'whiteMs', 1,
      'blackMs', 30000,
      'incrementMs', 0
    ),
    started_at = now() - interval '2 seconds',
    last_move_at = null
from public.chess_rooms room_row
where room_row.id = match_row.room_id
  and room_row.request_key = 'e0000000-0000-4000-8000-000000000101';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e0000000-0000-4000-8000-000000000001',
  true
);

do $timeout_claimant_guard_test$
declare
  v_match uuid;
begin
  select match_row.id into v_match
  from public.chess_matches match_row
  join public.chess_rooms room_row on room_row.id = match_row.room_id
  where room_row.request_key = 'e0000000-0000-4000-8000-000000000101';
  begin
    perform public.claim_chess_timeout(v_match, 0);
    raise exception 'EXPIRED_PLAYER_CLAIMED_OWN_TIMEOUT';
  exception
    when insufficient_privilege then null;
  end;
end;
$timeout_claimant_guard_test$;

select set_config(
  'request.jwt.claim.sub',
  'e0000000-0000-4000-8000-000000000002',
  true
);

do $authenticated_timeout_claim_test$
declare
  v_match uuid;
  v_finalized boolean;
  v_result text;
begin
  select match_row.id into v_match
  from public.chess_matches match_row
  join public.chess_rooms room_row on room_row.id = match_row.room_id
  where room_row.request_key = 'e0000000-0000-4000-8000-000000000101';
  select claim.finalized, claim.result into v_finalized, v_result
  from public.claim_chess_timeout(v_match, 0) claim;
  if not v_finalized or v_result <> '0-1' then
    raise exception 'AUTHENTICATED_OPPONENT_TIMEOUT_CLAIM_FAILED';
  end if;
end;
$authenticated_timeout_claim_test$;

reset role;
set local role service_role;

do $timeout_cas_tests$
declare
  v_match uuid;
  v_finalized boolean;
  v_result text;
  v_reference text;
begin
  select match_row.id into v_match
  from public.chess_matches match_row
  join public.chess_rooms room_row on room_row.id = match_row.room_id
  where room_row.request_key = 'e0000000-0000-4000-8000-000000000101';

  if not exists (
    select 1 from public.chess_matches match_row
    where match_row.id = v_match
      and match_row.status = 'completed'
      and match_row.revision = 1
      and match_row.result = '0-1'
      and match_row.termination = 'timeout'
  ) then
    raise exception 'TIMEOUT_RESULT_NOT_PERSISTED';
  end if;
  if not exists (
    select 1 from public.chess_move_commands command_row
    where command_row.match_id = v_match
      and command_row.expected_revision = 0
      and command_row.status = 'superseded'
  ) then
    raise exception 'TIMEOUT_DID_NOT_CLOSE_PENDING_COMMAND';
  end if;

  select verification_reference into v_reference
  from public.chess_matches where id = v_match;
  select timeout.finalized, timeout.result into v_finalized, v_result
  from public.finalize_chess_timeout_server(
    v_match,
    0,
    v_reference
  ) timeout;
  if v_finalized or v_result <> '0-1' then
    raise exception 'TIMEOUT_REPLAY_WAS_NOT_IDEMPOTENT';
  end if;
end;
$timeout_cas_tests$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e0000000-0000-4000-8000-000000000001',
  true
);

do $create_insufficient_material_timeout_match$
declare
  v_room uuid;
begin
  select created.room_id into v_room
  from public.create_chess_room(
    'Insufficient material timeout',
    'public',
    'e0000000-0000-4000-8000-000000000105',
    '{}'::uuid[],
    false,
    30,
    0,
    'white'
  ) created;
  perform set_config(
    'request.jwt.claim.sub',
    'e0000000-0000-4000-8000-000000000002',
    true
  );
  perform public.join_chess_room(v_room, null);
end;
$create_insufficient_material_timeout_match$;

reset role;

update public.chess_matches match_row
set current_fen = '7k/8/8/8/8/8/8/K7 w - - 0 1',
    position_hash = encode(
      extensions.digest(
        convert_to('7k/8/8/8/8/8/8/K7 w - - 0 1', 'UTF8'),
        'sha256'
      ),
      'hex'
    ),
    clock_state = jsonb_build_object(
      'whiteMs', 1,
      'blackMs', 30000,
      'incrementMs', 0
    ),
    started_at = now() - interval '2 seconds',
    last_move_at = null
from public.chess_rooms room_row
where room_row.id = match_row.room_id
  and room_row.request_key = 'e0000000-0000-4000-8000-000000000105';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e0000000-0000-4000-8000-000000000002',
  true
);

do $insufficient_material_timeout_claim_test$
declare
  v_match uuid;
  v_finalized boolean;
  v_result text;
  v_termination text;
begin
  select match_row.id into v_match
  from public.chess_matches match_row
  join public.chess_rooms room_row on room_row.id = match_row.room_id
  where room_row.request_key = 'e0000000-0000-4000-8000-000000000105';

  select claim.finalized, claim.result, claim.termination
    into v_finalized, v_result, v_termination
  from public.claim_chess_timeout(v_match, 0) claim;
  if not v_finalized
    or v_result <> '1/2-1/2'
    or v_termination <> 'timeout-insufficient-material' then
    raise exception 'INSUFFICIENT_MATERIAL_TIMEOUT_WAS_NOT_A_DRAW';
  end if;
end;
$insufficient_material_timeout_claim_test$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e0000000-0000-4000-8000-000000000001',
  true
);

do $create_atomic_terminal_match$
declare
  v_room uuid;
begin
  select created.room_id into v_room
  from public.create_chess_room(
    'Atomic terminal match',
    'public',
    'e0000000-0000-4000-8000-000000000102',
    '{}'::uuid[],
    false,
    600,
    0,
    'white'
  ) created;
  perform set_config(
    'request.jwt.claim.sub',
    'e0000000-0000-4000-8000-000000000002',
    true
  );
  perform public.join_chess_room(v_room, null);
end;
$create_atomic_terminal_match$;

reset role;

update public.chess_matches match_row
set current_fen = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',
    position_hash = encode(
      extensions.digest(
        convert_to('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', 'UTF8'),
        'sha256'
      ),
      'hex'
    )
from public.chess_rooms room_row
where room_row.id = match_row.room_id
  and room_row.request_key = 'e0000000-0000-4000-8000-000000000102';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e0000000-0000-4000-8000-000000000001',
  true
);
select public.submit_chess_move_command(
  (
    select match_row.id
    from public.chess_matches match_row
    join public.chess_rooms room_row on room_row.id = match_row.room_id
    where room_row.request_key = 'e0000000-0000-4000-8000-000000000102'
  ),
  0,
  'e0000000-0000-4000-8000-000000000220',
  'f7g7',
  null
);

reset role;
set local role service_role;

do $atomic_terminal_tests$
declare
  v_match uuid;
  v_command uuid;
  v_move_revision bigint;
  v_authoritative_revision bigint;
begin
  select match_row.id into v_match
  from public.chess_matches match_row
  join public.chess_rooms room_row on room_row.id = match_row.room_id
  where room_row.request_key = 'e0000000-0000-4000-8000-000000000102';
  select id into v_command
  from public.chess_move_commands
  where match_id = v_match and client_command_id =
    'e0000000-0000-4000-8000-000000000220';

  begin
    perform public.commit_and_finalize_chess_move_server(
      v_command,
      'Qg7#',
      '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',
      '7k/6Q1/6K1/8/8/8/8/8 b - - 1 1',
      '{"whiteMs":599000,"blackMs":600000,"incrementMs":0}'::jsonb,
      'black',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      1000,
      '{}'::jsonb,
      'invalid',
      'checkmate',
      'terminal-cas-invalid-result'
    );
    raise exception 'INVALID_TERMINAL_COMMIT_ACCEPTED';
  exception
    when invalid_parameter_value then null;
  end;

  if (select revision from public.chess_matches where id = v_match) <> 0
    or exists (select 1 from public.chess_match_moves where match_id = v_match)
    or not exists (
      select 1 from public.chess_move_commands
      where id = v_command and status = 'pending'
    ) then
    raise exception 'FAILED_TERMINAL_FINALIZATION_DID_NOT_ROLL_BACK_COMMIT';
  end if;

  select committed.move_revision, committed.authoritative_revision
    into v_move_revision, v_authoritative_revision
  from public.commit_and_finalize_chess_move_server(
    v_command,
    'Qg7#',
    '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',
    '7k/6Q1/6K1/8/8/8/8/8 b - - 1 1',
    '{"whiteMs":599000,"blackMs":600000,"incrementMs":0}'::jsonb,
    'black',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    1000,
    '{}'::jsonb,
    '1-0',
    'checkmate',
    'terminal-cas-checkmate-reference'
  ) committed;
  if v_move_revision <> 1 or v_authoritative_revision <> 2 then
    raise exception 'TERMINAL_COMMIT_NOT_ATOMIC';
  end if;
  if not exists (
    select 1 from public.chess_matches
    where id = v_match and status = 'completed' and revision = 2
      and result = '1-0' and termination = 'checkmate'
  ) then
    raise exception 'ATOMIC_TERMINAL_STATE_NOT_PERSISTED';
  end if;
  if (
    select array_agg(revision order by revision)
    from public.chess_match_events where match_id = v_match
  ) <> array[0::bigint, 1::bigint, 2::bigint] then
    raise exception 'ATOMIC_TERMINAL_EVENTS_NOT_CONTIGUOUS';
  end if;
end;
$atomic_terminal_tests$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e0000000-0000-4000-8000-000000000001',
  true
);

do $authenticated_resignation_setup$
declare
  v_room uuid;
begin
  select created.room_id into v_room
  from public.create_chess_room(
    'Atomic resignation match',
    'public',
    'e0000000-0000-4000-8000-000000000103',
    '{}'::uuid[],
    false,
    600,
    0,
    'white'
  ) created;
  perform set_config(
    'request.jwt.claim.sub',
    'e0000000-0000-4000-8000-000000000002',
    true
  );
  perform public.join_chess_room(v_room, null);
end;
$authenticated_resignation_setup$;

reset role;

with resignation_match as (
  select match_row.id
  from public.chess_matches match_row
  join public.chess_rooms room_row on room_row.id = match_row.room_id
  where room_row.request_key = 'e0000000-0000-4000-8000-000000000103'
)
insert into public.chess_move_commands (
  match_id, actor_id, client_command_id, sequence, expected_revision,
  uci, status, rejection_reason, processed_at
)
select resignation_match.id,
  'e0000000-0000-4000-8000-000000000001',
  gen_random_uuid(), attempt_number, 0, 'e2e4', 'rejected',
  'rate-limit-test', now()
from resignation_match
cross join generate_series(1, 32) attempt_number;

update public.chess_matches match_row
set command_sequence = 32
from public.chess_rooms room_row
where room_row.id = match_row.room_id
  and room_row.request_key = 'e0000000-0000-4000-8000-000000000103';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'e0000000-0000-4000-8000-000000000001',
  true
);

do $authenticated_resignation_test$
declare
  v_match uuid;
  v_finalized boolean;
  v_result text;
  v_termination text;
  v_revision bigint;
begin
  select match_row.id into v_match
  from public.chess_matches match_row
  join public.chess_rooms room_row on room_row.id = match_row.room_id
  where room_row.request_key = 'e0000000-0000-4000-8000-000000000103';

  begin
    perform public.submit_chess_move_command(
      v_match,
      0,
      'e0000000-0000-4000-8000-000000000230',
      'e2e4',
      null
    );
    raise exception 'COMMAND_RATE_LIMIT_NOT_ENFORCED';
  exception
    when object_not_in_prerequisite_state then
      if sqlerrm not like '%COMMAND_RATE_LIMITED%' then
        raise;
      end if;
  end;

  select resignation.finalized, resignation.result,
      resignation.termination, resignation.authoritative_revision
    into v_finalized, v_result, v_termination, v_revision
  from public.resign_chess_match(v_match, 0) resignation;
  if not v_finalized or v_result <> '0-1'
    or v_termination <> 'resignation' or v_revision <> 1 then
    raise exception 'AUTHENTICATED_RESIGNATION_FAILED';
  end if;
  if not exists (
    select 1 from public.chess_matches match_row
    where match_row.id = v_match
      and match_row.status = 'completed'
      and match_row.result = '0-1'
      and match_row.termination = 'resignation'
      and match_row.revision = 1
  ) then
    raise exception 'RESIGNATION_RESULT_NOT_PERSISTED';
  end if;

  select resignation.finalized into v_finalized
  from public.resign_chess_match(v_match, 0) resignation;
  if v_finalized then
    raise exception 'RESIGNATION_REPLAY_WAS_NOT_IDEMPOTENT';
  end if;
end;
$authenticated_resignation_test$;

reset role;

do $terminal_cas_catalog_tests$
begin
  if not exists (
    select 1
    from pg_catalog.pg_class index_row
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = index_row.relnamespace
    join pg_catalog.pg_index index_metadata
      on index_metadata.indexrelid = index_row.oid
    where namespace_row.nspname = 'public'
      and index_row.relname = 'chess_move_commands_one_pending_revision_idx'
      and index_metadata.indisunique
      and index_metadata.indpred is not null
  ) then
    raise exception 'PENDING_REVISION_CONCURRENCY_INDEX_MISSING';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.commit_and_finalize_chess_move_server(uuid,text,text,text,jsonb,text,text,integer,jsonb,text,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.finalize_chess_match_server(uuid,text,text,text,bigint)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.finalize_chess_timeout_server(uuid,bigint,text)',
    'EXECUTE'
  ) then
    raise exception 'TERMINAL_SERVER_RPC_EXPOSED_TO_AUTHENTICATED';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.claim_chess_timeout(uuid,bigint)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.resign_chess_match(uuid,bigint)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.claim_chess_timeout(uuid,bigint)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.resign_chess_match(uuid,bigint)',
    'EXECUTE'
  ) then
    raise exception 'AUTHENTICATED_TERMINAL_RPC_ACL_INVALID';
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
end;
$terminal_cas_catalog_tests$;

rollback;
