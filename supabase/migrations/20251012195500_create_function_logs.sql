create table if not exists public.tournament_function_logs (
  id uuid primary key default gen_random_uuid(),
  function_name text not null,
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_tournament_function_logs_created_at on public.tournament_function_logs(created_at desc);
