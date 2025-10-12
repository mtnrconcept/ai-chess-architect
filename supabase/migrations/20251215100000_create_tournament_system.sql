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

-- Legacy schema alignment: rename old columns if the table predates this migration
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tournaments'
      and column_name = 'title'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tournaments'
      and column_name = 'name'
  ) then
    execute 'alter table public.tournaments rename column title to name';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tournaments'
      and column_name = 'starts_at'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tournaments'
      and column_name = 'start_time'
  ) then
    execute 'alter table public.tournaments rename column starts_at to start_time';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tournaments'
      and column_name = 'ends_at'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tournaments'
      and column_name = 'end_time'
  ) then
    execute 'alter table public.tournaments rename column ends_at to end_time';
  end if;
end;
$$;

-- Ensure all expected columns exist with correct defaults
alter table public.tournaments
  add column if not exists name text;

alter table public.tournaments
  add column if not exists description text;

alter table public.tournaments
  add column if not exists variant_name text;

alter table public.tournaments
  add column if not exists variant_source text;

alter table public.tournaments
  add column if not exists variant_rules text[] default array[]::text[];

alter table public.tournaments
  add column if not exists variant_lobby_id uuid references public.lobbies(id);

alter table public.tournaments
  add column if not exists start_time timestamptz;

alter table public.tournaments
  add column if not exists end_time timestamptz;

alter table public.tournaments
  add column if not exists status text default 'scheduled';

alter table public.tournaments
  add column if not exists created_at timestamptz default timezone('utc', now());

alter table public.tournaments
  add column if not exists updated_at timestamptz default timezone('utc', now());

update public.tournaments
set variant_name = coalesce(variant_name, 'Standard'),
    variant_rules = coalesce(variant_rules, array[]::text[]),
    status = coalesce(status, 'scheduled'),
    start_time = coalesce(start_time, timezone('utc', now())),
    end_time = coalesce(end_time, timezone('utc', now()) + interval '1 hour'),
    created_at = coalesce(created_at, timezone('utc', now())),
    updated_at = coalesce(updated_at, timezone('utc', now()));

alter table public.tournaments
  alter column name set not null;

alter table public.tournaments
  alter column variant_name set not null;

alter table public.tournaments
  alter column variant_rules set not null;

alter table public.tournaments
  alter column variant_rules set default array[]::text[];

alter table public.tournaments
  alter column start_time set not null;

alter table public.tournaments
  alter column end_time set not null;

alter table public.tournaments
  alter column status set not null;

alter table public.tournaments
  alter column status set default 'scheduled';

alter table public.tournaments
  alter column created_at set not null;

alter table public.tournaments
  alter column updated_at set not null;

create index if not exists idx_tournaments_start_time on public.tournaments(start_time);
create index if not exists idx_tournaments_status on public.tournaments(status);

alter table public.tournaments enable row level security;

drop policy if exists "Tournaments are visible" on public.tournaments;
create policy "Tournaments are visible" on public.tournaments
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

-- Legacy schema alignment for tournament_matches
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tournament_matches'
      and column_name = 'player_a'
  ) then
    execute 'alter table public.tournament_matches rename column player_a to player1_id';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tournament_matches'
      and column_name = 'player_b'
  ) then
    execute 'alter table public.tournament_matches rename column player_b to player2_id';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tournament_matches'
      and column_name = 'scheduled_at'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tournament_matches'
      and column_name = 'started_at'
  ) then
    execute 'alter table public.tournament_matches rename column scheduled_at to started_at';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tournament_matches'
      and column_name = 'result'
      and data_type = 'jsonb'
  ) then
    execute 'alter table public.tournament_matches drop column result';
  end if;
end;
$$;

alter table public.tournament_matches
  add column if not exists lobby_id uuid references public.lobbies(id);

alter table public.tournament_matches
  add column if not exists table_number integer;

alter table public.tournament_matches
  add column if not exists player1_id uuid references auth.users(id);

alter table public.tournament_matches
  add column if not exists player2_id uuid references auth.users(id);

alter table public.tournament_matches
  add column if not exists status text default 'pending';

alter table public.tournament_matches
  add column if not exists result text check (result in ('player1','player2','draw'));

alter table public.tournament_matches
  add column if not exists winner_id uuid references auth.users(id);

