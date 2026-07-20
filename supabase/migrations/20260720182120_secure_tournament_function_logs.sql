begin;

-- This table only receives server-side diagnostics from Edge Functions using
-- service_role. Browser roles must never read or write diagnostic payloads.
alter table public.tournament_function_logs
  enable row level security;

revoke all on table public.tournament_function_logs
  from public, anon, authenticated;

grant select, insert on table public.tournament_function_logs to service_role;

comment on table public.tournament_function_logs is
  'Server-only tournament Edge Function diagnostics; inaccessible to browser roles.';

commit;
