-- Schema for the post-game coach engine.

create type if not exists move_quality as enum (
  'brilliant',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
  'book',
  'forced'
);

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  pgn text,
  source text,
  created_at timestamptz not null default now(),
  eco_code text,
  result text,
  duration_ms integer
);

create table if not exists moves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  ply integer not null,
  san text not null,
  uci text not null,
  fen_before text not null,
  fen_after text not null,
  time_spent_ms integer,
  created_at timestamptz not null default now()
);

create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  status text not null check (status in ('queued', 'running', 'done', 'error')),
  depth integer,
  n_threads integer,
  hash_mb integer,
  llm_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id)
);

create table if not exists move_evals (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  ply integer not null,
  score_cp integer,
  score_mate integer,
  bestmove_uci text,
  pv text[],
  depth integer,
  seldepth integer,
  nodes bigint,
  time_ms integer,
  classification move_quality not null,
  themes text[] default '{}',
  created_at timestamptz not null default now()
);

create table if not exists coach_reports (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  summary_md text not null,
  key_moments jsonb[] default '{}',
  accuracy_white numeric,
  accuracy_black numeric,
  blunders_white integer,
  blunders_black integer,
  inacc_white integer,
  inacc_black integer,
  created_at timestamptz not null default now(),
  unique (game_id)
);

create table if not exists provider_logs (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  provider text not null,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  cost_est numeric,
  latency_ms integer,
  ok boolean default true,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists moves_game_ply_idx on moves (game_id, ply);
create index if not exists move_evals_game_ply_idx on move_evals (game_id, ply);
create index if not exists move_evals_themes_idx on move_evals using gin (themes);

alter table analyses
  add constraint analyses_game_fk unique (game_id);

alter table coach_reports
  add constraint coach_reports_game_fk unique (game_id);

alter table games enable row level security;
alter table analyses enable row level security;
alter table move_evals enable row level security;
alter table coach_reports enable row level security;

create policy if not exists "Users manage their games" on games
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy if not exists "Users manage their analyses" on analyses
  for all
  using (exists(select 1 from games g where g.id = analyses.game_id and g.owner_id = auth.uid()))
  with check (exists(select 1 from games g where g.id = analyses.game_id and g.owner_id = auth.uid()));

create policy if not exists "Users read their move evals" on move_evals
  for select
  using (exists(select 1 from games g where g.id = move_evals.game_id and g.owner_id = auth.uid()));

create policy if not exists "Users insert move evals" on move_evals
  for insert
  with check (exists(select 1 from games g where g.id = move_evals.game_id and g.owner_id = auth.uid()));

create policy if not exists "Users manage their reports" on coach_reports
  for all
  using (exists(select 1 from games g where g.id = coach_reports.game_id and g.owner_id = auth.uid()))
  with check (exists(select 1 from games g where g.id = coach_reports.game_id and g.owner_id = auth.uid()));
