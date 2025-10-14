-- Align tournament core schema with UI expectations
-- 1) Ensure enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tournament_status') THEN
    CREATE TYPE tournament_status AS ENUM ('draft','scheduled','active','completed','cancelled');
  END IF;
END
$$;

-- 2) Ensure tournaments table exists with required columns
CREATE TABLE IF NOT EXISTS public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status tournament_status NOT NULL DEFAULT 'scheduled',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- 3) Upgrade existing schema if table already present with legacy columns
DO $$
DECLARE
  legacy_status_check text;
BEGIN
  -- Drop any legacy check constraint on status before converting to enum
  SELECT conname INTO legacy_status_check
  FROM pg_constraint
  WHERE conrelid = 'public.tournaments'::regclass
    AND contype = 'c'
    AND conname LIKE 'tournaments_status%';

  IF legacy_status_check IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.tournaments DROP CONSTRAINT %I', legacy_status_check);
  END IF;

  -- Rename legacy columns if necessary
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'name'
  ) THEN
    EXECUTE 'ALTER TABLE public.tournaments RENAME COLUMN name TO title';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'start_time'
  ) THEN
    EXECUTE 'ALTER TABLE public.tournaments RENAME COLUMN start_time TO starts_at';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'end_time'
  ) THEN
    EXECUTE 'ALTER TABLE public.tournaments RENAME COLUMN end_time TO ends_at';
  END IF;

  -- Ensure mandatory columns exist
  EXECUTE 'ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS title text';
  EXECUTE 'ALTER TABLE public.tournaments ALTER COLUMN title SET NOT NULL';
  EXECUTE 'ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS description text';
  EXECUTE 'ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS status tournament_status';
  EXECUTE 'ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS starts_at timestamptz';
  EXECUTE 'ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS ends_at timestamptz';
  EXECUTE 'ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL';
  EXECUTE 'ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT timezone(''utc'', now())';
  EXECUTE 'ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone(''utc'', now())';

  -- Backfill title from legacy column if present
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'title'
  ) THEN
    UPDATE public.tournaments SET title = COALESCE(title, 'Tournoi Voltus') WHERE title IS NULL;
  END IF;

  -- Backfill starts_at/ends_at from any legacy data
  UPDATE public.tournaments
  SET
    starts_at = COALESCE(starts_at, timezone('utc', now())),
    ends_at = COALESCE(ends_at, timezone('utc', now()) + interval '2 hours'),
    status = COALESCE(status, 'scheduled')
  WHERE TRUE;

  -- Normalize running -> active before casting
  UPDATE public.tournaments SET status = 'active'::tournament_status
  WHERE status::text = 'running';

  -- Cast text columns to enum if necessary
  BEGIN
    EXECUTE 'ALTER TABLE public.tournaments ALTER COLUMN status TYPE tournament_status USING status::tournament_status';
  EXCEPTION
    WHEN others THEN
      -- Column might already be of the correct type
      NULL;
  END;

  EXECUTE 'ALTER TABLE public.tournaments ALTER COLUMN status SET DEFAULT ''scheduled''';
  EXECUTE 'ALTER TABLE public.tournaments ALTER COLUMN starts_at SET NOT NULL';
  EXECUTE 'ALTER TABLE public.tournaments ALTER COLUMN ends_at SET NOT NULL';
  EXECUTE 'ALTER TABLE public.tournaments ALTER COLUMN created_at SET NOT NULL';
  EXECUTE 'ALTER TABLE public.tournaments ALTER COLUMN updated_at SET NOT NULL';
END
$$;

-- 4) Ensure indexes exist on status and time window
DROP INDEX IF EXISTS idx_tournaments_start_time;
DROP INDEX IF EXISTS idx_tournaments_status;
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON public.tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_window ON public.tournaments(starts_at, ends_at);

-- 5) Participants table
CREATE TABLE IF NOT EXISTS public.tournament_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tournament_id, user_id)
);

