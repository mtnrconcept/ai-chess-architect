begin;

create or replace function public.enforce_rule_version_coverage_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_contract_requirements jsonb;
  v_coverage_requirements jsonb;
begin
  if new.engine_version <> '2.0.0' then
    return new;
  end if;

  if jsonb_typeof(new.validation #> '{metrics,coverage,complete}') <> 'boolean'
    or new.validation #>> '{metrics,coverage,complete}' <> 'true'
    or new.validation #>> '{metrics,coverageContractVersion}' <> '1' then
    raise exception 'RULE_VERSION_COVERAGE_INCOMPLETE'
      using errcode = '23514';
  end if;

  v_contract_requirements :=
    new.validation #> '{metrics,intentContract,requirements}';
  v_coverage_requirements :=
    new.validation #> '{metrics,coverage,requirements}';

  if jsonb_typeof(v_contract_requirements) <> 'array'
    or jsonb_typeof(v_coverage_requirements) <> 'array'
    or jsonb_array_length(v_contract_requirements) = 0
    or jsonb_array_length(v_contract_requirements)
      <> jsonb_array_length(v_coverage_requirements) then
    raise exception 'RULE_VERSION_COVERAGE_CONTRACT_INVALID'
      using errcode = '23514';
  end if;

  if jsonb_array_length(v_contract_requirements) <>
    (
      select count(distinct item ->> 'id')
      from jsonb_array_elements(v_contract_requirements) as items(item)
      where item ->> 'id' is not null
    )
    or jsonb_array_length(v_coverage_requirements) <>
    (
      select count(distinct item ->> 'id')
      from jsonb_array_elements(v_coverage_requirements) as items(item)
      where item ->> 'id' is not null
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

  return new;
end;
$$;

revoke all on function public.enforce_rule_version_coverage_gate()
  from public, anon, authenticated;

drop trigger if exists rule_versions_require_complete_coverage
  on public.rule_versions;
create trigger rule_versions_require_complete_coverage
before insert on public.rule_versions
for each row execute function public.enforce_rule_version_coverage_gate();

commit;
