create table if not exists public.user_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  opponent_name text,
  opponent_type text not null default 'ai',
  result text not null check (result in ('win','loss','draw')),
  variant_name text,
  time_control text,
  player_color text not null default 'white',
  move_history jsonb not null,
  analysis_overview jsonb not null,
  starting_board jsonb not null,
  accuracy numeric not null,
  total_moves integer not null default 0,
  duration_seconds numeric,
  metadata jsonb,
  coach_summary text
);

create index if not exists user_games_user_id_created_at_idx on public.user_games (user_id, created_at desc);
