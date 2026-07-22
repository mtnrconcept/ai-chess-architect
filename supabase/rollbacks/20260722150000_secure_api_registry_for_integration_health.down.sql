begin;

-- Non-destructive rollback: retain the registry, migrated legacy data,
-- security posture, constraints, and audit marker. Only stop probes managed by
-- this migration so operators can inspect or reactivate them later.
update public.api_registry
set
  active = false,
  config = config || jsonb_build_object('rollback_disabled', true),
  notes = case
    when notes like '%Disabled by rollback 20260722150000.%' then notes
    else concat_ws(E'\n', notes, 'Disabled by rollback 20260722150000.')
  end
where config ->> 'seed_marker' = '20260722150000_integration_health';

commit;
