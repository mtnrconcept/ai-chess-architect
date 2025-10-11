-- Ensure required extensions for UUID generation
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- Helper trigger to maintain updated_at timestamps
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

-- Core tournaments table definition
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  variant_name text not null,
  variant_rules text[] not null default '{}'::text[],
  variant_source text,
  variant_lobby_id uuid references public.lobbies(id),
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'scheduled',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Align existing tournaments table to expected structure
alter table public.tournaments
  add column if not exists description text,
  add column if not exists variant_name text,
  add column if not exists variant_rules text[] not null default '{}'::text[],
  add column if not exists variant_source text,
  add column if not exists variant_lobby_id uuid references public.lobbies(id),
  add column if not exists status text not null default 'scheduled',
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.tournaments
set variant_name = coalesce(nullif(trim(variant_name), ''), 'Voltus Tournament')
where variant_name is null or trim(variant_name) = '';

alter table public.tournaments
  alter column variant_name set not null,
  alter column variant_name drop default;

-- Ensure variant_rules uses the text[] type even if a previous migration introduced jsonb
alter table public.tournaments
  alter column variant_rules type text[] using case
    when variant_rules is null then '{}'::text[]
    when pg_typeof(variant_rules)::text = 'text[]' then variant_rules
    when pg_typeof(variant_rules)::text = 'jsonb' then coalesce(array(select jsonb_array_elements_text(variant_rules)), '{}'::text[])
    else array[variant_rules::text]
  end,
  alter column variant_rules set default '{}'::text[],
  alter column variant_rules set not null;

-- Normalize status constraint and defaults
alter table public.tournaments
  drop constraint if exists tournaments_status_check;

alter table public.tournaments
  add constraint tournaments_status_check
  check (status in ('scheduled', 'running', 'completed', 'cancelled'));

alter table public.tournaments
  alter column status set default 'scheduled';

-- Allow known values for variant_source while keeping it optional
alter table public.tournaments
  drop constraint if exists tournaments_variant_source_check;

alter table public.tournaments
  add constraint tournaments_variant_source_check
  check (variant_source is null or variant_source in ('lobby', 'fallback'));

-- Ensure variant_lobby_id points to lobbies and allows nulls
alter table public.tournaments
  drop constraint if exists tournaments_variant_lobby_id_fkey;

alter table public.tournaments
  add constraint tournaments_variant_lobby_id_fkey
  foreign key (variant_lobby_id) references public.lobbies(id) on delete set null;

drop trigger if exists set_timestamp_tournaments on public.tournaments;
create trigger set_timestamp_tournaments
  before update on public.tournaments
  for each row
  execute function public.trigger_set_timestamp();

-- Indexes & uniqueness helpers
create index if not exists idx_tournaments_start_time on public.tournaments(start_time);
create index if not exists idx_tournaments_status on public.tournaments(status);
create unique index if not exists ux_tournaments_start_variant on public.tournaments(start_time, variant_name);

-- Tournament matches table definition
create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  lobby_id uuid references public.lobbies(id),
  table_number integer,
  player1_id uuid not null references auth.users(id) on delete cascade,
  player2_id uuid references auth.users(id) on delete cascade,
  status text not null default 'pending',
  result text check (result in ('player1', 'player2', 'draw')),
  winner_id uuid references auth.users(id),
  reported_by uuid references auth.users(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  variant_rules text[]
);

alter table public.tournament_matches
  add column if not exists table_number integer,
  add column if not exists player1_id uuid,
  add column if not exists player2_id uuid,
  add column if not exists result text,
  add column if not exists winner_id uuid,
  add column if not exists reported_by uuid,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists variant_rules text[];

alter table public.tournament_matches
  drop constraint if exists tournament_matches_status_check;

alter table public.tournament_matches
  add constraint tournament_matches_status_check
  check (status in ('pending', 'in_progress', 'completed', 'cancelled'));

alter table public.tournament_matches
  drop constraint if exists tournament_matches_result_check;

alter table public.tournament_matches
  add constraint tournament_matches_result_check
  check (result is null or result in ('player1', 'player2', 'draw'));

alter table public.tournament_matches
  alter column player1_id set not null,
  alter column status set default 'pending';

alter table public.tournament_matches
  drop constraint if exists tournament_matches_player1_id_fkey;

alter table public.tournament_matches
  add constraint tournament_matches_player1_id_fkey
  foreign key (player1_id) references auth.users(id) on delete cascade;

alter table public.tournament_matches
  drop constraint if exists tournament_matches_player2_id_fkey;

