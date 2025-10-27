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

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  lobby_id uuid references public.lobbies(id),
  table_number integer,
  player1_id uuid references auth.users(id) on delete cascade,
  player2_id uuid references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','playing','finished','cancelled')),
  result text check (result in ('player1','player2','draw')),
  winner_id uuid references auth.users(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  reported_by uuid references auth.users(id),
  variant_rules text[] default array[]::text[],
  is_ai_match boolean default false,
  ai_opponent_label text,
  ai_opponent_difficulty text,
  round int not null default 1
);

alter table public.tournament_matches
  add column if not exists table_number integer;

alter table public.tournament_matches
  add column if not exists player1_id uuid references auth.users(id) on delete cascade;

alter table public.tournament_matches
  add column if not exists player2_id uuid references auth.users(id) on delete cascade;

alter table public.tournament_matches
  add column if not exists result text check (result in ('player1','player2','draw'));

alter table public.tournament_matches
  add column if not exists winner_id uuid references auth.users(id);

alter table public.tournament_matches
  add column if not exists started_at timestamptz;

alter table public.tournament_matches
  add column if not exists completed_at timestamptz;

alter table public.tournament_matches
  add column if not exists updated_at timestamptz default timezone('utc', now());

alter table public.tournament_matches
  add column if not exists reported_by uuid references auth.users(id);

alter table public.tournament_matches
  add column if not exists variant_rules text[] default array[]::text[];

alter table public.tournament_matches
  add column if not exists is_ai_match boolean default false;

alter table public.tournament_matches
  add column if not exists ai_opponent_label text;

alter table public.tournament_matches
  add column if not exists ai_opponent_difficulty text;

alter table public.tournament_matches
  add column if not exists round int default 1;

do $$
declare
  status_constraint text;
begin
  select conname into status_constraint
  from pg_constraint
  where conrelid = 'public.tournament_matches'::regclass
    and contype = 'c'
    and conname like 'tournament_matches_status%';

  if status_constraint is not null then
    execute format('alter table public.tournament_matches drop constraint %I', status_constraint);
  end if;

  execute 'alter table public.tournament_matches add constraint tournament_matches_status_check check (status in (''pending'',''playing'',''finished'',''cancelled''))';
end$$;

update public.tournament_matches
set status = case
      when status in ('completed','done') then 'finished'
      when status = 'in_progress' then 'playing'
      when status not in ('pending','playing','finished','cancelled') then 'pending'
      else status
    end,
    created_at = coalesce(created_at, timezone('utc', now())),
    updated_at = coalesce(updated_at, timezone('utc', now())),
    variant_rules = coalesce(variant_rules, array[]::text[]),
    round = coalesce(round, 1);

alter table public.tournament_matches
  alter column status set default 'pending';

alter table public.tournament_matches
  alter column created_at set default timezone('utc', now());

alter table public.tournament_matches
  alter column updated_at set default timezone('utc', now());

create index if not exists idx_tournament_matches_tournament on public.tournament_matches(tournament_id);
create index if not exists idx_tournament_matches_status on public.tournament_matches(status);

create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp_tournament_matches on public.tournament_matches;
create trigger set_timestamp_tournament_matches
  before update on public.tournament_matches
  for each row execute function public.trigger_set_timestamp();

-- REGISTRATIONS
create table if not exists public.tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  joined_at timestamptz not null default timezone('utc', now()),
  last_active_at timestamptz not null default timezone('utc', now()),
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  points numeric(5,2) not null default 0,
  current_match_id uuid references public.tournament_matches(id) on delete set null,
  is_waiting boolean not null default false
);

alter table public.tournament_registrations
  add column if not exists display_name text;

alter table public.tournament_registrations
  add column if not exists avatar_url text;

alter table public.tournament_registrations
  add column if not exists last_active_at timestamptz default timezone('utc', now());

alter table public.tournament_registrations
  add column if not exists wins integer default 0;

alter table public.tournament_registrations
  add column if not exists losses integer default 0;

alter table public.tournament_registrations
  add column if not exists draws integer default 0;

alter table public.tournament_registrations
  add column if not exists points numeric(5,2) default 0;

alter table public.tournament_registrations
  add column if not exists current_match_id uuid references public.tournament_matches(id) on delete set null;

alter table public.tournament_registrations
  add column if not exists is_waiting boolean default false;

update public.tournament_registrations
set joined_at = coalesce(joined_at, timezone('utc', now())),
    last_active_at = coalesce(last_active_at, timezone('utc', now())),
    wins = coalesce(wins, 0),
    losses = coalesce(losses, 0),
    draws = coalesce(draws, 0),
    points = coalesce(points, 0),
    is_waiting = coalesce(is_waiting, false);

alter table public.tournament_registrations
  alter column joined_at set default timezone('utc', now());

alter table public.tournament_registrations
  alter column last_active_at set default timezone('utc', now());

alter table public.tournament_registrations
  alter column wins set default 0;

alter table public.tournament_registrations
  alter column losses set default 0;

alter table public.tournament_registrations
  alter column draws set default 0;

alter table public.tournament_registrations
  alter column points set default 0;

alter table public.tournament_registrations
  alter column is_waiting set default false;

alter table public.tournament_registrations
  add constraint if not exists tournament_registrations_unique unique (tournament_id, user_id);

alter table public.tournament_registrations
  add constraint if not exists tournament_registrations_current_match_fkey
  foreign key (current_match_id) references public.tournament_matches(id) on delete set null;

create index if not exists idx_tournament_registrations_tournament on public.tournament_registrations(tournament_id);
create index if not exists idx_tournament_registrations_user on public.tournament_registrations(user_id);

-- VUE D’APERÇU
drop view if exists public.tournament_overview;
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
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lobbies'
      and policyname = 'lobbies_read_all'
  ) then
    create policy "lobbies_read_all" on public.lobbies for select using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tournaments'
      and policyname = 'tournaments_read_all'
  ) then
    create policy "tournaments_read_all" on public.tournaments for select using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tournament_matches'
      and policyname = 'matches_read_all'
  ) then
    create policy "matches_read_all" on public.tournament_matches for select using (true);
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tournament_registrations'
      and policyname = 'regs_read_owner'
  ) then
    execute 'drop policy "regs_read_owner" on public.tournament_registrations';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tournament_registrations'
      and policyname = 'Tournament registrations readable'
  ) then
    create policy "Tournament registrations readable" on public.tournament_registrations
      for select using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tournament_registrations'
      and policyname = 'Players can register'
  ) then
    create policy "Players can register" on public.tournament_registrations
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tournament_registrations'
      and policyname = 'Players manage their registration'
  ) then
    create policy "Players manage their registration" on public.tournament_registrations
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end$$;

-- PostgREST: recharger le cache du schéma
select pg_notify('pgrst', 'reload schema');