alter table public.tournament_matches
  add column if not exists started_at timestamptz;

alter table public.tournament_matches
  add column if not exists completed_at timestamptz;

alter table public.tournament_matches
  add column if not exists created_at timestamptz default timezone('utc', now());

alter table public.tournament_matches
  add column if not exists updated_at timestamptz default timezone('utc', now());

alter table public.tournament_matches
  add column if not exists reported_by uuid references auth.users(id);

alter table public.tournament_matches
  add column if not exists variant_rules text[];

update public.tournament_matches
set status = coalesce(status, 'pending'),
    created_at = coalesce(created_at, timezone('utc', now())),
    updated_at = coalesce(updated_at, timezone('utc', now())),
    variant_rules = coalesce(variant_rules, array[]::text[]);

alter table public.tournament_matches
  alter column status set default 'pending';

alter table public.tournament_matches
  alter column variant_rules set default array[]::text[];

alter table public.tournament_matches
  alter column tournament_id set not null;

alter table public.tournament_matches
  alter column status set not null;

alter table public.tournament_matches
  alter column created_at set not null;

alter table public.tournament_matches
  alter column updated_at set not null;

create index if not exists idx_tournament_matches_tournament on public.tournament_matches(tournament_id);
create index if not exists idx_tournament_matches_status on public.tournament_matches(status);

alter table public.tournament_matches enable row level security;

drop policy if exists "Tournament matches readable" on public.tournament_matches;
create policy "Tournament matches readable" on public.tournament_matches
  for select using (true);

drop policy if exists "Tournament matches managed by service role" on public.tournament_matches;
create policy "Tournament matches managed by service role" on public.tournament_matches
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

-- Legacy schema alignment for tournament_registrations
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tournament_registrations'
      and column_name = 'registered_at'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tournament_registrations'
      and column_name = 'joined_at'
  ) then
    execute 'alter table public.tournament_registrations rename column registered_at to joined_at';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tournament_registrations'
      and column_name = 'metadata'
  ) then
    execute 'alter table public.tournament_registrations drop column metadata';
  end if;
end;
$$;

alter table public.tournament_registrations
  add column if not exists user_id uuid references auth.users(id);

alter table public.tournament_registrations
  add column if not exists display_name text;

alter table public.tournament_registrations
  add column if not exists avatar_url text;

alter table public.tournament_registrations
  add column if not exists joined_at timestamptz default timezone('utc', now());

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
  add column if not exists current_match_id uuid;

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
  alter column tournament_id set not null;

alter table public.tournament_registrations
  alter column user_id set not null;

alter table public.tournament_registrations
  alter column joined_at set not null;

alter table public.tournament_registrations
  alter column last_active_at set not null;

alter table public.tournament_registrations
  alter column wins set not null;

alter table public.tournament_registrations
  alter column losses set not null;

alter table public.tournament_registrations
  alter column draws set not null;

alter table public.tournament_registrations
  alter column points set not null;

alter table public.tournament_registrations
  alter column is_waiting set not null;

alter table public.tournament_registrations
  add constraint tournament_registrations_unique unique (tournament_id, user_id);

alter table public.tournament_registrations
  add constraint tournament_registrations_current_match_fkey
  foreign key (current_match_id) references public.tournament_matches(id) on delete set null;

create index if not exists idx_tournament_registrations_tournament on public.tournament_registrations(tournament_id);
create index if not exists idx_tournament_registrations_user on public.tournament_registrations(user_id);

alter table public.tournament_registrations enable row level security;

drop policy if exists "Tournament registrations readable" on public.tournament_registrations;
create policy "Tournament registrations readable" on public.tournament_registrations
  for select using (true);

drop policy if exists "Players can register" on public.tournament_registrations;
create policy "Players can register" on public.tournament_registrations
  for insert with check (auth.uid() = user_id);

drop policy if exists "Players manage their registration" on public.tournament_registrations;
create policy "Players manage their registration" on public.tournament_registrations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger set_timestamp_tournament_registrations
  before update on public.tournament_registrations
  for each row execute function public.trigger_set_timestamp();

-- Overview view consolidating counts for UI consumption
drop view if exists public.tournament_overview;
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
drop view if exists public.tournament_leaderboard;
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
