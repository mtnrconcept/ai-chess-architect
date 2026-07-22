begin;

create schema if not exists private;
revoke all on schema private from public;

-- Temporary compatibility state for the production 9fe465 frontend. A
-- server-side ephemeral copy of the signed guidance contract is retained; the
-- legacy browser uses only the opaque UUID marker.
create table if not exists public.rule_guidance_compat_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  guidance_token text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint rule_guidance_compat_sessions_uuid_v4 check (
    id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  constraint rule_guidance_compat_sessions_token_bounded check (
    char_length(guidance_token) between 1 and 60000
  ),
  constraint rule_guidance_compat_sessions_ttl_bounded check (
    expires_at > created_at
    and expires_at <= created_at + interval '1 hour'
  )
);

create index if not exists idx_rule_guidance_compat_sessions_user_expiry
  on public.rule_guidance_compat_sessions (user_id, expires_at desc);

create index if not exists idx_rule_guidance_compat_sessions_expiry
  on public.rule_guidance_compat_sessions (expires_at);

alter table public.rule_guidance_compat_sessions enable row level security;
alter table public.rule_guidance_compat_sessions force row level security;

-- No client policy is intentional. Only authenticated Edge Functions using
-- the service role can persist or recover the signed contract.
revoke all on table public.rule_guidance_compat_sessions
  from public, anon, authenticated, service_role;
grant select, insert, delete on table public.rule_guidance_compat_sessions
  to service_role;

create or replace function private.cleanup_expired_rule_guidance_compat_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.rule_guidance_compat_sessions
  where expires_at <= now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.cleanup_expired_rule_guidance_compat_sessions()
  from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'rule-guidance-compat-expired-sessions',
  '*/15 * * * *',
  'select private.cleanup_expired_rule_guidance_compat_sessions();'
);

do $legacy_guidance_cleanup_job$
begin
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
end;
$legacy_guidance_cleanup_job$;

comment on table public.rule_guidance_compat_sessions is
  'Ephemeral server-side copy for legacy Rule Architect clients; legacy compile requests use only an opaque marker.';

commit;
