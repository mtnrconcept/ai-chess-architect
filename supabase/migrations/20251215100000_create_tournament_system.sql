-- Create tournaments table to orchestrate recurring competitive events
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  variant_name text not null,
  variant_source text,
  variant_rules text[] not null,
  variant_lobby_id uuid references public.lobbies(id),
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','running','completed','cancelled')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_tournaments_start_time on public.tournaments(start_time);
create index if not exists idx_tournaments_status on public.tournaments(status);

alter table public.tournaments enable row level security;

create policy if not exists "Tournaments are visible" on public.tournaments
  for select using (true);

-- Ensure we can update timestamps automatically
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger set_timestamp_tournaments
  before update on public.tournaments
  for each row execute function public.trigger_set_timestamp();

-- Matches table to track pairings and results
create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  lobby_id uuid references public.lobbies(id),
  table_number integer,
  player1_id uuid not null references auth.users(id) on delete cascade,
  player2_id uuid references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','cancelled')),
  result text check (result in ('player1','player2','draw')),
  winner_id uuid references auth.users(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  reported_by uuid references auth.users(id),
  variant_rules text[]
);

create index if not exists idx_tournament_matches_tournament on public.tournament_matches(tournament_id);
create index if not exists idx_tournament_matches_status on public.tournament_matches(status);

alter table public.tournament_matches enable row level security;

create policy if not exists "Tournament matches readable" on public.tournament_matches
  for select using (true);

create policy if not exists "Tournament matches managed by service role" on public.tournament_matches
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create trigger set_timestamp_tournament_matches
  before update on public.tournament_matches
  for each row execute function public.trigger_set_timestamp();

-- Registrations table to store player participation and standings
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
  add constraint tournament_registrations_unique unique (tournament_id, user_id);

alter table public.tournament_registrations
  add constraint tournament_registrations_current_match_fkey
  foreign key (current_match_id) references public.tournament_matches(id) on delete set null;

create index if not exists idx_tournament_registrations_tournament on public.tournament_registrations(tournament_id);
create index if not exists idx_tournament_registrations_user on public.tournament_registrations(user_id);

alter table public.tournament_registrations enable row level security;

create policy if not exists "Tournament registrations readable" on public.tournament_registrations
  for select using (true);

create policy if not exists "Players can register" on public.tournament_registrations
  for insert with check (auth.uid() = user_id);

create policy if not exists "Players manage their registration" on public.tournament_registrations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger set_timestamp_tournament_registrations
  before update on public.tournament_registrations
  for each row execute function public.trigger_set_timestamp();

-- Overview view consolidating counts for UI consumption
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
    count(*) filter (where status in ('pending','in_progress')) as active_matches,
    count(*) filter (where status = 'completed') as completed_matches
  from public.tournament_matches
  group by tournament_id
) matches on matches.tournament_id = t.id;

-- Helper view for leaderboard aggregation
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
