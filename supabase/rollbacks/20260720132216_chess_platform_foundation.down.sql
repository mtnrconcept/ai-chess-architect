begin;

-- Explicit staging rollback for the additive chess platform foundation.
-- It deliberately leaves historical tables, Rule Architect V2 tables, and
-- the shared `private` schema intact.

drop table if exists private.chess_terminal_cas_acl_snapshot;

do $realtime_rollback$
declare
  v_table text;
begin
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) then
    foreach v_table in array array[
      'chess_rooms',
      'chess_room_members',
      'chess_matches',
      'chess_move_commands',
      'chess_match_moves',
      'chess_match_events'
    ] loop
      if exists (
        select 1
        from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format(
          'alter publication supabase_realtime drop table public.%I',
          v_table
        );
      end if;
    end loop;
  end if;
end;
$realtime_rollback$;

drop policy if exists chess_room_members_read_rule_versions
  on public.rule_versions;

-- Remove policies and triggers before their helper functions. This loop is
-- scoped only to tables introduced by this migration.
do $drop_chess_policies$
declare
  v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'chess_rating_seasons',
        'chess_rooms',
        'chess_room_members',
        'chess_room_rule_versions',
        'chess_room_invitations',
        'chess_matches',
        'chess_move_commands',
        'chess_match_moves',
        'chess_match_events',
        'chess_player_ratings',
        'chess_rating_history',
        'chess_player_progress',
        'chess_xp_events',
        'chess_badges',
        'chess_player_badges',
        'chess_quests',
        'chess_player_quests',
        'chess_daily_puzzles',
        'chess_puzzle_attempts',
        'chess_matchmaking_tickets'
      ]::text[])
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename
    );
  end loop;
end;
$drop_chess_policies$;

drop trigger if exists chess_rating_seasons_touch_updated_at
  on public.chess_rating_seasons;
drop trigger if exists chess_rooms_touch_updated_at
  on public.chess_rooms;
drop trigger if exists chess_rooms_custom_runtime_gate
  on public.chess_rooms;
drop trigger if exists chess_player_progress_touch_updated_at
  on public.chess_player_progress;
drop trigger if exists chess_player_quests_touch_updated_at
  on public.chess_player_quests;
drop trigger if exists chess_daily_puzzles_touch_updated_at
  on public.chess_daily_puzzles;
drop trigger if exists chess_matchmaking_touch_updated_at
  on public.chess_matchmaking_tickets;

drop function if exists public.cleanup_chess_matchmaking_server();
drop function if exists public.submit_daily_chess_puzzle(uuid, text[], integer);
drop function if exists public.get_daily_chess_puzzle(date);
drop function if exists public.claim_chess_quest(uuid);
drop function if exists public.get_chess_leaderboard(uuid, integer);
drop function if exists public.commit_and_finalize_chess_move_server(
  uuid, text, text, text, jsonb, text, text, integer, jsonb,
  text, text, text
);
drop function if exists public.claim_chess_timeout(uuid, bigint);
drop function if exists public.resign_chess_match(uuid, bigint);
drop function if exists public.finalize_chess_timeout_server(uuid, bigint, text);
drop function if exists public.finalize_chess_match_server(
  uuid, text, text, text, bigint
);
drop function if exists public.finalize_chess_match_server(uuid, text, text, text);
drop function if exists public.apply_verified_game_progress_internal(uuid, text, uuid);
drop function if exists public.advance_chess_quests_internal(uuid, text, integer);
drop function if exists public.award_chess_badge_internal(uuid, text, text, uuid);
drop function if exists public.grant_chess_xp_internal(uuid, integer, text, uuid, jsonb);
drop function if exists public.cancel_chess_matchmaking(uuid);
drop function if exists public.enqueue_chess_matchmaking(uuid, uuid[], boolean, integer, integer, integer);
drop function if exists public.reject_chess_move_command_server(uuid, text);
drop function if exists public.commit_chess_move_server(uuid, text, text, text, jsonb, text, text, integer, jsonb);
drop function if exists public.submit_chess_move_command(uuid, bigint, uuid, text, integer);
drop function if exists public.request_chess_match_abandonment(uuid, bigint);
drop function if exists public.heartbeat_chess_room(uuid, bigint);
drop function if exists public.get_chess_match_events_since(uuid, bigint, integer);
drop function if exists public.get_chess_match_snapshot(uuid);
drop function if exists public.join_chess_room(uuid, text);
drop function if exists public.create_chess_match_internal(uuid);
drop function if exists public.create_chess_room_invitation(uuid, uuid, integer);
drop function if exists public.list_open_chess_rooms(integer);
drop function if exists public.create_chess_room(text, text, uuid, uuid[], boolean, integer, integer, text);
drop function if exists public.compute_chess_ruleset_hash(uuid[]);
drop function if exists private.chess_timeout_has_mating_material(text, text);
drop function if exists private.enforce_chess_custom_runtime_gate();
drop function if exists private.is_current_user_chess_room_member(uuid);
drop function if exists public.chess_platform_touch_updated_at();

drop index if exists public.chess_move_commands_one_pending_revision_idx;

drop table if exists public.chess_matchmaking_tickets;
drop table if exists public.chess_puzzle_attempts;
drop table if exists public.chess_daily_puzzles;
drop table if exists public.chess_player_quests;
drop table if exists public.chess_quests;
drop table if exists public.chess_player_badges;
drop table if exists public.chess_badges;
drop table if exists public.chess_xp_events;
drop table if exists public.chess_player_progress;
drop table if exists public.chess_rating_history;
drop table if exists public.chess_player_ratings;
drop table if exists public.chess_match_events;
drop table if exists public.chess_match_moves;
drop table if exists public.chess_move_commands;
drop table if exists public.chess_matches;
drop table if exists public.chess_room_invitations;
drop table if exists public.chess_room_rule_versions;
drop table if exists public.chess_room_members;
drop table if exists public.chess_rooms;
drop table if exists public.chess_rating_seasons;

notify pgrst, 'reload schema';

commit;
