-- Corriger les catégories des règles preset pour correspondre au format original
UPDATE preset_rules 
SET category = 'capture'
WHERE rule_id = 'r_freeze_missile';

UPDATE preset_rules 
SET category = 'defense'
WHERE rule_id = 'r_quicksand';

UPDATE preset_rules 
SET category = 'special'
WHERE rule_id = 'r_invisible_rook';

UPDATE preset_rules 
SET category = 'special'
WHERE rule_id = 'r_multiplying_queen';