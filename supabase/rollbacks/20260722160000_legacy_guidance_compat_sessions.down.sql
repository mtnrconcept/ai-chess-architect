begin;

-- Non-destructive rollback: preserve still-auditable ephemeral rows and all
-- security controls, but prevent Edge Functions from creating or reading new
-- compatibility sessions. Reapplying the migration restores these grants.
-- The expiry cleanup deliberately remains scheduled so retained tokens are
-- still purged after their original one-hour lifetime.
revoke all on table public.rule_guidance_compat_sessions
  from service_role;

comment on table public.rule_guidance_compat_sessions is
  'Legacy Rule Architect compatibility bridge disabled by rollback 20260722160000; rows retained until operator cleanup.';

commit;
