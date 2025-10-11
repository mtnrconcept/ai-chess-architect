-- Helper script to locate ordered-set aggregate calls that omit WITHIN GROUP
-- Connect as a role with access to pg_proc/pg_views (for example, postgres or supabase_admin)
-- and run the statements below.

-- Functions that use percentile_* without WITHIN GROUP
SELECT n.nspname AS schema,
       p.proname AS function,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND pg_get_functiondef(p.oid) ILIKE '%percentile_%'
  AND pg_get_functiondef(p.oid) NOT ILIKE '%WITHIN GROUP%'
ORDER BY n.nspname, p.proname;

-- Functions that use mode() without WITHIN GROUP
SELECT n.nspname AS schema,
       p.proname AS function,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND pg_get_functiondef(p.oid) ILIKE '%mode(%'
  AND pg_get_functiondef(p.oid) NOT ILIKE '%WITHIN GROUP%'
ORDER BY n.nspname, p.proname;

-- Views that reference ordered-set aggregates without WITHIN GROUP
SELECT schemaname,
       viewname,
       definition
FROM pg_views
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  AND ((definition ILIKE '%percentile_%' AND definition NOT ILIKE '%WITHIN GROUP%')
       OR (definition ILIKE '%mode(%' AND definition NOT ILIKE '%WITHIN GROUP%'))
ORDER BY schemaname, viewname;
