-- Migration: Consolidation des tables de règles en une seule table chess_rules
-- Date: 2025-01-18
-- Description: Fusionne preset_rules, custom_chess_rules et rules_lobby en une table unifiée

-- 1. Créer l'enum pour le type de source
CREATE TYPE public.rule_source AS ENUM ('preset', 'custom', 'ai_generated');

-- 2. Créer la table unifiée chess_rules
CREATE TABLE public.chess_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Métadonnées de base
  rule_id TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  
  -- Contenu de la règle (format JSON standardisé)
  rule_json JSONB NOT NULL,
  
  -- Source et attribution
  source rule_source NOT NULL DEFAULT 'custom',
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Métadonnées de génération AI
  prompt TEXT,
  prompt_key TEXT,
  ai_model TEXT,
  generation_duration_ms INTEGER,
  
  -- Tags et classification
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  complexity_level TEXT DEFAULT 'intermediate',
  affected_pieces TEXT[],
  
  -- État et validation
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'draft')),
  is_functional BOOLEAN DEFAULT true,
  validation_notes TEXT,
  
  -- Métadonnées d'utilisation
  usage_count INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 1,
  
  -- Assets et configuration
  assets JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Contraintes
  CONSTRAINT chess_rules_prompt_key_unique UNIQUE (prompt_key),
  CONSTRAINT rule_json_has_meta CHECK (rule_json ? 'meta'),
  CONSTRAINT rule_json_has_logic CHECK (rule_json ? 'logic')
);

-- 3. Créer les index pour les performances
CREATE INDEX idx_chess_rules_rule_id ON chess_rules(rule_id);
CREATE INDEX idx_chess_rules_source ON chess_rules(source);
CREATE INDEX idx_chess_rules_created_by ON chess_rules(created_by);
CREATE INDEX idx_chess_rules_status ON chess_rules(status);
CREATE INDEX idx_chess_rules_category ON chess_rules(category);
CREATE INDEX idx_chess_rules_prompt_key ON chess_rules(prompt_key) WHERE prompt_key IS NOT NULL;
CREATE INDEX idx_chess_rules_tags ON chess_rules USING GIN(tags);

-- 4. Enable RLS
ALTER TABLE public.chess_rules ENABLE ROW LEVEL SECURITY;

-- 5. Créer les policies RLS
CREATE POLICY "Everyone can view active rules"
ON public.chess_rules
FOR SELECT
USING (status = 'active' OR auth.uid() = created_by);

CREATE POLICY "Users can create their own rules"
ON public.chess_rules
FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own rules"
ON public.chess_rules
FOR UPDATE
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own rules"
ON public.chess_rules
FOR DELETE
USING (auth.uid() = created_by);

-- 6. Créer le trigger pour updated_at
CREATE TRIGGER update_chess_rules_updated_at
BEFORE UPDATE ON public.chess_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Migrer les données de preset_rules
INSERT INTO public.chess_rules (
  rule_id, rule_name, description, category, rule_json, source, 
  created_by, tags, complexity_level, is_functional, validation_notes, 
  status, created_at, updated_at
)
SELECT 
  rule_id, rule_name, description, category, rule_json, 'preset'::rule_source,
  created_by, tags, complexity_level, is_functional, validation_notes,
  CASE WHEN is_functional THEN 'active' ELSE 'draft' END,
  created_at, updated_at
FROM public.preset_rules;

-- 8. Migrer les données de rules_lobby (AI generated)
INSERT INTO public.chess_rules (
  rule_id, rule_name, description, category, rule_json, source,
  created_by, prompt, prompt_key, ai_model, generation_duration_ms,
  assets, status, created_at, updated_at
)
SELECT 
  COALESCE((rule_json->'meta'->>'ruleId'), 'ai_' || id::text),
  COALESCE((rule_json->'meta'->>'ruleName'), 'AI Generated Rule'),
  COALESCE((rule_json->'meta'->>'description'), prompt),
  COALESCE((rule_json->'meta'->>'category'), 'ai-generated'),
  rule_json,
  'ai_generated'::rule_source,
  created_by,
  prompt,
  prompt_key,
  ai_model,
  generation_duration_ms,
  assets,
  status,
  created_at,
  updated_at
FROM public.rules_lobby
WHERE rule_json ? 'meta' AND rule_json ? 'logic';

-- 9. Migrer les données de custom_chess_rules
-- Note: custom_chess_rules utilise un format différent, on crée un rule_json valide
INSERT INTO public.chess_rules (
  rule_id, rule_name, description, category, source, created_by,
  tags, affected_pieces, status, priority, usage_count,
  rule_json, is_functional, created_at, updated_at
)
SELECT 
  rule_id, rule_name, description, category, 'custom'::rule_source, user_id,
  tags, affected_pieces,
  CASE WHEN is_active THEN 'active' ELSE 'archived' END,
  priority, usage_count,
  jsonb_build_object(
    'meta', jsonb_build_object(
      'ruleId', rule_id,
      'ruleName', rule_name,
      'description', description,
      'category', category,
      'tags', to_jsonb(tags)
    ),
    'logic', jsonb_build_object(
      'effects', COALESCE(effects, '[]'::jsonb),
      'conditions', COALESCE(conditions, '[]'::jsonb)
    ),
    'scope', jsonb_build_object(
      'affectedPieces', to_jsonb(affected_pieces)
    )
  ),
  is_active,
  created_at,
  updated_at
FROM public.custom_chess_rules;

-- 10. Créer des vues pour la compatibilité avec le code existant (optionnel)
CREATE VIEW public.preset_rules_view AS
SELECT * FROM public.chess_rules WHERE source = 'preset';

CREATE VIEW public.custom_rules_view AS
SELECT * FROM public.chess_rules WHERE source = 'custom';

CREATE VIEW public.ai_rules_view AS
SELECT * FROM public.chess_rules WHERE source = 'ai_generated';

-- 11. Ajouter des commentaires
COMMENT ON TABLE public.chess_rules IS 'Table unifiée pour toutes les règles d''échecs (preset, custom, AI-generated)';
COMMENT ON COLUMN public.chess_rules.source IS 'Source de la règle: preset (prédéfinie), custom (créée manuellement), ai_generated (générée par IA)';
COMMENT ON COLUMN public.chess_rules.prompt_key IS 'Hash unique du prompt pour éviter les doublons de règles AI';
COMMENT ON COLUMN public.chess_rules.rule_json IS 'Contenu de la règle au format RuleJSON standardisé';