-- Quick checks for common PostgREST 400/404 responses when querying lobbies and tournament tables
-- Run from psql or the Supabase SQL editor as an admin role

with expected_tables as (
  select unnest(array[
    'lobbies',
    'tournaments',
    'tournament_matches',
    'tournament_registrations',
    'tournament_overview',
    'user_games'
  ]) as table_name
)
select e.table_name,
       case when t.table_name is null then 'missing' else 'ok' end as status
from expected_tables e
left join information_schema.tables t
  on t.table_schema = 'public' and t.table_name = e.table_name
order by e.table_name;

-- 2. Validate that required columns exist for each core table
with expected_columns as (
  select 'lobbies'::text as table_name, unnest(array[
    'id','name','creator_id','active_rules','max_players','is_active','mode','status','opponent_id','opponent_name','created_at','updated_at'
  ]) as column_name
  union all
  select 'tournaments', unnest(array[
    'id','name','description','variant_name','variant_rules','variant_source','variant_lobby_id','start_time','end_time','status','created_at','updated_at'
  ])
  union all
  select 'tournament_matches', unnest(array[
    'id','tournament_id','lobby_id','table_number','player1_id','player2_id','status','result','winner_id','reported_by','started_at','completed_at','created_at','updated_at'
  ])
  union all
  select 'tournament_registrations', unnest(array[
    'id','tournament_id','user_id','display_name','avatar_url','wins','losses','draws','points','current_match_id','is_waiting','joined_at','last_active_at'
  ])
  union all
  select 'user_games', unnest(array[
    'id','user_id','opponent_name','opponent_type','result','variant_name','time_control','player_color','move_history','analysis_overview','starting_board','accuracy','total_moves','duration_seconds','metadata','coach_summary','created_at'
  ])
)
select ec.table_name,
       ec.column_name,
       case when c.column_name is null then 'missing' else c.data_type end as status
from expected_columns ec
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = ec.table_name and c.column_name = ec.column_name
order by ec.table_name, ec.column_name;

select pg_notify('pgrst', 'reload schema');
