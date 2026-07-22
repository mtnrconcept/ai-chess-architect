begin;

do $coverage_gate_test$
declare
  v_user_id constant uuid :=
    'd0000000-0000-4000-8000-000000000001';
  v_compilation_id constant uuid :=
    'd0000000-0000-4000-8000-000000000010';
  v_adapted_compilation_id constant uuid :=
    'd0000000-0000-4000-8000-000000000011';
  v_legacy_compilation_id constant uuid :=
    'd0000000-0000-4000-8000-000000000012';
  v_blueprint_id constant uuid :=
    'd0000000-0000-4000-8000-000000000020';
  v_adapted_blueprint_id constant uuid :=
    'd0000000-0000-4000-8000-000000000021';
  v_version_id constant uuid :=
    'd0000000-0000-4000-8000-000000000030';
  v_adapted_version_id constant uuid :=
    'd0000000-0000-4000-8000-000000000031';
  v_legacy_version_id constant uuid :=
    'd0000000-0000-4000-8000-000000000032';
  v_blueprint constant jsonb := $json$
    {
      "ruleKey": "coverage-gate-test",
      "stateNamespace": "rules.coverageGateTest",
      "actions": [
        {
          "id": "freeze-target",
          "label": "Freeze"
        }
      ],
      "triggers": [
        {
          "id": "freeze-trigger",
          "effects": [
            {
              "id": "apply-freeze",
              "op": "status.add"
            }
          ]
        }
      ]
    }
  $json$::jsonb;
  v_valid_validation constant jsonb := $json$
    {
      "metrics": {
        "coverageContractVersion": 1,
        "intentContract": {
          "version": 1,
          "originalPrompt": "[redacted]",
          "originalPromptHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "requirements": [
            {
              "id": "freeze-enemy",
              "statement": "The bishop freezes one enemy piece.",
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
          "summary": "The freeze behavior is present in compiled logic.",
          "requirements": [
            {
              "id": "freeze-enemy",
              "status": "implemented",
              "evidencePaths": ["$.triggers[0].effects[0]"],
              "explanation": "The trigger applies the freeze status.",
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
  v_valid_adapted_validation constant jsonb := $json$
    {
      "metrics": {
        "coverageContractVersion": 1,
        "intentContract": {
          "version": 1,
          "originalPrompt": "[redacted]",
          "originalPromptHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "requirements": [
            {
              "id": "freeze-enemy",
              "statement": "The bishop freezes one enemy piece.",
              "importance": "core",
              "feasibility": "adaptable",
              "approvedAdaptation": "Use the managed freeze effect."
            },
            {
              "id": "request-fidelity",
              "statement": "Every signed clause is represented by compiled logic.",
              "importance": "core",
              "feasibility": "adaptable",
              "approvedAdaptation": "Use the managed freeze effect."
            }
          ],
          "decisions": ["Use the managed freeze effect."]
        },
        "coverage": {
          "complete": true,
          "exactIntentPreserved": false,
          "score": 100,
          "summary": "The approved managed adaptation is fully implemented.",
          "requirements": [
            {
              "id": "request-fidelity",
              "status": "adapted",
              "evidencePaths": ["$.actions[0]"],
              "explanation": "The signed request uses its approved managed adaptation.",
              "adaptation": "Use the managed freeze effect.",
              "userApproved": true
            },
            {
              "id": "freeze-enemy",
              "status": "adapted",
              "evidencePaths": ["$.triggers[0].effects[0]"],
              "explanation": "The trigger implements the approved managed freeze effect.",
              "adaptation": "Use the managed freeze effect.",
              "userApproved": true
            }
          ]
        }
      }
    }
  $json$::jsonb;
  v_legacy_validation constant jsonb := $json$
    {
      "metrics": {
        "legacyValidation": true
      }
    }
  $json$::jsonb;
  v_invalid jsonb;
begin
  insert into auth.users (id)
  values (v_user_id)
  on conflict (id) do nothing;

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
  ) values
    (
      v_compilation_id,
      v_user_id,
      'Coverage gate SQL regression test',
      repeat('a', 64),
      'test-model',
      'validated',
      v_blueprint,
      '{}'::jsonb,
      v_valid_validation -> 'metrics',
      repeat('c', 64),
      'd0000000-0000-4000-8000-000000000040'
    ),
    (
      v_adapted_compilation_id,
      v_user_id,
      'Coverage gate approved adaptation test',
      repeat('b', 64),
      'test-model',
      'validated',
      v_blueprint,
      '{}'::jsonb,
      v_valid_adapted_validation -> 'metrics',
      repeat('d', 64),
      'd0000000-0000-4000-8000-000000000041'
    ),
    (
      v_legacy_compilation_id,
      v_user_id,
      'Coverage gate pre-contract provenance test',
      repeat('e', 64),
      'test-model',
      'published',
      v_blueprint,
      '{"legacy":true}'::jsonb,
      v_legacy_validation -> 'metrics',
      repeat('f', 64),
      'd0000000-0000-4000-8000-000000000042'
    );

  insert into public.rule_blueprints (
    id,
    owner_id,
    rule_key,
    title,
    description,
    category,
    visibility
  ) values
    (
      v_blueprint_id,
      v_user_id,
      'coverage-gate-test',
      'Coverage gate test',
      'Synthetic rule used to verify the immutable publication gate.',
      'test',
      'private'
    ),
    (
      v_adapted_blueprint_id,
      v_user_id,
      'coverage-gate-adapted-test',
      'Coverage gate adapted test',
      'Synthetic rule used to verify an approved adaptation.',
      'test',
      'private'
    );

  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', '{}'::jsonb, v_user_id
    );
    raise exception 'EMPTY_COVERAGE_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_INCOMPLETE%' then
        raise;
      end if;
  end;

  v_invalid := v_valid_validation #- '{metrics,coverage,complete}';
  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', v_invalid, v_user_id
    );
    raise exception 'MISSING_COMPLETE_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_INCOMPLETE%' then
        raise;
      end if;
  end;

  v_invalid := jsonb_set(
    v_valid_validation,
    '{metrics,coverageContractVersion}',
    '"1"'::jsonb
  );
  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', v_invalid, v_user_id
    );
    raise exception 'STRING_CONTRACT_VERSION_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_INCOMPLETE%' then
        raise;
      end if;
  end;

  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.1', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', v_valid_validation, v_user_id
    );
    raise exception 'UNKNOWN_ENGINE_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_ENGINE_UNSUPPORTED%' then
        raise;
      end if;
  end;

  v_invalid := jsonb_set(
    v_valid_validation,
    '{metrics,intentContract,decisions}',
    '[{"unexpected":true}]'::jsonb
  );
  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', v_invalid, v_user_id
    );
    raise exception 'INVALID_DECISION_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_CONTRACT_INVALID%' then
        raise;
      end if;
  end;

  v_invalid := jsonb_set(
    jsonb_set(
      v_valid_validation,
      '{metrics,intentContract,requirements,0,id}',
      '" freeze-enemy"'::jsonb
    ),
    '{metrics,coverage,requirements,0,id}',
    '" freeze-enemy"'::jsonb
  );
  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', v_invalid, v_user_id
    );
    raise exception 'PADDED_REQUIREMENT_ID_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_CONTRACT_INVALID%' then
        raise;
      end if;
  end;

  v_invalid := jsonb_set(
    v_valid_validation,
    '{metrics,coverage,requirements,1,id}',
    '"freeze-enemy"'::jsonb
  );
  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', v_invalid, v_user_id
    );
    raise exception 'DUPLICATE_REQUIREMENT_ID_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_IDS_INVALID%' then
        raise;
      end if;
  end;

  v_invalid := jsonb_set(
    v_valid_validation,
    '{metrics,coverage,requirements,0,id}',
    '"other-requirement"'::jsonb
  );
  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', v_invalid, v_user_id
    );
    raise exception 'MISMATCHED_REQUIREMENT_ID_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_IDS_MISMATCH%' then
        raise;
      end if;
  end;

  v_invalid := v_valid_validation
    #- '{metrics,intentContract,requirements,1}'
    #- '{metrics,coverage,requirements,1}';
  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', v_invalid, v_user_id
    );
    raise exception 'MISSING_FIDELITY_REQUIREMENT_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_FIDELITY_MISSING%' then
        raise;
      end if;
  end;

  v_invalid := jsonb_set(
    jsonb_set(
      v_valid_validation,
      '{metrics,intentContract,requirements,0,id}',
      '""'::jsonb
    ),
    '{metrics,coverage,requirements,0,id}',
    '""'::jsonb
  );
  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', v_invalid, v_user_id
    );
    raise exception 'EMPTY_REQUIREMENT_ID_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_CONTRACT_INVALID%' then
        raise;
      end if;
  end;

  v_invalid := jsonb_set(
    v_valid_validation,
    '{metrics,coverage,requirements,0,evidencePaths}',
    '[]'::jsonb
  );
  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', v_invalid, v_user_id
    );
    raise exception 'MISSING_EVIDENCE_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_EVIDENCE_INVALID%' then
        raise;
      end if;
  end;

  v_invalid := jsonb_set(
    v_valid_validation,
    '{metrics,coverage,requirements,0,status}',
    '"unsupported"'::jsonb
  );
  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', v_invalid, v_user_id
    );
    raise exception 'UNSUPPORTED_STATUS_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_REQUIREMENT_INVALID%' then
        raise;
      end if;
  end;

  v_invalid := jsonb_set(
    v_valid_validation,
    '{metrics,coverage,requirements,0,evidencePaths,0}',
    '"$.explanation.plainLanguage"'::jsonb
  );
  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', v_invalid, v_user_id
    );
    raise exception 'DESCRIPTION_EVIDENCE_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_EVIDENCE_INVALID%' then
        raise;
      end if;
  end;

  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1',
      jsonb_set(v_blueprint, '{actions}', '{"id":"not-an-array"}'::jsonb),
      '{}'::jsonb, repeat('c', 64), 'private', v_valid_validation, v_user_id
    );
    raise exception 'LAX_JSONPATH_STRUCTURE_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_EVIDENCE_INVALID%' then
        raise;
      end if;
  end;

  v_invalid := jsonb_set(
    v_valid_validation,
    '{metrics,coverage,requirements,0,adaptation}',
    '"Hidden behavioral change."'::jsonb
  );
  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', v_invalid, v_user_id
    );
    raise exception 'IMPLEMENTED_STATUS_MASKED_ADAPTATION';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_ADAPTATION_INVALID%' then
        raise;
      end if;
  end;

  v_invalid := jsonb_set(
    v_valid_validation,
    '{metrics,coverage,exactIntentPreserved}',
    'false'::jsonb
  );
  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', v_invalid, v_user_id
    );
    raise exception 'INCONSISTENT_EXACT_INTENT_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_EXACT_INTENT_INVALID%' then
        raise;
      end if;
  end;

  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('e', 64), 'private', v_valid_validation, v_user_id
    );
    raise exception 'MISMATCHED_COMPILATION_PROOF_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COMPILATION_PROOF_MISMATCH%' then
        raise;
      end if;
  end;

  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1',
      jsonb_set(v_blueprint, '{title}', '"Tampered title"'::jsonb),
      '{}'::jsonb, repeat('c', 64), 'private',
      v_valid_validation, v_user_id
    );
    raise exception 'MISMATCHED_COMPILATION_BLUEPRINT_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COMPILATION_PROOF_MISMATCH%' then
        raise;
      end if;
  end;

  update public.rule_compilations
  set metrics = '{}'::jsonb
  where id = v_compilation_id;

  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', v_valid_validation, v_user_id
    );
    raise exception 'MISMATCHED_COMPILATION_METRICS_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COMPILATION_PROOF_MISMATCH%' then
        raise;
      end if;
  end;

  update public.rule_compilations
  set metrics = v_valid_validation -> 'metrics',
      status = 'failed'
  where id = v_compilation_id;

  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', v_valid_validation, v_user_id
    );
    raise exception 'UNVALIDATED_COMPILATION_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COMPILATION_PROOF_MISMATCH%' then
        raise;
      end if;
  end;

  update public.rule_compilations
  set status = 'validated'
  where id = v_compilation_id;

  v_invalid := jsonb_set(
    v_valid_validation,
    '{metrics,coverage,requirements,0,evidencePaths,0}',
    '"$.actions[99]"'::jsonb
  );
  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', v_invalid, v_user_id
    );
    raise exception 'NONEXISTENT_EVIDENCE_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_EVIDENCE_INVALID%' then
        raise;
      end if;
  end;

  v_invalid := jsonb_set(
    jsonb_set(
      jsonb_set(
        v_valid_validation,
        '{metrics,coverage,requirements,0,status}',
        '"adapted"'::jsonb
      ),
      '{metrics,coverage,requirements,0,adaptation}',
      '"Use a different behavior."'::jsonb
    ),
    '{metrics,coverage,requirements,0,userApproved}',
    'true'::jsonb
  );
  v_invalid := jsonb_set(
    v_invalid,
    '{metrics,coverage,exactIntentPreserved}',
    'false'::jsonb
  );
  begin
    insert into public.rule_versions (
      id, blueprint_id, compilation_id, version_number, schema_version,
      engine_version, legacy_rule_id, blueprint_json, rule_json,
      content_hash, visibility, validation, created_by
    ) values (
      v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
      '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
      repeat('c', 64), 'private', v_invalid, v_user_id
    );
    raise exception 'UNAPPROVED_ADAPTATION_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_ADAPTATION_INVALID%' then
        raise;
      end if;
  end;

  insert into public.rule_versions (
    id, blueprint_id, compilation_id, version_number, schema_version,
    engine_version, legacy_rule_id, blueprint_json, rule_json,
    content_hash, visibility, validation, created_by
  ) values (
    v_version_id, v_blueprint_id, v_compilation_id, 1, '2.0.0',
    '2.0.0', 'coverage-gate@test-v1', v_blueprint, '{}'::jsonb,
    repeat('c', 64), 'private', v_valid_validation, v_user_id
  );

  insert into public.rule_versions (
    id, blueprint_id, compilation_id, version_number, schema_version,
    engine_version, legacy_rule_id, blueprint_json, rule_json,
    content_hash, visibility, validation, created_by
  ) values (
    v_adapted_version_id, v_adapted_blueprint_id,
    v_adapted_compilation_id, 1, '2.0.0', '2.0.0',
    'coverage-gate-adapted@test-v1', v_blueprint, '{}'::jsonb,
    repeat('d', 64), 'private', v_valid_adapted_validation, v_user_id
  );

  if not exists (
    select 1
    from public.rule_versions
    where id = v_version_id
  ) then
    raise exception 'VALID_COVERAGE_WAS_REJECTED';
  end if;

  if not exists (
    select 1
    from public.rule_versions
    where id = v_adapted_version_id
  ) then
    raise exception 'VALID_ADAPTED_COVERAGE_WAS_REJECTED';
  end if;

  update public.rule_compilations
  set status = 'published'
  where id in (v_compilation_id, v_adapted_compilation_id);

  create temporary table rule_versions_coverage_history_source
    (like public.rule_versions including defaults)
    on commit drop;

  insert into rule_versions_coverage_history_source
  select *
  from public.rule_versions
  where id in (v_version_id, v_adapted_version_id);

  insert into rule_versions_coverage_history_source (
    id, blueprint_id, compilation_id, version_number, schema_version,
    engine_version, legacy_rule_id, blueprint_json, rule_json,
    content_hash, visibility, validation, created_by
  ) values (
    v_legacy_version_id, v_blueprint_id, v_legacy_compilation_id,
    2, '2.0.0', '2.0.0', 'coverage-gate@test-legacy',
    v_blueprint, '{"legacy":true}'::jsonb, repeat('f', 64),
    'private', v_legacy_validation, v_user_id
  );

  if exists (
    select 1
    from rule_versions_coverage_history_source as version
    where version.validation #> '{metrics,coverageContractVersion}' is null
      and not exists (
        select 1
        from public.rule_compilations as compilation
        where compilation.id = version.compilation_id
          and compilation.user_id = version.created_by
          and compilation.blueprint = version.blueprint_json
          and compilation.content_hash = version.content_hash
          and compilation.metrics = version.validation #> '{metrics}'
          and compilation.compiled_rule is not null
      )
  ) then
    raise exception 'VALID_LEGACY_PRECONTRACT_PROOF_WAS_REJECTED';
  end if;

  create temporary table rule_versions_coverage_replay_test
    (like public.rule_versions including defaults)
    on commit drop;

  create trigger rule_versions_coverage_replay_test_gate
  before insert on rule_versions_coverage_replay_test
  for each row execute function public.enforce_rule_version_coverage_gate();

  insert into rule_versions_coverage_replay_test
  select *
  from rule_versions_coverage_history_source as version
  where version.validation #> '{metrics,coverageContractVersion}'
    is not distinct from '1'::jsonb;

  if (
    select count(*)
    from rule_versions_coverage_replay_test
  ) <> 2 then
    raise exception 'VALID_HISTORICAL_REPLAY_WAS_REJECTED';
  end if;

  if exists (
    select 1
    from rule_versions_coverage_replay_test
    where id = v_legacy_version_id
  ) then
    raise exception 'LEGACY_PRECONTRACT_WAS_CERTIFIED';
  end if;

  begin
    insert into rule_versions_coverage_replay_test
    select *
    from rule_versions_coverage_history_source
    where id = v_legacy_version_id;
    raise exception 'LEGACY_PRECONTRACT_TRIGGER_BYPASS_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_INCOMPLETE%' then
        raise;
      end if;
  end;

  truncate table rule_versions_coverage_replay_test;

  update rule_versions_coverage_history_source
  set validation = validation #- '{metrics,coverage,complete}'
  where id = v_version_id;

  begin
    insert into rule_versions_coverage_replay_test
    select *
    from rule_versions_coverage_history_source
    where id = v_version_id;
    raise exception 'INVALID_V1_HISTORICAL_REPLAY_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COVERAGE_INCOMPLETE%' then
        raise;
      end if;
  end;

  update rule_versions_coverage_history_source
  set validation = v_valid_validation
  where id = v_version_id;

  update public.rule_compilations
  set content_hash = repeat('0', 64)
  where id = v_legacy_compilation_id;

  begin
    if exists (
      select 1
      from rule_versions_coverage_history_source as version
      where version.validation #> '{metrics,coverageContractVersion}' is null
        and not exists (
          select 1
          from public.rule_compilations as compilation
          where compilation.id = version.compilation_id
            and compilation.user_id = version.created_by
            and compilation.blueprint = version.blueprint_json
            and compilation.content_hash = version.content_hash
            and compilation.metrics = version.validation #> '{metrics}'
            and compilation.compiled_rule is not null
        )
    ) then
      raise exception 'RULE_VERSION_LEGACY_COMPILATION_PROOF_MISMATCH'
        using errcode = '23514';
    end if;
    raise exception 'LEGACY_PROOF_MISMATCH_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_LEGACY_COMPILATION_PROOF_MISMATCH%'
      then
        raise;
      end if;
  end;

  update public.rule_compilations
  set metrics = '{}'::jsonb
  where id = v_compilation_id;

  begin
    insert into rule_versions_coverage_replay_test
    select *
    from rule_versions_coverage_history_source
    where id = v_version_id;
    raise exception 'V1_PROOF_MISMATCH_WAS_ACCEPTED';
  exception
    when check_violation then
      if sqlerrm not like '%RULE_VERSION_COMPILATION_PROOF_MISMATCH%' then
        raise;
      end if;
  end;

  drop table rule_versions_coverage_replay_test;
  drop table rule_versions_coverage_history_source;
end;
$coverage_gate_test$;

rollback;
