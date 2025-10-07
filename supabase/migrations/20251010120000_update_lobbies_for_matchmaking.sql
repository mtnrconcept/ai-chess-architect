-- Extend lobbies table to support multiplayer matchmaking metadata
ALTER TABLE public.lobbies
  ADD COLUMN mode TEXT NOT NULL DEFAULT 'player' CHECK (mode IN ('ai', 'player')),
  ADD COLUMN status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'matched', 'cancelled')),
  ADD COLUMN opponent_id UUID REFERENCES auth.users(id),
  ADD COLUMN opponent_name TEXT;

-- Ensure existing rows have consistent status values
UPDATE public.lobbies
SET status = CASE
  WHEN is_active THEN 'waiting'
  ELSE 'matched'
END
WHERE status IS DISTINCT FROM CASE
  WHEN is_active THEN 'waiting'
  ELSE 'matched'
END;

-- Refresh policies to allow players to join available lobbies
DROP POLICY IF EXISTS "Creators can update their lobbies" ON public.lobbies;

CREATE POLICY "Creators manage their lobbies"
  ON public.lobbies FOR UPDATE
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Players can join waiting lobbies"
  ON public.lobbies FOR UPDATE
  USING (status = 'waiting' AND mode = 'player')
  WITH CHECK (
    status = 'matched'
    AND is_active = false
    AND opponent_id = auth.uid()
  );

-- Index to speed up lobby status lookups
CREATE INDEX IF NOT EXISTS idx_lobbies_status ON public.lobbies(status);
