-- Quick checks for common PostgREST 400/404 responses when querying lobbies and tournament tables
-- Run from psql or the Supabase SQL editor as an admin role

-- 1. Confirm the tables exist and are visible in the current schema
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('lobbies', 'tournaments', 'tournament_matches', 'tournament_registrations', 'user_games')
order by table_name;

-- 2. Inspect the column layout for lobbies (adjust table_name for others as needed)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'lobbies'
order by ordinal_position;

-- 3. Force PostgREST to reload the schema cache after running migrations
select pg_notify('pgrst', 'reload schema');
