begin;

-- Security hardening is deliberately not weakened on rollback. The bridge
-- retains the same least-privilege service_role grants while the preceding
-- compatibility migration remains installed.
revoke all on table public.rule_guidance_compat_sessions
  from service_role;
grant select, insert, delete on table public.rule_guidance_compat_sessions
  to service_role;

commit;
