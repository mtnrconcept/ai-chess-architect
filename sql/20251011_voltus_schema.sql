create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ========== LOBBIES ==========
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

-- ========== TOURNOIS ==========
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

create unique index if not exists ux_tournaments_start_variant
  on public.tournaments(start_time, variant_name);

create index if not exists ix_tournaments_start on public.tournaments(start_time);
create index if not exists ix_tournaments_status on public.tournaments(status);

-- ========== MATCHES ==========
create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  lobby_id uuid references public.lobbies(id),
  round int not null default 1,
  status text check (status in ('pending','playing','done')) default 'pending',
  created_at timestamptz not null default now()
);

-- ========== REGISTRATIONS ==========
create table if not exists public.tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null,
  joined_at timestamptz not null default now()
);

-- ========== HISTORIQUE PARTIES ==========
create table if not exists public.user_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  opponent_id uuid,
  result text check (result in ('win','loss','draw','aborted')) default 'draw',
  mode text,
  pgn text,
  moves jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ix_user_games_user_created
  on public.user_games(user_id, created_at desc);

-- ========== VUE D'APERCU ==========
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

-- ========== RLS ==========
alter table public.lobbies enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_matches enable row level security;
alter table public.tournament_registrations enable row level security;
alter table public.user_games enable row level security;

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

  if not exists (select 1 from pg_policies where polname = 'games_owner_rw') then
    create policy "games_owner_rw" on public.user_games
      for select using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end$$;

-- Reload cache PostgREST pour purger les 404/205 fantômes
notify pgrst, 'reload schema';
