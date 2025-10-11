-- Ensure the user_games table exists with the required shape
create table if not exists public.user_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  opponent_name text,
  opponent_type text not null default 'ai',
  result text not null check (result in ('win','loss','draw')),
  variant_name text,
  time_control text,
  player_color text not null check (player_color in ('white','black')),
  move_history jsonb not null,
  analysis_overview jsonb not null,
  starting_board jsonb not null,
  accuracy numeric not null,
  total_moves integer not null default 0,
  duration_seconds numeric,
  metadata jsonb,
  coach_summary text
);

-- Ensure important indexes exist
create index if not exists user_games_user_id_created_at_idx
  on public.user_games (user_id, created_at desc);

-- Harden enum style constraints for opponent_type
alter table public.user_games
  add constraint user_games_opponent_type_check
  check (opponent_type in ('ai','player','local'));

-- Ensure totals and accuracy stay within expected ranges
alter table public.user_games
  add constraint user_games_accuracy_range_check
  check (accuracy >= 0 and accuracy <= 100);

alter table public.user_games
  add constraint user_games_total_moves_check
  check (total_moves >= 0);

-- Enable Row Level Security and expose safe policies
alter table public.user_games enable row level security;

-- Allow players to read their own games
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_games'
      and policyname = 'Players can read their games'
  ) then
    create policy "Players can read their games"
      on public.user_games
      for select
      using (auth.uid() = user_id);
  end if;
end;
$$;

-- Allow players to store completed games (including guests without an account)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_games'
      and policyname = 'Players can save their games'
  ) then
    create policy "Players can save their games"
      on public.user_games
      for insert
      with check (
        (auth.uid() = user_id)
        or (auth.uid() is null and user_id is null)
      );
  end if;
end;
$$;

-- Allow players to update metadata they own (coach summaries, etc.)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_games'
      and policyname = 'Players can update their games'
  ) then
    create policy "Players can update their games"
      on public.user_games
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end;
$$;
