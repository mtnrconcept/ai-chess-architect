begin;

insert into auth.users (id)
values ('d0000000-0000-4000-8000-000000001600')
on conflict (id) do nothing;

do $legacy_guidance_compat_contract$
declare
  v_user constant uuid := 'd0000000-0000-4000-8000-000000001600';
  v_session constant uuid := 'd0000000-0000-4000-8000-000000001601';
  v_expired_session constant uuid := 'd0000000-0000-4000-8000-000000001604';
begin
  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'rule_guidance_compat_sessions'
      and c.relrowsecurity
      and c.relforcerowsecurity
  ) then
    raise exception 'LEGACY_GUIDANCE_COMPAT_RLS_NOT_FORCED';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'rule_guidance_compat_sessions'
  ) then
    raise exception 'LEGACY_GUIDANCE_COMPAT_MUST_NOT_HAVE_CLIENT_POLICIES';
  end if;

  if has_table_privilege(
      'anon', 'public.rule_guidance_compat_sessions', 'SELECT'
    ) or has_table_privilege(
      'anon', 'public.rule_guidance_compat_sessions', 'INSERT'
    ) or has_table_privilege(
      'anon', 'public.rule_guidance_compat_sessions', 'UPDATE'
    ) or has_table_privilege(
      'anon', 'public.rule_guidance_compat_sessions', 'DELETE'
    ) or has_table_privilege(
      'authenticated', 'public.rule_guidance_compat_sessions', 'SELECT'
    ) or has_table_privilege(
      'authenticated', 'public.rule_guidance_compat_sessions', 'INSERT'
    ) or has_table_privilege(
      'authenticated', 'public.rule_guidance_compat_sessions', 'UPDATE'
    ) or has_table_privilege(
      'authenticated', 'public.rule_guidance_compat_sessions', 'DELETE'
    ) then
    raise exception 'LEGACY_GUIDANCE_COMPAT_CLIENT_PRIVILEGE_PRESENT';
  end if;

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

  if has_function_privilege(
      'anon',
      'private.cleanup_expired_rule_guidance_compat_sessions()',
      'EXECUTE'
    ) or has_function_privilege(
      'authenticated',
      'private.cleanup_expired_rule_guidance_compat_sessions()',
      'EXECUTE'
    ) or has_function_privilege(
      'service_role',
      'private.cleanup_expired_rule_guidance_compat_sessions()',
      'EXECUTE'
    ) then
    raise exception 'LEGACY_GUIDANCE_COMPAT_CLEANUP_PRIVILEGES_INVALID';
  end if;

  if (
    select count(*)
    from cron.job
    where jobname = 'rule-guidance-compat-expired-sessions'
      and schedule = '*/15 * * * *'
      and command =
        'select private.cleanup_expired_rule_guidance_compat_sessions();'
      and active
  ) <> 1 then
    raise exception 'LEGACY_GUIDANCE_COMPAT_CLEANUP_JOB_INVALID';
  end if;

  insert into public.rule_guidance_compat_sessions (
    id,
    user_id,
    guidance_token,
    created_at,
    expires_at
  ) values (
    v_session,
    v_user,
    'synthetic.signed-token',
    now(),
    now() + interval '1 hour'
  );

  if not exists (
    select 1
    from public.rule_guidance_compat_sessions
    where id = v_session
      and user_id = v_user
      and expires_at > now()
  ) then
    raise exception 'LEGACY_GUIDANCE_COMPAT_ROW_NOT_PERSISTED';
  end if;

  if exists (
    select 1
    from public.rule_guidance_compat_sessions
    where id = 'd0000000-0000-4000-8000-000000001699'
  ) then
    raise exception 'LEGACY_GUIDANCE_COMPAT_UNKNOWN_MARKER_RESOLVED';
  end if;

  insert into public.rule_guidance_compat_sessions (
    id, user_id, guidance_token, created_at, expires_at
  ) values (
    v_expired_session,
    v_user,
    'expired.synthetic-token',
    now() - interval '2 hours',
    now() - interval '1 hour'
  );
  perform private.cleanup_expired_rule_guidance_compat_sessions();
  if exists (
    select 1
    from public.rule_guidance_compat_sessions
    where id = v_expired_session
  ) then
    raise exception 'LEGACY_GUIDANCE_COMPAT_EXPIRED_ROW_NOT_PURGED';
  end if;
  if not exists (
    select 1
    from public.rule_guidance_compat_sessions
    where id = v_session
  ) then
    raise exception 'LEGACY_GUIDANCE_COMPAT_ACTIVE_ROW_PURGED';
  end if;

  begin
    insert into public.rule_guidance_compat_sessions (
      id, user_id, guidance_token, created_at, expires_at
    ) values (
      'd0000000-0000-4000-8000-000000001602',
      v_user,
      'too-long-lived',
      now(),
      now() + interval '1 hour 1 second'
    );
    raise exception 'LEGACY_GUIDANCE_COMPAT_OVERSIZED_TTL_ACCEPTED';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.rule_guidance_compat_sessions (
      id, user_id, guidance_token, created_at, expires_at
    ) values (
      'd0000000-0000-4000-8000-000000001603',
      v_user,
      'expired',
      now(),
      now()
    );
    raise exception 'LEGACY_GUIDANCE_COMPAT_EXPIRED_ROW_ACCEPTED';
  exception
    when check_violation then null;
  end;

  -- The matching down migration only revokes the service bridge. Verify that
  -- this disables access without dropping or rewriting the ephemeral record.
  revoke select, insert, delete
    on table public.rule_guidance_compat_sessions from service_role;
  if not exists (
    select 1
    from public.rule_guidance_compat_sessions
    where id = v_session
      and guidance_token = 'synthetic.signed-token'
  ) then
    raise exception 'LEGACY_GUIDANCE_COMPAT_ROLLBACK_WAS_DESTRUCTIVE';
  end if;
  if has_table_privilege(
      'service_role', 'public.rule_guidance_compat_sessions', 'SELECT'
    ) or has_table_privilege(
      'service_role', 'public.rule_guidance_compat_sessions', 'INSERT'
    ) or has_table_privilege(
      'service_role', 'public.rule_guidance_compat_sessions', 'DELETE'
    ) then
    raise exception 'LEGACY_GUIDANCE_COMPAT_ROLLBACK_DID_NOT_DISABLE_BRIDGE';
  end if;
end;
$legacy_guidance_compat_contract$;

rollback;
