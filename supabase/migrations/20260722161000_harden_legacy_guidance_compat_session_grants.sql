begin;

-- Tables created in public can inherit broad service_role defaults. Revoke
-- everything first, then grant only the operations used by the two Edge
-- Functions. This also reconciles branches that applied 20260722160000 before
-- its fresh-install definition was hardened.
revoke all on table public.rule_guidance_compat_sessions
  from public, anon, authenticated, service_role;
grant select, insert, delete on table public.rule_guidance_compat_sessions
  to service_role;

do $legacy_guidance_exact_grants$
begin
  if not has_table_privilege(
      'service_role',
      'public.rule_guidance_compat_sessions',
      'SELECT'
    ) or not has_table_privilege(
      'service_role',
      'public.rule_guidance_compat_sessions',
      'INSERT'
    ) or not has_table_privilege(
      'service_role',
      'public.rule_guidance_compat_sessions',
      'DELETE'
    ) or has_table_privilege(
      'service_role',
      'public.rule_guidance_compat_sessions',
      'UPDATE'
    ) then
    raise exception 'LEGACY_GUIDANCE_COMPAT_SERVICE_PRIVILEGES_INVALID';
  end if;
end;
$legacy_guidance_exact_grants$;

commit;
