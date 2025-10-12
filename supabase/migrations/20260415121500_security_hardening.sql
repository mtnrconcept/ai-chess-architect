-- Ensure the user_games table exists with hardened defaults
create table if not exists public.user_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  opponent_name text,
  opponent_type text not null default 'ai',
  result text not null check (result in ('win','loss','draw')),
  variant_name text,
  time_control text,
  player_color text not null,
  move_history jsonb not null default '[]'::jsonb,
  analysis_overview jsonb not null default '{}'::jsonb,
  starting_board jsonb not null,
  accuracy numeric,
  total_moves integer not null default 0,
  duration_seconds numeric,
  metadata jsonb,
  coach_summary text
);

-- Remove orphaned data before enforcing constraints
delete from public.user_games where user_id is null;

-- Align column constraints with application expectations
alter table public.user_games
  alter column user_id set not null,
  alter column move_history set default '[]'::jsonb,
  alter column analysis_overview set default '{}'::jsonb,
  alter column player_color set default 'white';

-- Guard against invalid player_color values when column already exists
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_games'::regclass
      and conname = 'user_games_player_color_check'
  ) then
    alter table public.user_games
      add constraint user_games_player_color_check
      check (player_color in ('white','black'));
  end if;
end;
$$;

create index if not exists user_games_user_id_created_at_idx
  on public.user_games (user_id, created_at desc);

-- Harden row level security
alter table public.user_games enable row level security;

drop policy if exists "Users can view their games" on public.user_games;
drop policy if exists "Users can view own games" on public.user_games;
drop policy if exists "Users can manage their games" on public.user_games;
drop policy if exists "Users can insert their games" on public.user_games;
drop policy if exists "Users can update their games" on public.user_games;
drop policy if exists "Users can delete their games" on public.user_games;

create policy "Users can view their games"
  on public.user_games for select
  using (auth.uid() = user_id);

create policy "Users can insert their games"
  on public.user_games for insert
  with check (auth.uid() = user_id);

create policy "Users can update their games"
  on public.user_games for update
  using (auth.uid() = user_id);

create policy "Users can delete their games"
  on public.user_games for delete
  using (auth.uid() = user_id);

-- Custom chess rules must always have an owner
delete from public.custom_chess_rules where user_id is null;
alter table public.custom_chess_rules
  alter column user_id set not null;

-- Lobbies must always have a creator
delete from public.lobbies where creator_id is null;
alter table public.lobbies
  alter column creator_id set not null;