alter table public.tournament_matches
  add constraint tournament_matches_player2_id_fkey
  foreign key (player2_id) references auth.users(id) on delete set null;

alter table public.tournament_matches
  drop constraint if exists tournament_matches_winner_id_fkey;

alter table public.tournament_matches
  add constraint tournament_matches_winner_id_fkey
  foreign key (winner_id) references auth.users(id) on delete set null;

alter table public.tournament_matches
  drop constraint if exists tournament_matches_reported_by_fkey;

alter table public.tournament_matches
  add constraint tournament_matches_reported_by_fkey
  foreign key (reported_by) references auth.users(id) on delete set null;

create index if not exists idx_tournament_matches_tournament on public.tournament_matches(tournament_id);
create index if not exists idx_tournament_matches_status on public.tournament_matches(status);

drop trigger if exists set_timestamp_tournament_matches on public.tournament_matches;
create trigger set_timestamp_tournament_matches
  before update on public.tournament_matches
  for each row
  execute function public.trigger_set_timestamp();

-- Tournament registrations table definition
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
  current_match_id uuid,
  is_waiting boolean not null default false
);

alter table public.tournament_registrations
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists last_active_at timestamptz not null default timezone('utc', now()),
  add column if not exists wins integer not null default 0,
  add column if not exists losses integer not null default 0,
  add column if not exists draws integer not null default 0,
  add column if not exists points numeric(5,2) not null default 0,
  add column if not exists current_match_id uuid,
  add column if not exists is_waiting boolean not null default false;

alter table public.tournament_registrations
  drop constraint if exists tournament_registrations_current_match_fkey;

alter table public.tournament_registrations
  add constraint tournament_registrations_current_match_fkey
  foreign key (current_match_id) references public.tournament_matches(id) on delete set null;

alter table public.tournament_registrations
  add constraint if not exists tournament_registrations_unique unique (tournament_id, user_id);

create index if not exists idx_tournament_registrations_tournament on public.tournament_registrations(tournament_id);
create index if not exists idx_tournament_registrations_user on public.tournament_registrations(user_id);

drop trigger if exists set_timestamp_tournament_registrations on public.tournament_registrations;
create trigger set_timestamp_tournament_registrations
  before update on public.tournament_registrations
  for each row
  execute function public.trigger_set_timestamp();

-- RLS policies to expose read access while keeping mutations constrained
alter table public.tournaments enable row level security;
alter table public.tournament_matches enable row level security;
alter table public.tournament_registrations enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournaments' and polname = 'tournaments_are_visible') then
    create policy "tournaments_are_visible" on public.tournaments for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_matches' and polname = 'tournament_matches_readable') then
    create policy "tournament_matches_readable" on public.tournament_matches for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_matches' and polname = 'tournament_matches_service_manage') then
    create policy "tournament_matches_service_manage" on public.tournament_matches
      for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_registrations' and polname = 'tournament_registrations_readable') then
    create policy "tournament_registrations_readable" on public.tournament_registrations for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_registrations' and polname = 'tournament_registrations_player_insert') then
    create policy "tournament_registrations_player_insert" on public.tournament_registrations
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_registrations' and polname = 'tournament_registrations_player_update') then
    create policy "tournament_registrations_player_update" on public.tournament_registrations
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end$$;

-- Views powering tournament UI components
create or replace view public.tournament_overview as
select
  t.id,
  t.name,
  t.description,
  t.variant_name,
  t.variant_source,
  t.variant_rules,
  t.variant_lobby_id,
  t.start_time,
  t.end_time,
  t.status,
  t.created_at,
  t.updated_at,
  coalesce(reg.player_count, 0) as player_count,
  coalesce(matches.active_matches, 0) as active_match_count,
  coalesce(matches.completed_matches, 0) as completed_match_count
from public.tournaments t
left join (
  select tournament_id, count(*) as player_count
  from public.tournament_registrations
  group by tournament_id
) reg on reg.tournament_id = t.id
left join (
  select
    tournament_id,
    count(*) filter (where status in ('pending', 'in_progress')) as active_matches,
    count(*) filter (where status = 'completed') as completed_matches
  from public.tournament_matches
  group by tournament_id
) matches on matches.tournament_id = t.id;

create or replace view public.tournament_leaderboard as
select
  tr.tournament_id,
  tr.user_id,
  tr.display_name,
  tr.avatar_url,
  tr.wins,
  tr.losses,
  tr.draws,
  tr.points,
  tr.joined_at,
  tr.last_active_at
from public.tournament_registrations tr;

-- Notify PostgREST to refresh cached schema after structural changes
select pg_notify('pgrst', 'reload schema');
