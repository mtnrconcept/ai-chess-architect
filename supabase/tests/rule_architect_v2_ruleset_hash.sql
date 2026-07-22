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
  v_validation constant jsonb := $json$
    {
      "metrics": {
        "coverageContractVersion": 1,
        "intentContract": {
          "version": 1,
          "originalPrompt": "[redacted]",
          "originalPromptHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "requirements": [
            {
              "id": "test-action",
              "statement": "The rule exposes one deterministic test action.",
              "importance": "core",
              "feasibility": "direct",
              "approvedAdaptation": ""
            },
            {
              "id": "request-fidelity",
              "statement": "Every signed clause is represented by compiled logic.",
              "importance": "core",
              "feasibility": "direct",
              "approvedAdaptation": ""
            }
          ],
          "decisions": []
        },
        "coverage": {
          "complete": true,
          "exactIntentPreserved": true,
          "score": 100,
          "summary": "The deterministic test action is implemented.",
          "requirements": [
            {
              "id": "test-action",
              "status": "implemented",
              "evidencePaths": ["$.actions[0]"],
              "explanation": "The first action provides the required behavior.",
              "adaptation": "",
              "userApproved": false
            },
            {
              "id": "request-fidelity",
              "status": "implemented",
              "evidencePaths": ["$.actions[0]"],
              "explanation": "The compiled action represents every signed clause.",
              "adaptation": "",
              "userApproved": false
            }
          ]
        }
      }
    }
  $json$::jsonb;
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
    metrics,
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
      '{"ruleKey":"hash-a","stateNamespace":"hash-a","actions":[{"id":"test-action"}]}'::jsonb,
      '{}'::jsonb,
      v_validation -> 'metrics',
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
      '{"ruleKey":"hash-b","stateNamespace":"hash-b","actions":[{"id":"test-action"}]}'::jsonb,
      '{}'::jsonb,
      v_validation -> 'metrics',
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
    validation,
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
      '{"ruleKey":"hash-a","stateNamespace":"hash-a","actions":[{"id":"test-action"}]}'::jsonb,
      '{"meta":{},"logic":{}}'::jsonb,
      'same-semantic-content-hash',
      'private',
      v_validation,
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
      '{"ruleKey":"hash-b","stateNamespace":"hash-b","actions":[{"id":"test-action"}]}'::jsonb,
      '{"meta":{},"logic":{}}'::jsonb,
      'same-semantic-content-hash',
      'private',
      v_validation,
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

  -- Production historically accepted only active/disabled on this legacy
  -- projection. A private immutable V2 version must still be representable as
  -- draft without being made publicly active for compatibility.
  insert into public.chess_rules (
    rule_id,
    rule_name,
    description,
    category,
    rule_json,
    source,
    status,
    is_functional,
    created_by
  )
  values (
    'rule-architect-v2-status-compat-test',
    'Status compatibility test',
    'Private Rule Architect V2 projection compatibility test.',
    'special',
    '{"meta":{},"logic":{}}'::jsonb,
    'ai_generated',
    'draft',
    true,
    v_user_id
  );

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lobbies'
      and policyname in (
        'lobbies_read_all',
        'Users can view all lobbies'
      )
  ) then
    raise exception 'PERMISSIVE_LEGACY_LOBBY_READ_POLICY_REMAINS';
  end if;
end;
$test$;

rollback;
