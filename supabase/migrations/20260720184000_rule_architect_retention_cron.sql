begin;

-- pg_cron keeps named jobs unique for a given owner. Re-scheduling this exact
-- name updates the existing definition instead of creating parallel purges.
select cron.schedule(
  'rule-architect-v2-expired-compilations',
  '17 3 * * *',
  'select public.cleanup_expired_rule_compilations();'
);

commit;
