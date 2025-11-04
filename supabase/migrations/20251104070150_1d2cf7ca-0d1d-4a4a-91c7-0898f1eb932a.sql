-- Add unique constraint on rule_id to support upsert operations
ALTER TABLE public.chess_rules 
ADD CONSTRAINT chess_rules_rule_id_unique UNIQUE (rule_id);