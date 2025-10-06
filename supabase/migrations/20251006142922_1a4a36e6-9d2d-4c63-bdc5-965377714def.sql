-- Create custom_chess_rules table
CREATE TABLE public.custom_chess_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('movement', 'capture', 'special', 'condition', 'victory', 'restriction', 'defense', 'behavior')),
  affected_pieces TEXT[] NOT NULL,
  trigger TEXT NOT NULL,
  conditions JSONB DEFAULT '[]'::jsonb,
  effects JSONB DEFAULT '[]'::jsonb,
  priority INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  validation_rules JSONB DEFAULT '{}'::jsonb,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create lobbies table
CREATE TABLE public.lobbies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  creator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  active_rules TEXT[] DEFAULT ARRAY[]::TEXT[],
  max_players INTEGER DEFAULT 2,
  is_active BOOLEAN DEFAULT true,
  game_state JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.custom_chess_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lobbies ENABLE ROW LEVEL SECURITY;

-- RLS Policies for custom_chess_rules
CREATE POLICY "Users can view all rules"
  ON public.custom_chess_rules FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own rules"
  ON public.custom_chess_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own rules"
  ON public.custom_chess_rules FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own rules"
  ON public.custom_chess_rules FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for lobbies
CREATE POLICY "Users can view all lobbies"
  ON public.lobbies FOR SELECT
  USING (true);

CREATE POLICY "Users can create lobbies"
  ON public.lobbies FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Creators can update their lobbies"
  ON public.lobbies FOR UPDATE
  USING (auth.uid() = creator_id);

CREATE POLICY "Creators can delete their lobbies"
  ON public.lobbies FOR DELETE
  USING (auth.uid() = creator_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_custom_chess_rules_updated_at
  BEFORE UPDATE ON public.custom_chess_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lobbies_updated_at
  BEFORE UPDATE ON public.lobbies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_custom_chess_rules_user_id ON public.custom_chess_rules(user_id);
CREATE INDEX idx_custom_chess_rules_category ON public.custom_chess_rules(category);
CREATE INDEX idx_lobbies_creator_id ON public.lobbies(creator_id);
CREATE INDEX idx_lobbies_is_active ON public.lobbies(is_active);