-- Phase 0.3 : Contraintes d'unicité et identité
-- Ajouter colonne prompt_key pour déduplication dans rules_lobby
ALTER TABLE rules_lobby 
ADD COLUMN IF NOT EXISTS prompt_key VARCHAR(16);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_rules_lobby_prompt_key ON rules_lobby(prompt_key);

-- Ajouter colonne version à preset_rules si elle n'existe pas
ALTER TABLE preset_rules 
ADD COLUMN IF NOT EXISTS version VARCHAR(20) DEFAULT '1.0.0';

-- Contrainte unicité sur (rule_id, version) pour preset_rules
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'preset_rules_ruleid_version_unique'
  ) THEN
    ALTER TABLE preset_rules
    ADD CONSTRAINT preset_rules_ruleid_version_unique 
    UNIQUE (rule_id, version);
  END IF;
END $$;

-- Contrainte unicité sur prompt_key pour rules_lobby (évite duplications)
CREATE UNIQUE INDEX IF NOT EXISTS idx_rules_lobby_prompt_key_unique 
ON rules_lobby(prompt_key) 
WHERE status = 'active';