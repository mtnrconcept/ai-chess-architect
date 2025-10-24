-- Ajouter les colonnes manquantes à tournament_registrations
ALTER TABLE tournament_registrations 
  ADD COLUMN IF NOT EXISTS joined_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_match_id uuid REFERENCES tournament_matches(id),
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS is_waiting boolean DEFAULT false;

-- Migrer les données existantes de match_id vers current_match_id
UPDATE tournament_registrations 
SET current_match_id = match_id 
WHERE match_id IS NOT NULL AND current_match_id IS NULL;

-- Remplir joined_at pour les enregistrements existants
UPDATE tournament_registrations 
SET joined_at = registered_at 
WHERE joined_at IS NULL;

-- Créer un index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_tournament_registrations_current_match 
  ON tournament_registrations(current_match_id);

CREATE INDEX IF NOT EXISTS idx_tournament_registrations_waiting 
  ON tournament_registrations(tournament_id, is_waiting) 
  WHERE is_waiting = true;