-- Create registry for external APIs and integrations that must stay reachable
create table if not exists public.api_registry (
  id uuid primary key default gen_random_uuid(),
  service text not null unique,
  category text not null check (category in ('supabase','edge_function','coach_api','http')),
  target text not null,
  method text not null default 'GET',
  config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.api_registry is 'Registry of external services used by Voltus (Supabase resources, Edge Functions, Coach API, HTTP services).';
comment on column public.api_registry.service is 'Human readable service name (unique).';
comment on column public.api_registry.category is 'Type of integration to probe: supabase | edge_function | coach_api | http.';
comment on column public.api_registry.target is 'Identifier of the integration (table, function name or base URL).';
comment on column public.api_registry.method is 'HTTP method to use for HTTP-based checks. Ignored for Supabase resources.';
comment on column public.api_registry.config is 'JSON configuration describing how to run the health check (headers, payload, path, columns…).';
comment on column public.api_registry.notes is 'Optional human notes displayed in diagnostics.';

create or replace function public.set_api_registry_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger api_registry_set_updated_at
before update on public.api_registry
for each row
execute function public.set_api_registry_updated_at();

alter table public.api_registry enable row level security;

drop policy if exists "API registry read access" on public.api_registry;
create policy "API registry read access"
  on public.api_registry
  for select
  using (auth.role() in ('authenticated', 'service_role'));

-- Allow service role to maintain the registry (edge functions & scripts)
drop policy if exists "API registry maintainers" on public.api_registry;
create policy "API registry maintainers"
  on public.api_registry
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
