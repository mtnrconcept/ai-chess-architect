-- Script de vérification de la normalisation des règles
-- Exécuter après la migration pour valider la cohérence

-- 1. Vérifier que toutes les règles ont une structure complète
SELECT 
  rule_id,
  rule_name,
  category,
  source,
  rule_json ? 'meta' as has_meta,
  rule_json ? 'ui' as has_ui,
  rule_json ? 'assets' as has_assets,
  rule_json ? 'state' as has_state,
  rule_json ? 'logic' as has_logic,
  rule_json ? 'scope' as has_scope,
  is_functional
FROM chess_rules
WHERE status = 'active'
ORDER BY source, category, rule_name;

-- 2. Vérifier les assets (couleur et icône)
SELECT 
  rule_id,
  rule_name,
  category,
  rule_json->'assets'->>'color' as color,
  rule_json->'assets'->>'icon' as icon,
  rule_json->'assets'->'sfx'->>'onTrigger' as sfx_trigger,
  rule_json->'assets'->'sfx'->>'onSuccess' as sfx_success
FROM chess_rules
WHERE status = 'active'
ORDER BY category;

-- 3. Vérifier les namespaces de state
SELECT 
  rule_id,
  rule_name,
  category,
  rule_json->'state'->>'namespace' as namespace,
  jsonb_pretty(rule_json->'state'->'initial') as initial_state
FROM chess_rules
WHERE status = 'active' AND rule_json ? 'state'
ORDER BY category;

-- 4. Vérifier les UI actions
SELECT 
  rule_id,
  rule_name,
  jsonb_array_length(rule_json->'ui'->'actions') as action_count,
  jsonb_pretty(rule_json->'ui'->'actions') as actions
FROM chess_rules
WHERE status = 'active' 
  AND rule_json->'ui'->'actions' IS NOT NULL
  AND jsonb_array_length(rule_json->'ui'->'actions') > 0
ORDER BY rule_name;

-- 5. Détecter les règles avec VFX
SELECT 
  rule_id,
  rule_name,
  category,
  (
    SELECT COUNT(*)
    FROM jsonb_array_elements(rule_json->'logic'->'effects') as effect,
         jsonb_array_elements(
           CASE 
             WHEN jsonb_typeof(effect->'do') = 'array' THEN effect->'do'
             ELSE jsonb_build_array(effect->'do')
           END
         ) as action
    WHERE action->>'action' = 'vfx.play'
  ) as vfx_count
FROM chess_rules
WHERE status = 'active'
ORDER BY vfx_count DESC, rule_name;

-- 6. Détecter les règles avec audio
SELECT 
  rule_id,
  rule_name,
  category,
  (
    SELECT COUNT(*)
    FROM jsonb_array_elements(rule_json->'logic'->'effects') as effect,
         jsonb_array_elements(
           CASE 
             WHEN jsonb_typeof(effect->'do') = 'array' THEN effect->'do'
             ELSE jsonb_build_array(effect->'do')
           END
         ) as action
    WHERE action->>'action' = 'audio.play'
  ) as audio_count
FROM chess_rules
WHERE status = 'active'
ORDER BY audio_count DESC, rule_name;

-- 7. Règles sans assets (anomalies)
SELECT 
  rule_id,
  rule_name,
  category,
  'Missing assets' as issue
FROM chess_rules
WHERE status = 'active'
  AND NOT (rule_json->'assets' ? 'color' AND rule_json->'assets' ? 'icon');

-- 8. Règles sans ui.actions (peut être normal pour certaines)
SELECT 
  rule_id,
  rule_name,
  category,
  'No UI actions' as note,
  (
    SELECT COUNT(*)
    FROM jsonb_array_elements(rule_json->'logic'->'effects') as effect
    WHERE effect->>'when' LIKE 'ui.%'
  ) as ui_effects_count
FROM chess_rules
WHERE status = 'active'
  AND (NOT (rule_json->'ui' ? 'actions') 
       OR jsonb_array_length(rule_json->'ui'->'actions') = 0);

-- 9. Statistiques par catégorie
SELECT 
  category,
  source,
  COUNT(*) as total_rules,
  COUNT(*) FILTER (WHERE is_functional = true) as functional_rules,
  COUNT(*) FILTER (WHERE rule_json->'ui'->'actions' IS NOT NULL 
                   AND jsonb_array_length(rule_json->'ui'->'actions') > 0) as rules_with_ui,
  COUNT(*) FILTER (WHERE rule_json->'state' IS NOT NULL) as rules_with_state
FROM chess_rules
WHERE status = 'active'
GROUP BY category, source
ORDER BY category, source;

-- 10. Exemple de règle complète (L'ouverture aveugle)
SELECT 
  rule_id,
  rule_name,
  jsonb_pretty(rule_json) as complete_rule_json
FROM chess_rules
WHERE rule_name = 'L''ouverture aveugle'
  OR rule_id = 'preset_vip_magnus_01'
LIMIT 1;
