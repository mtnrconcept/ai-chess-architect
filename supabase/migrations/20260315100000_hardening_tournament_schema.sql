-- EXT (si pas déjà)
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- LOBBIES (si pas là)
create table if not exists public.lobbies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  creator_id uuid not null,
  active_rules jsonb default '[]'::jsonb,
  max_players int default 2,
  is_active boolean default true,
  mode text check (mode in ('player','ai','tournament')) default 'player',
  status text check (status in ('waiting','matched','playing','closed')) default 'waiting',
  opponent_id uuid,
  opponent_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- TOURNOIS
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  variant_name text not null,
  variant_rules jsonb not null default '[]'::jsonb,
  variant_source text check (variant_source in ('lobby','fallback')) not null,
  variant_lobby_id uuid,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text check (status in ('scheduled','running','completed','canceled')) not null default 'scheduled',
  created_at timestamptz not null default now()
);

-- IDÉMPOTENCE: clé unique pour upsert
create unique index if not exists ux_tournaments_start_variant
  on public.tournaments (start_time, variant_name);

-- MATCHES
create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  lobby_id uuid references public.lobbies(id),
  round int not null default 1,
  status text check (status in ('pending','playing','done')) default 'pending',
  created_at timestamptz not null default now()
);

-- REGISTRATIONS
create table if not exists public.tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null,
  joined_at timestamptz not null default now()
);

-- VUE D’APERÇU
create or replace view public.tournament_overview as
select
  t.id,
  t.name,
  t.start_time,
  t.end_time,
  t.status,
  count(distinct r.id) as players,
  count(distinct m.id) as matches
from public.tournaments t
left join public.tournament_registrations r on r.tournament_id = t.id
left join public.tournament_matches m on m.tournament_id = t.id
group by t.id;

-- INDEXS de perf
create index if not exists ix_tournaments_start on public.tournaments(start_time);
create index if not exists ix_tournaments_status on public.tournaments(status);
create index if not exists ix_lobbies_updated on public.lobbies(updated_at desc);

-- RLS
alter table public.lobbies enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_matches enable row level security;
alter table public.tournament_registrations enable row level security;

-- Policies simples (à affiner)
do $$
begin
  if not exists (select 1 from pg_policies where polname = 'lobbies_read_all') then
    create policy "lobbies_read_all" on public.lobbies for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'tournaments_read_all') then
    create policy "tournaments_read_all" on public.tournaments for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'matches_read_all') then
    create policy "matches_read_all" on public.tournament_matches for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'regs_read_owner') then
    create policy "regs_read_owner" on public.tournament_registrations
      for select using (auth.uid() = user_id);
  end if;
end$$;

-- PostgREST: recharger le cache du schéma
select pg_notify('pgrst', 'reload schema');
