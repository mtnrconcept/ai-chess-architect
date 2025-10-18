-- Add missing columns to lobbies
ALTER TABLE public.lobbies
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'cancelled')),
ADD COLUMN IF NOT EXISTS opponent_id UUID,
ADD COLUMN IF NOT EXISTS opponent_name TEXT;

-- Add missing columns to tournament_matches
ALTER TABLE public.tournament_matches
ADD COLUMN IF NOT EXISTS variant_rules TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS table_number INTEGER;

-- Create api_registry table for integration tracking
CREATE TABLE IF NOT EXISTS public.api_registry (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_name TEXT NOT NULL UNIQUE,
  endpoint_url TEXT NOT NULL,
  api_key_env TEXT,
  is_active BOOLEAN DEFAULT true,
  last_checked_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'unknown' CHECK (status IN ('healthy', 'degraded', 'down', 'unknown')),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on api_registry
ALTER TABLE public.api_registry ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for api_registry
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Everyone can view api registry" ON public.api_registry;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Create RLS policy for api_registry (read-only for all)
CREATE POLICY "Everyone can view api registry"
  ON public.api_registry FOR SELECT
  USING (true);

-- Add trigger for updated_at on api_registry
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_api_registry_updated_at'
  ) THEN
    CREATE TRIGGER update_api_registry_updated_at
      BEFORE UPDATE ON public.api_registry
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;