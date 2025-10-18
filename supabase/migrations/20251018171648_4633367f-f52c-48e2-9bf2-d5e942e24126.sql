-- Add category column to api_registry
ALTER TABLE public.api_registry
ADD COLUMN IF NOT EXISTS category TEXT;

-- Drop and recreate tournament_overview view to include max_participants
DROP VIEW IF EXISTS public.tournament_overview;

CREATE VIEW public.tournament_overview AS
SELECT 
  t.id,
  t.title,
  t.description,
  t.variant_name,
  t.variant_source,
  t.variant_rules,
  t.variant_lobby_id,
  t.starts_at,
  t.ends_at,
  t.status,
  t.max_participants,
  t.created_at,
  t.updated_at,
  COALESCE(COUNT(DISTINCT tr.id), 0)::integer AS player_count,
  COALESCE(COUNT(DISTINCT CASE WHEN tm.status = 'active' THEN tm.id END), 0)::integer AS active_match_count,
  COALESCE(COUNT(DISTINCT CASE WHEN tm.status = 'completed' THEN tm.id END), 0)::integer AS completed_match_count
FROM public.tournaments t
LEFT JOIN public.tournament_registrations tr ON t.id = tr.tournament_id
LEFT JOIN public.tournament_matches tm ON t.id = tm.tournament_id
GROUP BY t.id, t.title, t.description, t.variant_name, t.variant_source, 
         t.variant_rules, t.variant_lobby_id, t.starts_at, t.ends_at, 
         t.status, t.max_participants, t.created_at, t.updated_at;