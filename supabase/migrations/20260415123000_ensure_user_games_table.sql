-- Ensure the user_games table exists with the complete schema expected by edge functions
create table if not exists public.user_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  opponent_name text,
  opponent_type text not null default 'ai',
  result text not null check (result in ('win','loss','draw')),
  variant_name text,
  time_control text,
  player_color text not null,
  move_history jsonb not null,
  analysis_overview jsonb not null,
  starting_board jsonb not null,
  accuracy numeric not null,
  total_moves integer not null default 0,
  duration_seconds numeric,
  metadata jsonb,
  coach_summary text
);

-- Align important column defaults and constraints even if the table pre-exists
alter table public.user_games
  alter column created_at set default timezone('utc', now()),
  alter column opponent_type set default 'ai',
  alter column player_color set default 'white';

-- Ensure the player_color column only accepts valid chess colors
alter table public.user_games
  alter column player_color set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_games_player_color_check'
      and conrelid = 'public.user_games'::regclass
  ) then
    alter table public.user_games
      add constraint user_games_player_color_check
      check (player_color in ('white','black'));
  end if;
end;
$$;

-- Harden opponent type and scoring ranges when missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_games_opponent_type_check'
      AND conrelid = 'public.user_games'::regclass
  ) THEN
    ALTER TABLE public.user_games
      ADD CONSTRAINT user_games_opponent_type_check
      CHECK (opponent_type IN ('ai','player','local'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_games_accuracy_range_check'
      AND conrelid = 'public.user_games'::regclass
  ) THEN
    ALTER TABLE public.user_games
      ADD CONSTRAINT user_games_accuracy_range_check
      CHECK (accuracy >= 0 AND accuracy <= 100);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_games_total_moves_check'
      AND conrelid = 'public.user_games'::regclass
  ) THEN
    ALTER TABLE public.user_games
      ADD CONSTRAINT user_games_total_moves_check
      CHECK (total_moves >= 0);
  END IF;
END;
$$;

-- Ensure optional metadata columns exist when migrating older databases
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_games'
      AND column_name = 'coach_summary'
  ) THEN
    ALTER TABLE public.user_games
      ADD COLUMN coach_summary text;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_games'
      AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.user_games
      ADD COLUMN metadata jsonb;
  END IF;
END;
$$;

-- Index used by edge functions when reading a player's history
create index if not exists user_games_user_id_created_at_idx
  on public.user_games (user_id, created_at desc);

-- Enforce RLS and expected policies only once
alter table public.user_games enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_games'
      AND policyname = 'Players can read their games'
  ) THEN
    CREATE POLICY "Players can read their games"
      ON public.user_games
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_games'
      AND policyname = 'Players can save their games'
  ) THEN
    CREATE POLICY "Players can save their games"
      ON public.user_games
      FOR INSERT
      WITH CHECK (
        (auth.uid() = user_id)
        OR (auth.uid() IS NULL AND user_id IS NULL)
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_games'
      AND policyname = 'Players can update their games'
  ) THEN
    CREATE POLICY "Players can update their games"
      ON public.user_games
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

-- Make sure PostgREST refreshes its cached schema
select pg_notify('pgrst', 'reload schema');
