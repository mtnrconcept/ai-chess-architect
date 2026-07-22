begin;

-- Une ligne publiée sous le contrat v2 ne doit jamais être rétrogradée vers
-- la grammaire v1. L'exception annule toute la transaction de rollback.
do $block_coverage_v2_rollback$
begin
  if exists (
    select 1
    from public.rule_versions as version
    where version.validation #> '{metrics,coverageContractVersion}'
        is not distinct from '2'::jsonb
      or version.validation #> '{metrics,intentContract,version}'
        is not distinct from '2'::jsonb
  ) then
    raise exception 'RULE_VERSION_COVERAGE_V2_ROLLBACK_BLOCKED'
      using errcode = '23514';
  end if;
end;
$block_coverage_v2_rollback$;

create or replace function public.enforce_rule_version_coverage_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_contract_requirements jsonb;
  v_coverage_requirements jsonb;
  v_expected_exact_intent jsonb;
begin
  if new.engine_version is distinct from '2.0.0' then
    raise exception 'RULE_VERSION_ENGINE_UNSUPPORTED'
      using errcode = '23514';
  end if;

  if jsonb_typeof(new.validation) is distinct from 'object'
    or jsonb_typeof(new.validation #> '{metrics}')
      is distinct from 'object'
    or jsonb_typeof(new.validation #> '{metrics,intentContract}')
      is distinct from 'object'
    or jsonb_typeof(new.validation #> '{metrics,coverage}')
      is distinct from 'object'
    or new.validation #> '{metrics,coverage,complete}'
      is distinct from 'true'::jsonb
    or new.validation #> '{metrics,coverage,score}'
      is distinct from '100'::jsonb
    or new.validation #> '{metrics,coverageContractVersion}'
      is distinct from '1'::jsonb
    or new.validation #> '{metrics,intentContract,version}'
      is distinct from '1'::jsonb then
    raise exception 'RULE_VERSION_COVERAGE_INCOMPLETE'
      using errcode = '23514';
  end if;

  if new.validation #> '{metrics,intentContract,originalPrompt}'
      is distinct from '"[redacted]"'::jsonb
    or jsonb_typeof(
      new.validation #> '{metrics,intentContract,originalPromptHash}'
    ) is distinct from 'string'
    or coalesce(
      new.validation #>> '{metrics,intentContract,originalPromptHash}',
      ''
    ) !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(
      new.validation #> '{metrics,intentContract,decisions}'
    ) is distinct from 'array'
    or jsonb_typeof(
      new.validation #> '{metrics,coverage,exactIntentPreserved}'
    ) is distinct from 'boolean'
    or jsonb_typeof(
      new.validation #> '{metrics,coverage,summary}'
    ) is distinct from 'string'
    or char_length(btrim(coalesce(
      new.validation #>> '{metrics,coverage,summary}',
      ''
    ))) not between 10 and 500
    or jsonb_typeof(new.blueprint_json) is distinct from 'object' then
    raise exception 'RULE_VERSION_COVERAGE_CONTRACT_INVALID'
      using errcode = '23514';
  end if;

  if jsonb_array_length(
      new.validation #> '{metrics,intentContract,decisions}'
    ) > 20
    or exists (
      select 1
      from jsonb_array_elements(
        new.validation #> '{metrics,intentContract,decisions}'
      ) as decision_items(decision_item)
      where jsonb_typeof(decision_item) is distinct from 'string'
        or char_length(btrim(coalesce(decision_item #>> '{}', '')))
          not between 1 and 300
    ) then
    raise exception 'RULE_VERSION_COVERAGE_CONTRACT_INVALID'
      using errcode = '23514';
  end if;

  v_contract_requirements :=
    new.validation #> '{metrics,intentContract,requirements}';
  v_coverage_requirements :=
    new.validation #> '{metrics,coverage,requirements}';

  if jsonb_typeof(v_contract_requirements) is distinct from 'array'
    or jsonb_typeof(v_coverage_requirements) is distinct from 'array' then
    raise exception 'RULE_VERSION_COVERAGE_CONTRACT_INVALID'
      using errcode = '23514';
  end if;

  if jsonb_array_length(v_contract_requirements) not between 1 and 32
    or jsonb_array_length(v_coverage_requirements) not between 1 and 32
    or jsonb_array_length(v_contract_requirements)
      <> jsonb_array_length(v_coverage_requirements) then
    raise exception 'RULE_VERSION_COVERAGE_CONTRACT_INVALID'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_contract_requirements)
      as contract_items(contract_item)
    where jsonb_typeof(contract_item) is distinct from 'object'
      or jsonb_typeof(contract_item -> 'id') is distinct from 'string'
      or coalesce(contract_item ->> 'id', '')
        !~ '^[a-z][a-z0-9-]{1,39}$'
      or contract_item ->> 'id' <> btrim(contract_item ->> 'id')
      or jsonb_typeof(contract_item -> 'statement')
        is distinct from 'string'
      or char_length(btrim(coalesce(
        contract_item ->> 'statement',
        ''
      ))) not between 5 and 300
      or coalesce(contract_item ->> 'importance', '')
        not in ('core', 'supporting', 'cosmetic')
      or coalesce(contract_item ->> 'feasibility', '')
        not in ('direct', 'adaptable', 'unsupported')
      or jsonb_typeof(contract_item -> 'approvedAdaptation')
        is distinct from 'string'
      or char_length(coalesce(
        contract_item ->> 'approvedAdaptation',
        ''
      )) > 400
      or (
        coalesce(contract_item ->> 'feasibility', '') <> 'direct'
        and btrim(coalesce(
          contract_item ->> 'approvedAdaptation',
          ''
        )) = ''
      )
  ) then
    raise exception 'RULE_VERSION_COVERAGE_CONTRACT_INVALID'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_coverage_requirements)
      as coverage_items(coverage_item)
    where jsonb_typeof(coverage_item) is distinct from 'object'
      or jsonb_typeof(coverage_item -> 'id') is distinct from 'string'
      or coalesce(coverage_item ->> 'id', '')
        !~ '^[a-z][a-z0-9-]{1,39}$'
      or coverage_item ->> 'id' <> btrim(coverage_item ->> 'id')
      or coalesce(coverage_item ->> 'status', '')
        not in ('implemented', 'adapted')
      or jsonb_typeof(coverage_item -> 'evidencePaths')
        is distinct from 'array'
      or jsonb_typeof(coverage_item -> 'explanation')
        is distinct from 'string'
      or char_length(btrim(coalesce(
        coverage_item ->> 'explanation',
        ''
      ))) not between 5 and 400
      or jsonb_typeof(coverage_item -> 'adaptation')
        is distinct from 'string'
      or char_length(coalesce(
        coverage_item ->> 'adaptation',
        ''
      )) > 400
      or jsonb_typeof(coverage_item -> 'userApproved')
        is distinct from 'boolean'
  ) then
    raise exception 'RULE_VERSION_COVERAGE_REQUIREMENT_INVALID'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_coverage_requirements)
      as coverage_items(coverage_item)
    where jsonb_array_length(coverage_item -> 'evidencePaths') not between 1 and 8
      or jsonb_array_length(coverage_item -> 'evidencePaths') <>
        (
          select count(distinct btrim(evidence_path #>> '{}'))
          from jsonb_array_elements(coverage_item -> 'evidencePaths')
            as evidence_paths(evidence_path)
        )
  ) then
    raise exception 'RULE_VERSION_COVERAGE_EVIDENCE_INVALID'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_coverage_requirements)
      as coverage_items(coverage_item)
    cross join lateral jsonb_array_elements(
      coverage_item -> 'evidencePaths'
    ) as evidence_paths(evidence_path)
    where jsonb_typeof(evidence_path) is distinct from 'string'
  ) then
    raise exception 'RULE_VERSION_COVERAGE_EVIDENCE_INVALID'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_coverage_requirements)
      as coverage_items(coverage_item)
    cross join lateral jsonb_array_elements(
      coverage_item -> 'evidencePaths'
    ) as evidence_paths(evidence_path)
    where coalesce(evidence_path #>> '{}', '')
        is distinct from btrim(coalesce(evidence_path #>> '{}', ''))
      or coalesce(evidence_path #>> '{}', '')
        !~ '^\$\.(actions\[[0-9]{1,3}\]|triggers\[[0-9]{1,3}\](\.(conditions|effects)\[[0-9]{1,3}\])?)$'
  ) then
    raise exception 'RULE_VERSION_COVERAGE_EVIDENCE_INVALID'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_coverage_requirements)
      as coverage_items(coverage_item)
    cross join lateral jsonb_array_elements(
      coverage_item -> 'evidencePaths'
    ) as evidence_paths(evidence_path)
    where pg_catalog.jsonb_path_exists(
        new.blueprint_json,
        ('strict ' || (evidence_path #>> '{}'))::pg_catalog.jsonpath,
        '{}'::jsonb,
        true
      ) is distinct from true
  ) then
    raise exception 'RULE_VERSION_COVERAGE_EVIDENCE_INVALID'
      using errcode = '23514';
  end if;

  if jsonb_array_length(v_contract_requirements) <>
    (
      select count(distinct contract_item ->> 'id')
      from jsonb_array_elements(v_contract_requirements)
        as contract_items(contract_item)
    )
    or jsonb_array_length(v_coverage_requirements) <>
    (
      select count(distinct coverage_item ->> 'id')
      from jsonb_array_elements(v_coverage_requirements)
        as coverage_items(coverage_item)
    ) then
    raise exception 'RULE_VERSION_COVERAGE_IDS_INVALID'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_contract_requirements)
      as contract_items(contract_item)
    full join jsonb_array_elements(v_coverage_requirements)
      as coverage_items(coverage_item)
      on contract_item ->> 'id' = coverage_item ->> 'id'
    where contract_item is null or coverage_item is null
  ) then
    raise exception 'RULE_VERSION_COVERAGE_IDS_MISMATCH'
      using errcode = '23514';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(v_contract_requirements)
      as contract_items(contract_item)
    where contract_item ->> 'id' = 'request-fidelity'
  ) <> 1 then
    raise exception 'RULE_VERSION_COVERAGE_FIDELITY_MISSING'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_contract_requirements)
      as contract_items(contract_item)
    where contract_item ->> 'id' = 'request-fidelity'
      and contract_item ->> 'importance' is distinct from 'core'
  ) then
    raise exception 'RULE_VERSION_COVERAGE_FIDELITY_INVALID'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_contract_requirements)
      as contract_items(contract_item)
    join jsonb_array_elements(v_coverage_requirements)
      as coverage_items(coverage_item)
      on contract_item ->> 'id' = coverage_item ->> 'id'
    where (
      coverage_item ->> 'status' = 'implemented'
      and (
        btrim(coalesce(coverage_item ->> 'adaptation', '')) <> ''
        or coverage_item -> 'userApproved' is distinct from 'false'::jsonb
      )
    ) or (
      coverage_item ->> 'status' = 'adapted'
      and (
        coverage_item -> 'userApproved' is distinct from 'true'::jsonb
        or btrim(coalesce(
          contract_item ->> 'approvedAdaptation',
          ''
        )) = ''
        or btrim(coverage_item ->> 'adaptation')
          <> btrim(contract_item ->> 'approvedAdaptation')
      )
    )
  ) then
    raise exception 'RULE_VERSION_COVERAGE_ADAPTATION_INVALID'
      using errcode = '23514';
  end if;

  select case
    when exists (
      select 1
      from jsonb_array_elements(v_coverage_requirements)
        as coverage_items(coverage_item)
      where coverage_item ->> 'status' = 'adapted'
    ) then 'false'::jsonb
    else 'true'::jsonb
  end
  into v_expected_exact_intent;

  if new.validation #> '{metrics,coverage,exactIntentPreserved}'
    is distinct from v_expected_exact_intent then
    raise exception 'RULE_VERSION_COVERAGE_EXACT_INTENT_INVALID'
      using errcode = '23514';
  end if;

  -- At insert time a normal publication references a validated compilation.
  -- Historical rows reference the same compilation after it moved to the
  -- published terminal state, hence both states are accepted for replay.
  if not exists (
    select 1
    from public.rule_compilations as compilation
    where compilation.id = new.compilation_id
      and compilation.status in ('validated', 'published')
      and compilation.user_id = new.created_by
      and compilation.compiled_rule is not null
      and compilation.metrics = new.validation #> '{metrics}'
      and compilation.blueprint = new.blueprint_json
      and compilation.content_hash = new.content_hash
  ) then
    raise exception 'RULE_VERSION_COMPILATION_PROOF_MISMATCH'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_rule_version_coverage_gate()
  from public, anon, authenticated;

-- Rejoue chaque publication v1 avant de valider le retour arrière.
create temporary table rule_versions_coverage_root_evidence_audit
  (like public.rule_versions including defaults)
  on commit drop;

create trigger rule_versions_coverage_root_evidence_audit_gate
before insert on rule_versions_coverage_root_evidence_audit
for each row execute function public.enforce_rule_version_coverage_gate();

insert into rule_versions_coverage_root_evidence_audit
select *
from public.rule_versions as version
where version.validation #> '{metrics,coverageContractVersion}'
  is not distinct from '1'::jsonb;

drop table rule_versions_coverage_root_evidence_audit;

commit;
