-- Ensure lobby matchmaking columns and constraints match application expectations
ALTER TABLE public.lobbies
  ADD COLUMN IF NOT EXISTS mode TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS opponent_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS opponent_name TEXT;

-- Align defaults for lobby matchmaking columns
ALTER TABLE public.lobbies
  ALTER COLUMN mode SET DEFAULT 'player',
  ALTER COLUMN status SET DEFAULT 'waiting';

-- Backfill existing rows with sensible defaults
UPDATE public.lobbies
SET mode = 'player'
WHERE mode IS NULL OR mode NOT IN ('ai', 'player');

UPDATE public.lobbies
SET status = 'waiting'
WHERE status IS NULL OR status NOT IN ('waiting', 'matched', 'cancelled');

UPDATE public.lobbies
SET opponent_id = NULL,
    opponent_name = NULL;

-- Enforce not-null expectations
ALTER TABLE public.lobbies
  ALTER COLUMN mode SET NOT NULL,
  ALTER COLUMN status SET NOT NULL;

-- Recreate status constraint with allowed values
ALTER TABLE public.lobbies
  DROP CONSTRAINT IF EXISTS lobbies_status_check;

ALTER TABLE public.lobbies
  ADD CONSTRAINT lobbies_status_check CHECK (status IN ('waiting', 'matched', 'cancelled'));
