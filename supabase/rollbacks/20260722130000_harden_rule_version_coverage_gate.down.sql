begin;

create or replace function public.enforce_rule_version_coverage_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.engine_version = '2.0.0' then
    raise exception 'RULE_VERSION_COVERAGE_GATE_ROLLED_BACK'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_rule_version_coverage_gate()
  from public, anon, authenticated;

commit;
