-- Create rules_lobby table for AI-generated rules
CREATE TABLE public.rules_lobby (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Metadata
  prompt text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'active', 'error', 'archived')) DEFAULT 'active',
  
  -- Complete RuleJSON format
  rule_json jsonb NOT NULL,
  
  -- Optional assets (SVG, sounds, animations)
  assets jsonb,
  
  -- Generation metadata
  ai_model text DEFAULT 'google/gemini-2.5-flash',
  generation_duration_ms integer,
  
  -- Validation constraints
  CONSTRAINT rule_json_has_meta CHECK (rule_json ? 'meta'),
  CONSTRAINT rule_json_has_logic CHECK (rule_json ? 'logic')
);

-- Indexes for performance
CREATE INDEX idx_rules_lobby_created_by ON public.rules_lobby(created_by);
CREATE INDEX idx_rules_lobby_status ON public.rules_lobby(status);
CREATE INDEX idx_rules_lobby_created_at ON public.rules_lobby(created_at DESC);

-- Enable RLS
ALTER TABLE public.rules_lobby ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own rules"
  ON public.rules_lobby FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Users can insert their own rules"
  ON public.rules_lobby FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own rules"
  ON public.rules_lobby FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own rules"
  ON public.rules_lobby FOR DELETE
  USING (auth.uid() = created_by);

-- Trigger for updated_at
CREATE TRIGGER set_updated_at_rules_lobby
  BEFORE UPDATE ON public.rules_lobby
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();