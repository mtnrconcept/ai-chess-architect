-- Create user_games table for storing game history
CREATE TABLE IF NOT EXISTS public.user_games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  opponent_name TEXT,
  opponent_type TEXT NOT NULL CHECK (opponent_type IN ('ai', 'human', 'self')),
  result TEXT NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
  variant_name TEXT,
  time_control TEXT,
  player_color TEXT NOT NULL CHECK (player_color IN ('white', 'black')),
  move_history JSONB NOT NULL,
  analysis_overview JSONB,
  starting_board JSONB,
  accuracy NUMERIC(5,2),
  total_moves INTEGER,
  duration_seconds INTEGER,
  coach_summary TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for user_games
CREATE INDEX IF NOT EXISTS idx_user_games_user_id ON public.user_games(user_id);
CREATE INDEX IF NOT EXISTS idx_user_games_created_at ON public.user_games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_games_result ON public.user_games(result);

-- Enable RLS on user_games
ALTER TABLE public.user_games ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for user_games
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can view their own games" ON public.user_games;
  DROP POLICY IF EXISTS "Users can insert their own games" ON public.user_games;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Create RLS policies for user_games
CREATE POLICY "Users can view their own games"
  ON public.user_games FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own games"
  ON public.user_games FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create tournament_matches table
CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  player1_id UUID NOT NULL,
  player2_id UUID,
  player1_name TEXT,
  player2_name TEXT,
  round INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  winner_id UUID,
  result TEXT CHECK (result IN ('white', 'black', 'draw', 'forfeit')),
  game_data JSONB,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for tournament_matches
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_id ON public.tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_player1_id ON public.tournament_matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_player2_id ON public.tournament_matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_status ON public.tournament_matches(status);

-- Enable RLS on tournament_matches
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for tournament_matches
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can view all matches" ON public.tournament_matches;
  DROP POLICY IF EXISTS "Players can update their matches" ON public.tournament_matches;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Create RLS policies for tournament_matches
CREATE POLICY "Users can view all matches"
  ON public.tournament_matches FOR SELECT
  USING (true);

CREATE POLICY "Players can update their matches"
  ON public.tournament_matches FOR UPDATE
  USING (auth.uid() = player1_id OR auth.uid() = player2_id);

-- Add trigger for updated_at on tournament_matches
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_tournament_matches_updated_at'
  ) THEN
    CREATE TRIGGER update_tournament_matches_updated_at
      BEFORE UPDATE ON public.tournament_matches
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Add points column to tournament_registrations (was missing)
ALTER TABLE public.tournament_registrations 
ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0;

-- Add mode column to lobbies
ALTER TABLE public.lobbies
ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'casual' CHECK (mode IN ('casual', 'ranked', 'custom'));

-- Create tournament_overview view
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
  t.max_participants,
  t.created_at,
  t.updated_at,
  COUNT(DISTINCT tr.id) AS player_count,
  COUNT(DISTINCT CASE WHEN tm.status = 'active' THEN tm.id END) AS active_match_count,
  COUNT(DISTINCT CASE WHEN tm.status = 'completed' THEN tm.id END) AS completed_match_count
FROM public.tournaments t
LEFT JOIN public.tournament_registrations tr ON t.id = tr.tournament_id
LEFT JOIN public.tournament_matches tm ON t.id = tm.tournament_id
GROUP BY t.id;