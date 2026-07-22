begin;

drop trigger if exists rule_versions_require_complete_coverage
  on public.rule_versions;
drop function if exists public.enforce_rule_version_coverage_gate();

commit;
