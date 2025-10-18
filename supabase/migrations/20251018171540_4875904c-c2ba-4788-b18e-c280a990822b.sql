-- Add missing tags column to custom_chess_rules
ALTER TABLE public.custom_chess_rules 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Create tournaments table
CREATE TABLE IF NOT EXISTS public.tournaments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  variant_name TEXT NOT NULL,
  variant_rules TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  variant_source TEXT DEFAULT 'fallback',
  variant_lobby_id TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  max_participants INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for tournaments
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON public.tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_starts_at ON public.tournaments(starts_at);
CREATE INDEX IF NOT EXISTS idx_tournaments_ends_at ON public.tournaments(ends_at);
CREATE INDEX IF NOT EXISTS idx_tournaments_variant_name ON public.tournaments(variant_name);

-- Enable RLS on tournaments
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Everyone can view tournaments" ON public.tournaments;
  DROP POLICY IF EXISTS "Only admins can insert tournaments" ON public.tournaments;
  DROP POLICY IF EXISTS "Only admins can update tournaments" ON public.tournaments;
  DROP POLICY IF EXISTS "Only admins can delete tournaments" ON public.tournaments;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Create RLS policies for tournaments
CREATE POLICY "Everyone can view tournaments"
  ON public.tournaments FOR SELECT
  USING (true);

CREATE POLICY "Only admins can insert tournaments"
  ON public.tournaments FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Only admins can update tournaments"
  ON public.tournaments FOR UPDATE
  USING (false);

CREATE POLICY "Only admins can delete tournaments"
  ON public.tournaments FOR DELETE
  USING (false);

-- Create tournament_registrations table
CREATE TABLE IF NOT EXISTS public.tournament_registrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  display_name TEXT,
  rating INTEGER DEFAULT 1200,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  score NUMERIC(10,2) DEFAULT 0,
  match_id TEXT,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'active', 'eliminated', 'withdrawn')),
  registered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, user_id)
);

-- Create indexes for tournament_registrations
CREATE INDEX IF NOT EXISTS idx_tournament_registrations_tournament_id ON public.tournament_registrations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_registrations_user_id ON public.tournament_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_registrations_status ON public.tournament_registrations(status);

-- Enable RLS on tournament_registrations
ALTER TABLE public.tournament_registrations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for tournament_registrations
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can view all registrations" ON public.tournament_registrations;
  DROP POLICY IF EXISTS "Users can register themselves" ON public.tournament_registrations;
  DROP POLICY IF EXISTS "Users can update their own registrations" ON public.tournament_registrations;
  DROP POLICY IF EXISTS "Users can delete their own registrations" ON public.tournament_registrations;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Create RLS policies for tournament_registrations
CREATE POLICY "Users can view all registrations"
  ON public.tournament_registrations FOR SELECT
  USING (true);

CREATE POLICY "Users can register themselves"
  ON public.tournament_registrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own registrations"
  ON public.tournament_registrations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own registrations"
  ON public.tournament_registrations FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at on tournaments (only if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_tournaments_updated_at'
  ) THEN
    CREATE TRIGGER update_tournaments_updated_at
      BEFORE UPDATE ON public.tournaments
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Add trigger for updated_at on tournament_registrations (only if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_tournament_registrations_updated_at'
  ) THEN
    CREATE TRIGGER update_tournament_registrations_updated_at
      BEFORE UPDATE ON public.tournament_registrations
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;