-- 6) Matches table (minimal fields required by UI)
CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  lobby_id uuid REFERENCES public.lobbies(id),
  table_number integer,
  player1_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player2_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  result text,
  winner_id uuid REFERENCES auth.users(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  reported_by uuid REFERENCES auth.users(id),
  variant_rules text[],
  room_id text,
  is_ai_match boolean DEFAULT false,
  ai_opponent_label text,
  ai_opponent_difficulty text,
  round integer DEFAULT 1
);

DO $$
DECLARE
  match_status_check text;
BEGIN
  SELECT conname INTO match_status_check
  FROM pg_constraint
  WHERE conrelid = 'public.tournament_matches'::regclass
    AND contype = 'c'
    AND conname LIKE 'tournament_matches_status%';

  IF match_status_check IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.tournament_matches DROP CONSTRAINT %I', match_status_check);
  END IF;

  -- Align legacy status values with the new convention
  UPDATE public.tournament_matches SET status = 'playing' WHERE status IN ('in_progress');
  UPDATE public.tournament_matches SET status = 'finished' WHERE status IN ('completed');

  -- Ensure column defaults and constraints reflect the new status lifecycle
  EXECUTE 'ALTER TABLE public.tournament_matches ALTER COLUMN status SET DEFAULT ''pending''';
  EXECUTE 'ALTER TABLE public.tournament_matches ADD CONSTRAINT IF NOT EXISTS tournament_matches_status_check CHECK (status IN (''pending'',''playing'',''finished'',''cancelled''))';
END
$$;

-- 7) Active tournaments view aligned with UI filters
CREATE OR REPLACE VIEW public.active_tournaments AS
SELECT
  id,
  title,
  description,
  status,
  starts_at,
  ends_at,
  created_by,
  created_at,
  updated_at
FROM public.tournaments
WHERE status = 'active'
  AND starts_at <= timezone('utc', now())
  AND ends_at >= timezone('utc', now());

CREATE OR REPLACE VIEW public.tournament_overview AS
SELECT
  t.id,
  t.title,
  t.description,
  t.variant_name,
  t.variant_source,
  t.variant_rules,
  t.variant_lobby_id,
  t.starts_at,
  t.ends_at,
  t.status,
  t.created_at,
  t.updated_at,
  COALESCE(reg.player_count, 0) AS player_count,
  COALESCE(matches.active_matches, 0) AS active_match_count,
  COALESCE(matches.finished_matches, 0) AS completed_match_count
FROM public.tournaments t
LEFT JOIN (
  SELECT tournament_id, COUNT(*) AS player_count
  FROM public.tournament_registrations
  GROUP BY tournament_id
) reg ON reg.tournament_id = t.id
LEFT JOIN (
  SELECT
    tournament_id,
    COUNT(*) FILTER (WHERE status IN ('pending','playing')) AS active_matches,
    COUNT(*) FILTER (WHERE status = 'finished') AS finished_matches
  FROM public.tournament_matches
  GROUP BY tournament_id
) matches ON matches.tournament_id = t.id;

-- 8) Enable RLS and create read policies
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tournaments' AND policyname = 'tournaments_select_public'
  ) THEN
    CREATE POLICY tournaments_select_public
      ON public.tournaments
      FOR SELECT
      USING (status IN ('scheduled','active'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tournament_participants' AND policyname = 'participants_select_public'
  ) THEN
    CREATE POLICY participants_select_public
      ON public.tournament_participants
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tournament_matches' AND policyname = 'matches_select_public'
  ) THEN
    CREATE POLICY matches_select_public
      ON public.tournament_matches
      FOR SELECT
      USING (true);
  END IF;
END
$$;

-- 9) Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.trigger_set_tournaments_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_timestamp_tournaments ON public.tournaments;
CREATE TRIGGER set_timestamp_tournaments
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_tournaments_updated_at();
