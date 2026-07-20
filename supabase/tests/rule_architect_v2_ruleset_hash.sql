begin;

do $test$
declare
  v_user_id constant uuid :=
    'f0000000-0000-4000-8000-000000000001';
  v_compilation_a constant uuid :=
    'f0000000-0000-4000-8000-000000000010';
  v_compilation_b constant uuid :=
    'f0000000-0000-4000-8000-000000000011';
  v_blueprint_a constant uuid :=
    'f0000000-0000-4000-8000-000000000020';
  v_blueprint_b constant uuid :=
    'f0000000-0000-4000-8000-000000000021';
  v_version_a constant uuid :=
    'f0000000-0000-4000-8000-000000000030';
  v_version_b constant uuid :=
    'f0000000-0000-4000-8000-000000000031';
  v_hash_a text;
  v_hash_b text;
begin
  insert into auth.users (id)
  values (v_user_id)
  on conflict (id) do nothing;

  perform set_config(
    'request.jwt.claim.sub',
    v_user_id::text,
    true
  );
  perform set_config(
    'request.jwt.claim.role',
    'authenticated',
    true
  );

  insert into public.rule_compilations (
    id,
    user_id,
    prompt,
    prompt_hash,
    model,
    status,
    blueprint,
    compiled_rule,
    content_hash,
    request_key
  )
  values
    (
      v_compilation_a,
      v_user_id,
      'ruleset hash regression A',
      'prompt-a',
      'test-model',
      'validated',
      '{"ruleKey":"hash-a","stateNamespace":"hash-a"}'::jsonb,
      '{}'::jsonb,
      'same-semantic-content-hash',
      'f0000000-0000-4000-8000-000000000040'
    ),
    (
      v_compilation_b,
      v_user_id,
      'ruleset hash regression B',
      'prompt-b',
      'test-model',
      'validated',
      '{"ruleKey":"hash-b","stateNamespace":"hash-b"}'::jsonb,
      '{}'::jsonb,
      'same-semantic-content-hash',
      'f0000000-0000-4000-8000-000000000041'
    );

  insert into public.rule_blueprints (
    id,
    owner_id,
    rule_key,
    title,
    description,
    category,
    visibility
  )
  values
    (
      v_blueprint_a,
      v_user_id,
      'hash-a',
      'Hash A',
      'Ruleset hash regression A.',
      'special',
      'private'
    ),
    (
      v_blueprint_b,
      v_user_id,
      'hash-b',
      'Hash B',
      'Ruleset hash regression B.',
      'special',
      'private'
    );

  insert into public.rule_versions (
    id,
    blueprint_id,
    compilation_id,
    version_number,
    schema_version,
    engine_version,
    legacy_rule_id,
    blueprint_json,
    rule_json,
    content_hash,
    visibility,
    created_by
  )
  values
    (
      v_version_a,
      v_blueprint_a,
      v_compilation_a,
      1,
      '2.0.0',
      '2.0.0',
      'hash-a@test-v1',
      '{"ruleKey":"hash-a","stateNamespace":"hash-a"}'::jsonb,
      '{"meta":{},"logic":{}}'::jsonb,
      'same-semantic-content-hash',
      'private',
      v_user_id
    ),
    (
      v_version_b,
      v_blueprint_b,
      v_compilation_b,
      1,
      '2.0.0',
      '2.0.0',
      'hash-b@test-v1',
      '{"ruleKey":"hash-b","stateNamespace":"hash-b"}'::jsonb,
      '{"meta":{},"logic":{}}'::jsonb,
      'same-semantic-content-hash',
      'private',
      v_user_id
    );

  select created.ruleset_hash
    into v_hash_a
  from public.create_rule_lobby_v2(
    'Ruleset hash A',
    array[v_version_a],
    'f0000000-0000-4000-8000-000000000050',
    'ai'
  ) as created;

  select created.ruleset_hash
    into v_hash_b
  from public.create_rule_lobby_v2(
    'Ruleset hash B',
    array[v_version_b],
    'f0000000-0000-4000-8000-000000000051',
    'ai'
  ) as created;

  if v_hash_a is null
    or v_hash_b is null
    or v_hash_a = v_hash_b then
    raise exception
      'RULESET_HASH_MUST_BIND_IMMUTABLE_VERSION_ID';
  end if;
end;
$test$;

rollback;
