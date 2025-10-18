-- Fix match_id column type and add foreign key constraint
-- Currently match_id is text but should be uuid to reference tournament_matches.id

-- First, convert match_id from text to uuid
ALTER TABLE public.tournament_registrations
ALTER COLUMN match_id TYPE uuid USING match_id::uuid;

-- Then add the foreign key constraint
ALTER TABLE public.tournament_registrations
ADD CONSTRAINT tournament_registrations_match_id_fkey
FOREIGN KEY (match_id)
REFERENCES public.tournament_matches(id)
ON DELETE SET NULL;

-- Refresh PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');