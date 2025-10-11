-- Restore tournament_overview view with detailed tournament metrics
create or replace view public.tournament_overview as
select
  t.id,
  t.name,
  t.description,
  t.variant_name,
  t.variant_source,
  t.variant_rules,
  t.variant_lobby_id,
  t.start_time,
  t.end_time,
  t.status,
  t.created_at,
  t.updated_at,
  coalesce(reg.player_count, 0) as player_count,
  coalesce(matches.active_matches, 0) as active_match_count,
  coalesce(matches.completed_matches, 0) as completed_match_count
from public.tournaments t
left join (
  select tournament_id, count(*) as player_count
  from public.tournament_registrations
  group by tournament_id
) reg on reg.tournament_id = t.id
left join (
  select
    tournament_id,
    count(*) filter (where status in ('pending','in_progress')) as active_matches,
    count(*) filter (where status = 'completed') as completed_matches
  from public.tournament_matches
  group by tournament_id
) matches on matches.tournament_id = t.id;
