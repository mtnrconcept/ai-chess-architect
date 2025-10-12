create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  pgn text,
  source text,
  result text,
  created_at timestamptz default now()
);

create table if not exists public.moves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.games(id) on delete cascade,
  ply int not null,
  san text,
  uci text,
  fen_before text,
  fen_after text,
  time_spent_ms int
);
create index on public.moves (game_id, ply);

create type move_quality as enum (
  'best','excellent','good','inaccuracy','mistake','blunder','great','brilliant','book','forced','miss'
);

create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  game_id uuid unique references public.games(id) on delete cascade,
  status text check (status in ('queued','running','done','error')) default 'queued',
  depth int,
  multi_pv int,
  provider text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.move_evals (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.games(id) on delete cascade,
  ply int not null,
  score_cp int,
  score_mate int,
  best_uci text,
  pv jsonb,
  depth int,
  delta_ep numeric,
  quality move_quality,
  themes text[],
  coach_json jsonb
);
create index on public.move_evals (game_id, ply);
create index on public.move_evals using gin (themes);

create table if not exists public.coach_reports (
  id uuid primary key default gen_random_uuid(),
  game_id uuid unique references public.games(id) on delete cascade,
  accuracy_white numeric,
  accuracy_black numeric,
  key_moments jsonb,
  summary_md text
);

create table if not exists public.position_cache (
  hash text primary key,
  eval jsonb,
  created_at timestamptz default now()
);

-- RLS (exemple simple; adapte à ton auth)
alter table public.games enable row level security;
alter table public.moves enable row level security;
alter table public.analyses enable row level security;
alter table public.move_evals enable row level security;
alter table public.coach_reports enable row level security;

create policy p_games_owner on public.games
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy p_moves_owner on public.moves
  using (game_id in (select id from public.games where owner_id = auth.uid()));

create policy p_analyses_owner on public.analyses
  using (game_id in (select id from public.games where owner_id = auth.uid()));

create policy p_move_evals_owner on public.move_evals
  using (game_id in (select id from public.games where owner_id = auth.uid()));

create policy p_reports_owner on public.coach_reports
  using (game_id in (select id from public.games where owner_id = auth.uid()));
