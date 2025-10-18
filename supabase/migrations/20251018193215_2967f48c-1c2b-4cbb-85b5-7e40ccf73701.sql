-- Créer la table preset_rules pour stocker les règles prévalidées
CREATE TABLE IF NOT EXISTS public.preset_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id text UNIQUE NOT NULL,
  rule_name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('movement', 'capture', 'special', 'defense', 'behavior', 'vip')),
  prompt_example text,
  rule_json jsonb NOT NULL,
  tags text[] DEFAULT ARRAY[]::text[],
  complexity_level text DEFAULT 'intermediate' CHECK (complexity_level IN ('simple', 'intermediate', 'advanced')),
  is_functional boolean DEFAULT true,
  validation_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Index pour recherche par tags
CREATE INDEX idx_preset_rules_tags ON public.preset_rules USING GIN (tags);

-- Index pour filtrage par catégorie
CREATE INDEX idx_preset_rules_category ON public.preset_rules (category);

-- Index pour filtrage par fonctionnalité
CREATE INDEX idx_preset_rules_functional ON public.preset_rules (is_functional);

-- Trigger pour updated_at
CREATE TRIGGER trg_preset_rules_updated_at
BEFORE UPDATE ON public.preset_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.preset_rules ENABLE ROW LEVEL SECURITY;

-- Policy : Tout le monde peut lire les règles prévalidées
CREATE POLICY "Public can view preset rules"
ON public.preset_rules
FOR SELECT
USING (true);

-- Policy : Seuls les admins peuvent modifier (désactivé pour l'instant)
CREATE POLICY "Only admins can modify preset rules"
ON public.preset_rules
FOR ALL
USING (false)
WITH CHECK (false);

-- Commentaire sur la table
COMMENT ON TABLE public.preset_rules IS 'Stocke les règles d''échecs prévalidées pour entraîner le modèle IA';

-- Insérer la règle "L'ouverture aveugle" (validée et fonctionnelle)
INSERT INTO public.preset_rules (
  rule_id,
  rule_name,
  description,
  category,
  prompt_example,
  rule_json,
  tags,
  complexity_level,
  is_functional,
  validation_notes
) VALUES (
  'preset_vip_magnus_01',
  'L''ouverture aveugle',
  'Avant la partie, chaque joueur dispose ses pièces majeures en secret sur la première rangée (hors roi et pions).',
  'vip',
  'les joueurs disposent leurs pièces majeures en secret avant le début de la partie',
  '{"meta": {"ruleId": "preset_vip_magnus_01", "ruleName": "L''ouverture aveugle", "description": "Avant la partie, chaque joueur dispose ses pièces majeures en secret sur la première rangée (hors roi et pions).", "category": "vip", "isActive": true, "tags": ["vip", "magnus", "ouverture", "creativite", "surprise"], "version": "1.0.0"}, "scope": {"affectedPieces": ["queen", "rook", "bishop", "knight"], "sides": ["white", "black"]}, "ui": {"actions": [{"id": "secret_setup", "label": "Disposition secrète", "hint": "Disposez vos pièces majeures en secret", "icon": "🎭", "availability": {"requiresSelection": false, "phase": "setup"}, "targeting": {"mode": "none"}, "consumesTurn": false}]}, "logic": {"effects": [{"id": "effect_secret_setup", "when": "lifecycle.onGameStart", "if": ["state.equals", "phase", "setup"], "do": [{"action": "ui.showOverlay", "params": {"type": "secretSetup", "pieces": ["queen", "rook", "bishop", "knight"], "rank": 1}}, {"action": "state.set", "params": {"key": "secretSetupComplete", "value": true}}]}]}, "parameters": {}, "state": {"namespace": "rules.vip_magnus_01", "initial": {"phase": "setup"}}, "assets": {"icon": "🎭", "color": "#9C27B0"}}'::jsonb,
  ARRAY['vip', 'magnus', 'ouverture', 'creativite', 'surprise', 'setup'],
  'advanced',
  true,
  'Règle validée et fonctionnelle dans le lobby. Nécessite une phase de setup.'
);