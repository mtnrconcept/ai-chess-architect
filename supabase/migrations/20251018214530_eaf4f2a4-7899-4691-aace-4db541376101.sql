-- Normalisation complète de toutes les règles dans chess_rules

-- 1. Enrichir assets pour toutes les règles sans assets complets
UPDATE chess_rules
SET rule_json = jsonb_set(
  rule_json,
  '{assets}',
  CASE category
    WHEN 'vip' THEN '{"color": "#9C27B0", "icon": "🎭", "sfx": {"onTrigger": "check", "onSuccess": "capture"}}'::jsonb
    WHEN 'capture' THEN '{"color": "#76E0FF", "icon": "⚔️", "sfx": {"onTrigger": "explosion", "onSuccess": "capture"}}'::jsonb
    WHEN 'defense' THEN '{"color": "#4CAF50", "icon": "🛡️", "sfx": {"onTrigger": "shield", "onSuccess": "check"}}'::jsonb
    WHEN 'special' THEN '{"color": "#FF5722", "icon": "✨", "sfx": {"onTrigger": "special-ability", "onSuccess": "capture"}}'::jsonb
    WHEN 'movement' THEN '{"color": "#2196F3", "icon": "🏃", "sfx": {"onTrigger": "move", "onSuccess": "move"}}'::jsonb
    WHEN 'behavior' THEN '{"color": "#FFC107", "icon": "🧠", "sfx": {"onTrigger": "move", "onSuccess": "check"}}'::jsonb
    WHEN 'terrain' THEN '{"color": "#795548", "icon": "🗺️", "sfx": {"onTrigger": "move", "onSuccess": "explosion"}}'::jsonb
    WHEN 'upgrade' THEN '{"color": "#00BCD4", "icon": "⬆️", "sfx": {"onTrigger": "special-ability", "onSuccess": "capture"}}'::jsonb
    ELSE '{"color": "#8B8B8B", "icon": "⚙️", "sfx": {"onTrigger": "move", "onSuccess": "move"}}'::jsonb
  END,
  true
)
WHERE NOT (rule_json->'assets' ? 'color' AND rule_json->'assets' ? 'icon');

-- 2. Ajouter state.namespace pour toutes les règles
UPDATE chess_rules
SET rule_json = jsonb_set(
  rule_json,
  '{state,namespace}',
  to_jsonb('rules.' || category || '.' || replace(rule_id, '-', '_')),
  true
)
WHERE NOT (rule_json->'state' ? 'namespace');

-- 3. Créer ui.actions vides si absentes
UPDATE chess_rules
SET rule_json = jsonb_set(
  rule_json,
  '{ui}',
  '{"actions": []}'::jsonb,
  true
)
WHERE NOT (rule_json ? 'ui');

-- 4. S'assurer que meta existe avec toutes les informations
UPDATE chess_rules
SET rule_json = jsonb_set(
  rule_json,
  '{meta}',
  jsonb_build_object(
    'ruleId', rule_id,
    'ruleName', rule_name,
    'category', category,
    'description', description,
    'tags', COALESCE(rule_json->'meta'->'tags', to_jsonb(tags)),
    'version', COALESCE(rule_json->'meta'->>'version', '1.0.0'),
    'isActive', COALESCE((rule_json->'meta'->>'isActive')::boolean, is_functional)
  ),
  true
)
WHERE NOT (rule_json->'meta' ? 'ruleId' AND rule_json->'meta' ? 'ruleName');

-- 5. S'assurer que scope existe
UPDATE chess_rules
SET rule_json = jsonb_set(
  rule_json,
  '{scope}',
  jsonb_build_object(
    'affectedPieces', COALESCE(rule_json->'scope'->'affectedPieces', to_jsonb(COALESCE(affected_pieces, ARRAY[]::text[])))
  ),
  true
)
WHERE NOT (rule_json ? 'scope');

-- 6. Valider toutes les règles complètes comme fonctionnelles
UPDATE chess_rules
SET 
  is_functional = true,
  validation_notes = COALESCE(validation_notes, '') || ' | Règle normalisée automatiquement le ' || now()::date::text,
  updated_at = now()
WHERE 
  rule_json ? 'meta'
  AND rule_json ? 'logic'
  AND rule_json ? 'ui'
  AND rule_json ? 'assets'
  AND rule_json ? 'scope'
  AND status = 'active';

-- 7. Mettre à jour assets dans la colonne dédiée pour cohérence
UPDATE chess_rules
SET assets = rule_json->'assets'
WHERE assets IS NULL OR assets = '{}'::jsonb;