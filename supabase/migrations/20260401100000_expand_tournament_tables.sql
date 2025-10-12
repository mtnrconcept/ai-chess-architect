-- Ensure required extensions are available
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- Tournament rounds allow scheduling and progress tracking per stage
create table if not exists public.tournament_rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number int not null check (round_number > 0),
  name text,
  status text not null default 'scheduled' check (status in ('scheduled','running','completed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, round_number)
);

-- Each match can optionally be associated with a round
alter table public.tournament_matches
  add column if not exists round_id uuid references public.tournament_rounds(id) on delete set null,
  add column if not exists scheduled_at timestamptz,
  add column if not exists completed_at timestamptz;

-- Detailed results per player for each tournament match
create table if not exists public.tournament_match_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.tournament_matches(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null,
  player_slot text check (player_slot in ('white','black','bye')),
  result text not null check (result in ('win','loss','draw','bye','forfeit')),
  points numeric(6,2) not null default 0,
  recorded_at timestamptz not null default now(),
  unique (match_id, user_id)
);

create index if not exists ix_tournament_match_results_tournament_user
  on public.tournament_match_results (tournament_id, user_id);

-- Aggregate standings per tournament, updated by triggers
create table if not exists public.tournament_standings (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  byes int not null default 0,
  forfeits int not null default 0,
  points numeric(8,2) not null default 0,
  last_result_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create index if not exists ix_tournament_standings_rank
  on public.tournament_standings (tournament_id, points desc, wins desc, draws desc, updated_at desc);

-- Helper function to recalculate standings based on match results
create or replace function public.recalculate_tournament_standings(p_tournament_id uuid)
returns void as $$
begin
  delete from public.tournament_standings ts
  where ts.tournament_id = p_tournament_id;

  insert into public.tournament_standings (
    tournament_id,
    user_id,
    wins,
    losses,
    draws,
    byes,
    forfeits,
    points,
    last_result_at,
    updated_at
  )
  select
    r.tournament_id,
    r.user_id,
    count(*) filter (where r.result = 'win') as wins,
    count(*) filter (where r.result = 'loss') as losses,
    count(*) filter (where r.result = 'draw') as draws,
    count(*) filter (where r.result = 'bye') as byes,
    count(*) filter (where r.result = 'forfeit') as forfeits,
    coalesce(sum(r.points), 0) as points,
    max(r.recorded_at) as last_result_at,
    now() as updated_at
  from public.tournament_match_results r
  where r.tournament_id = p_tournament_id
  group by r.tournament_id, r.user_id;
end;
$$ language plpgsql set search_path = public;

-- Trigger to automatically refresh standings on result changes
create or replace function public.tournament_match_results_after_change()
returns trigger as $$
begin
  perform public.recalculate_tournament_standings(new.tournament_id);
  return new;
end;
$$ language plpgsql set search_path = public;

create or replace function public.tournament_match_results_after_delete()
returns trigger as $$
begin
  perform public.recalculate_tournament_standings(old.tournament_id);
  return old;
end;
$$ language plpgsql set search_path = public;

create trigger trg_tournament_match_results_after_ins
  after insert on public.tournament_match_results
  for each row execute function public.tournament_match_results_after_change();

create trigger trg_tournament_match_results_after_upd
  after update on public.tournament_match_results
  for each row execute function public.tournament_match_results_after_change();

create trigger trg_tournament_match_results_after_del
  after delete on public.tournament_match_results
  for each row execute function public.tournament_match_results_after_delete();

-- Standings view for simplified ranking consumption
create or replace view public.tournament_rankings as
select
  s.tournament_id,
  s.user_id,
  s.wins,
  s.losses,
  s.draws,
  s.byes,
  s.forfeits,
  s.points,
  s.last_result_at,
  row_number() over (
    partition by s.tournament_id
    order by s.points desc, s.wins desc, s.draws desc, s.last_result_at asc
  ) as rank
from public.tournament_standings s;

-- Update overview view to include ranking-ready stats
create or replace view public.tournament_overview as
select
  t.id,
  t.name,
  t.start_time,
  t.end_time,
  t.status,
  count(distinct r.id) as players,
  count(distinct m.id) as matches,
  coalesce(max(s.points), 0) as top_points
from public.tournaments t
left join public.tournament_registrations r on r.tournament_id = t.id
left join public.tournament_matches m on m.tournament_id = t.id
left join public.tournament_standings s on s.tournament_id = t.id
group by t.id;

-- Basic RLS for the new tables
alter table public.tournament_rounds enable row level security;
alter table public.tournament_match_results enable row level security;
alter table public.tournament_standings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where polname = 'tournament_rounds_read_all') then
    create policy "tournament_rounds_read_all" on public.tournament_rounds for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'tournament_match_results_read_all') then
    create policy "tournament_match_results_read_all" on public.tournament_match_results for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'tournament_standings_read_all') then
    create policy "tournament_standings_read_all" on public.tournament_standings for select using (true);
  end if;
end$$;

-- Refresh PostgREST cache so clients see new schema
select pg_notify('pgrst', 'reload schema');
