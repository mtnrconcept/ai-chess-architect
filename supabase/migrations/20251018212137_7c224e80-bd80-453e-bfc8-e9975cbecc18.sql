-- Migration: Ajouter contrainte UNIQUE sur prompt_key pour supporter ON CONFLICT
-- Date: 2025-10-18
-- Description: Permet l'upsert basé sur prompt_key dans la table rules_lobby

-- 1. Ajouter la contrainte UNIQUE
ALTER TABLE rules_lobby 
ADD CONSTRAINT rules_lobby_prompt_key_unique 
UNIQUE (prompt_key);

-- 2. Créer un index partiel pour optimiser les lookups (seulement sur les non-NULL)
CREATE INDEX IF NOT EXISTS idx_rules_lobby_prompt_key 
ON rules_lobby(prompt_key) 
WHERE prompt_key IS NOT NULL;

-- 3. Ajouter un commentaire explicatif
COMMENT ON CONSTRAINT rules_lobby_prompt_key_unique ON rules_lobby IS 
'Constraint unique pour permettre upsert sur prompt_key. Un même prompt ne peut générer qu''une seule règle active.';