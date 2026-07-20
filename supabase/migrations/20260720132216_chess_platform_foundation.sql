begin;

-- Additive multiplayer and progression foundation. This migration deliberately
-- does not alter the historical games/lobbies tables. Rule Architect content is
-- linked only through immutable public.rule_versions rows introduced by V2.
create extension if not exists pgcrypto with schema extensions;

-- Policy-only helpers live outside the Data API's exposed `public` schema.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table if not exists public.chess_rating_seasons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,49}$'),
  name text not null check (char_length(name) between 3 and 80),
  status text not null default 'upcoming'
    check (status in ('upcoming', 'active', 'completed')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  initial_rating integer not null default 1200
    check (initial_rating between 100 and 4000),
  rating_floor integer not null default 100
    check (rating_floor between 0 and 2000),
  k_factor integer not null default 32 check (k_factor between 8 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (rating_floor <= initial_rating)
);

create unique index if not exists chess_rating_seasons_one_active_idx
  on public.chess_rating_seasons ((status))
  where status = 'active';
create index if not exists chess_rating_seasons_window_idx
  on public.chess_rating_seasons (starts_at, ends_at);

create table if not exists public.chess_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  request_key uuid not null,
  name text not null check (char_length(name) between 3 and 80),
  visibility text not null default 'public'
    check (visibility in ('public', 'private', 'unlisted')),
  status text not null default 'open'
    check (status in ('open', 'in_game', 'completed', 'cancelled')),
  ruleset_type text not null default 'standard'
    check (ruleset_type in ('standard', 'custom')),
  ruleset_hash text not null check (char_length(ruleset_hash) between 16 and 128),
  engine_version text not null default '2.0.0'
    check (char_length(engine_version) between 1 and 32),
  rated boolean not null default false,
  season_id uuid references public.chess_rating_seasons(id) on delete restrict,
  initial_seconds integer not null default 600
    check (initial_seconds between 30 and 604800),
  increment_seconds integer not null default 0
    check (increment_seconds between 0 and 3600),
  allow_spectators boolean not null default true,
  configuration jsonb not null default '{}'::jsonb
    check (jsonb_typeof(configuration) = 'object'),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  closed_at timestamptz,
  unique (owner_id, request_key),
  check (not rated or ruleset_type = 'standard'),
  check ((rated and season_id is not null) or (not rated and season_id is null)),
  check ((status = 'open' and closed_at is null) or status <> 'open')
);

-- Custom rooms stay impossible until the dedicated deterministic DSL runtime
-- exists. Keeping this as a database gate prevents a client, service process,
-- or future RPC from accidentally falling back to STANDARD semantics.
create or replace function private.enforce_chess_custom_runtime_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ruleset_type = 'custom' then
    raise exception 'CUSTOM_RULES_VALIDATOR_NOT_AVAILABLE'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_chess_custom_runtime_gate()
  from public, anon, authenticated;

drop trigger if exists chess_rooms_custom_runtime_gate on public.chess_rooms;
create trigger chess_rooms_custom_runtime_gate
before insert or update of ruleset_type on public.chess_rooms
for each row execute function private.enforce_chess_custom_runtime_gate();

create index if not exists chess_rooms_public_open_idx
  on public.chess_rooms (created_at desc)
  where visibility = 'public' and status = 'open';
create index if not exists chess_rooms_owner_idx
  on public.chess_rooms (owner_id, created_at desc);
create index if not exists chess_rooms_ruleset_idx
  on public.chess_rooms (ruleset_hash, status);
create index if not exists chess_rooms_season_idx
  on public.chess_rooms (season_id) where season_id is not null;

create table if not exists public.chess_room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chess_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'player'
    check (member_role in ('owner', 'player', 'spectator')),
  color text check (color in ('white', 'black')),
  membership_status text not null default 'active'
    check (membership_status in ('active', 'left', 'kicked')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_seen_revision bigint not null default 0 check (last_seen_revision >= 0),
  presence_status text not null default 'online'
    check (presence_status in ('online', 'away', 'offline')),
  abandonment_requested_at timestamptz,
  left_at timestamptz,
  unique (room_id, user_id),
  check (
    (member_role in ('owner', 'player') and color is not null)
    or (member_role = 'spectator' and color is null)
  ),
  check (
    (membership_status = 'active' and left_at is null)
    or membership_status <> 'active'
  )
);

create unique index if not exists chess_room_members_active_color_idx
  on public.chess_room_members (room_id, color)
  where membership_status = 'active' and color is not null;
create index if not exists chess_room_members_user_idx
  on public.chess_room_members (user_id, membership_status, joined_at desc);
create index if not exists chess_room_members_room_idx
  on public.chess_room_members (room_id, membership_status);
create index if not exists chess_room_members_presence_idx
  on public.chess_room_members (room_id, last_seen_at desc)
  where membership_status = 'active';

create table if not exists public.chess_room_rule_versions (
  room_id uuid not null references public.chess_rooms(id) on delete cascade,
  rule_version_id uuid not null references public.rule_versions(id) on delete restrict,
  ordinal smallint not null check (ordinal between 1 and 8),
  primary key (room_id, rule_version_id),
  unique (room_id, ordinal)
);

create index if not exists chess_room_rule_versions_version_idx
  on public.chess_room_rule_versions (rule_version_id);

create table if not exists public.chess_room_invitations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chess_rooms(id) on delete cascade,
  inviter_id uuid references auth.users(id) on delete set null,
  invitee_id uuid references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (expires_at > created_at)
);

create index if not exists chess_room_invitations_invitee_idx
  on public.chess_room_invitations (invitee_id, created_at desc)
  where status = 'pending';
create index if not exists chess_room_invitations_room_idx
  on public.chess_room_invitations (room_id, status, expires_at);
create index if not exists chess_room_invitations_inviter_idx
  on public.chess_room_invitations (inviter_id, created_at desc)
  where inviter_id is not null;

create table if not exists public.chess_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.chess_rooms(id) on delete restrict,
  white_player_id uuid references auth.users(id) on delete set null,
  black_player_id uuid references auth.users(id) on delete set null,
  status text not null default 'active'
    check (status in ('pending', 'active', 'completed', 'aborted')),
  result text check (result in ('1-0', '0-1', '1/2-1/2', '*')),
  termination text,
  rated boolean not null default false,
  season_id uuid references public.chess_rating_seasons(id) on delete restrict,
  ruleset_hash text not null,
  engine_version text not null,
  shared_seed bigint not null
    check (shared_seed between 0 and 9007199254740991),
  initial_fen text not null,
  current_fen text not null,
  side_to_move text not null default 'white'
    check (side_to_move in ('white', 'black')),
  ply_count integer not null default 0 check (ply_count >= 0),
  revision bigint not null default 0 check (revision >= 0),
  command_sequence bigint not null default 0 check (command_sequence >= 0),
  clock_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(clock_state) = 'object'),
  state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(state) = 'object'),
  rule_state_hash text not null
    check (char_length(rule_state_hash) between 16 and 128),
  position_hash text not null
    check (char_length(position_hash) between 16 and 128),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified')),
  verification_reference text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  last_move_at timestamptz,
  ended_at timestamptz,
  rating_processed_at timestamptz,
  check (white_player_id is distinct from black_player_id),
  check ((rated and season_id is not null) or (not rated and season_id is null)),
  check (
    (verification_status = 'verified'
      and verified_at is not null
      and verification_reference is not null)
    or (verification_status = 'pending'
      and verified_at is null
      and verification_reference is null)
  ),
  check (status <> 'completed' or verification_status = 'verified'),
  check (
    (status in ('completed', 'aborted') and result is not null and ended_at is not null)
    or (status in ('pending', 'active') and result is null and ended_at is null)
  )
);

create index if not exists chess_matches_white_idx
  on public.chess_matches (white_player_id, created_at desc);
create index if not exists chess_matches_black_idx
  on public.chess_matches (black_player_id, created_at desc);
create index if not exists chess_matches_status_idx
  on public.chess_matches (status, created_at desc);
create index if not exists chess_matches_season_idx
  on public.chess_matches (season_id, ended_at desc) where season_id is not null;

-- Clients submit commands, never authoritative moves. A trusted rules engine
-- later validates a pending command and commits it through a service-only RPC.
create table if not exists public.chess_move_commands (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.chess_matches(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete cascade,
  client_command_id uuid not null,
  sequence bigint not null check (sequence > 0),
  expected_revision bigint not null check (expected_revision >= 0),
  uci text not null check (char_length(uci) between 4 and 32),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'superseded')),
  rejection_reason text,
  submitted_clock_ms integer check (submitted_clock_ms between 0 and 604800000),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (match_id, actor_id, client_command_id),
  unique (match_id, sequence),
  check (
    (status = 'pending' and processed_at is null)
    or (status <> 'pending' and processed_at is not null)
  )
);

create index if not exists chess_move_commands_pending_idx
  on public.chess_move_commands (match_id, sequence)
  where status = 'pending';
create index if not exists chess_move_commands_actor_idx
  on public.chess_move_commands (actor_id, created_at desc);

create table if not exists public.chess_match_moves (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.chess_matches(id) on delete restrict,
  ply integer not null check (ply > 0),
  revision bigint not null check (revision > 0),
  actor_id uuid references auth.users(id) on delete set null,
  client_move_id uuid not null,
  command_sequence bigint not null check (command_sequence > 0),
  side text not null check (side in ('white', 'black')),
  next_side text not null check (next_side in ('white', 'black')),
  uci text not null check (char_length(uci) between 4 and 32),
  san text check (san is null or char_length(san) between 1 and 64),
  fen_before text not null check (char_length(fen_before) between 5 and 512),
  fen_after text not null check (char_length(fen_after) between 5 and 512),
  spent_ms integer not null default 0 check (spent_ms between 0 and 604800000),
  clock_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(clock_state) = 'object'),
  rule_state_hash text not null
    check (char_length(rule_state_hash) between 16 and 128),
  position_hash text not null
    check (char_length(position_hash) between 16 and 128),
  created_at timestamptz not null default now(),
  unique (match_id, ply),
  unique (match_id, revision),
  unique (match_id, actor_id, client_move_id)
);

create index if not exists chess_match_moves_actor_idx
  on public.chess_match_moves (actor_id, created_at desc);

create table if not exists public.chess_match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.chess_matches(id) on delete restrict,
  revision bigint not null check (revision >= 0),
  sequence bigint generated always as (revision + 1) stored,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{1,39}$'),
  actor_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (match_id, revision)
);

create index if not exists chess_match_events_match_idx
  on public.chess_match_events (match_id, revision);
create index if not exists chess_match_events_type_idx
  on public.chess_match_events (event_type, created_at desc);
create index if not exists chess_match_events_actor_idx
  on public.chess_match_events (actor_id, created_at desc)
  where actor_id is not null;

create table if not exists public.chess_player_ratings (
  season_id uuid not null references public.chess_rating_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 0 and 5000),
  peak_rating integer not null check (peak_rating between 0 and 5000),
  games_played integer not null default 0 check (games_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  draws integer not null default 0 check (draws >= 0),
  losses integer not null default 0 check (losses >= 0),
  provisional boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (season_id, user_id),
  check (games_played = wins + draws + losses)
);

create index if not exists chess_player_ratings_leaderboard_idx
  on public.chess_player_ratings (season_id, rating desc, games_played desc, user_id);
create index if not exists chess_player_ratings_user_idx
  on public.chess_player_ratings (user_id, updated_at desc);

create table if not exists public.chess_rating_history (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.chess_rating_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references public.chess_matches(id) on delete restrict,
  rating_before integer not null,
  rating_after integer not null,
  delta integer not null,
  expected_score numeric(8, 7) not null check (expected_score between 0 and 1),
  actual_score numeric(2, 1) not null check (actual_score in (0, 0.5, 1)),
  created_at timestamptz not null default now(),
  unique (match_id, user_id),
  check (rating_after - rating_before = delta)
);

create index if not exists chess_rating_history_user_idx
  on public.chess_rating_history (user_id, created_at desc);
create index if not exists chess_rating_history_season_idx
  on public.chess_rating_history (season_id, created_at desc);

create table if not exists public.chess_player_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_xp bigint not null default 0 check (total_xp >= 0),
  level integer not null default 1 check (level between 1 and 10000),
  games_played integer not null default 0 check (games_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  draws integer not null default 0 check (draws >= 0),
  losses integer not null default 0 check (losses >= 0),
  puzzles_solved integer not null default 0 check (puzzles_solved >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  last_activity_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (games_played = wins + draws + losses),
  check (best_streak >= current_streak)
);

create index if not exists chess_player_progress_xp_idx
  on public.chess_player_progress (total_xp desc, user_id);

create table if not exists public.chess_xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount between 1 and 100000),
  source_type text not null
    check (source_type in ('match', 'puzzle', 'quest', 'admin')),
  source_id uuid not null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (user_id, source_type, source_id)
);

create index if not exists chess_xp_events_user_idx
  on public.chess_xp_events (user_id, created_at desc);

create table if not exists public.chess_badges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,49}$'),
  name text not null check (char_length(name) between 2 and 80),
  description text not null check (char_length(description) between 3 and 300),
  icon_key text not null check (icon_key ~ '^[a-z0-9][a-z0-9-]{1,49}$'),
  rarity text not null default 'common'
    check (rarity in ('common', 'rare', 'epic', 'legendary')),
  criteria jsonb not null default '{}'::jsonb
    check (jsonb_typeof(criteria) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.chess_player_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id uuid not null references public.chess_badges(id) on delete restrict,
  source_type text not null check (source_type in ('match', 'puzzle', 'quest', 'admin')),
  source_id uuid,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create index if not exists chess_player_badges_awarded_idx
  on public.chess_player_badges (user_id, awarded_at desc);
create index if not exists chess_player_badges_badge_idx
  on public.chess_player_badges (badge_id, awarded_at desc);

create table if not exists public.chess_quests (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  name text not null check (char_length(name) between 3 and 100),
  description text not null check (char_length(description) between 3 and 400),
  cadence text not null check (cadence in ('once', 'daily', 'weekly', 'seasonal')),
  objective_type text not null
    check (objective_type in ('games_played', 'wins', 'draws', 'puzzles_solved', 'xp_earned')),
  target integer not null check (target between 1 and 1000000),
  xp_reward integer not null default 0 check (xp_reward between 0 and 100000),
  badge_id uuid references public.chess_badges(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists chess_quests_active_idx
  on public.chess_quests (starts_at, ends_at)
  where is_active;
create index if not exists chess_quests_badge_idx
  on public.chess_quests (badge_id)
  where badge_id is not null;

create table if not exists public.chess_player_quests (
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id uuid not null references public.chess_quests(id) on delete cascade,
  progress integer not null default 0 check (progress >= 0),
  target_snapshot integer not null check (target_snapshot > 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  claimed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, quest_id),
  check (progress <= target_snapshot),
  check (completed_at is null or progress = target_snapshot),
  check (claimed_at is null or completed_at is not null)
);

create index if not exists chess_player_quests_user_idx
  on public.chess_player_quests (user_id, completed_at, claimed_at, updated_at desc);
create index if not exists chess_player_quests_quest_idx
  on public.chess_player_quests (quest_id);

create table if not exists public.chess_daily_puzzles (
  id uuid primary key default gen_random_uuid(),
  puzzle_date date not null unique,
  title text not null check (char_length(title) between 3 and 100),
  fen text not null check (char_length(fen) between 5 and 512),
  solution_moves text[] not null check (cardinality(solution_moves) between 1 and 64),
  themes text[] not null default '{}'::text[],
  rating integer not null default 1200 check (rating between 100 and 4000),
  source text not null check (char_length(source) between 3 and 100),
  source_reference text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chess_daily_puzzles_published_idx
  on public.chess_daily_puzzles (puzzle_date desc) where published;

create table if not exists public.chess_puzzle_attempts (
  id uuid primary key default gen_random_uuid(),
  puzzle_id uuid not null references public.chess_daily_puzzles(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'started'
    check (status in ('started', 'solved', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  submitted_line text[] not null default '{}'::text[],
  hints_used integer not null default 0 check (hints_used between 0 and 10),
  duration_ms integer check (duration_ms between 0 and 86400000),
  started_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  solved_at timestamptz,
  unique (puzzle_id, user_id),
  check ((status = 'solved' and solved_at is not null) or status <> 'solved')
);

create index if not exists chess_puzzle_attempts_user_idx
  on public.chess_puzzle_attempts (user_id, started_at desc);
create index if not exists chess_puzzle_attempts_puzzle_idx
  on public.chess_puzzle_attempts (puzzle_id, status);

create table if not exists public.chess_matchmaking_tickets (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users(id) on delete cascade,
  request_key uuid not null,
  status text not null default 'queued'
    check (status in ('queued', 'matched', 'cancelled', 'expired')),
  ruleset_type text not null check (ruleset_type in ('standard', 'custom')),
  ruleset_hash text not null,
  rule_version_ids uuid[] not null default '{}'::uuid[]
    check (cardinality(rule_version_ids) between 0 and 8),
  rated boolean not null default false,
  season_id uuid references public.chess_rating_seasons(id) on delete restrict,
  player_rating integer not null check (player_rating between 0 and 5000),
  rating_window integer not null default 200 check (rating_window between 25 and 1000),
  initial_seconds integer not null check (initial_seconds between 30 and 604800),
  increment_seconds integer not null check (increment_seconds between 0 and 3600),
  matched_room_id uuid references public.chess_rooms(id) on delete set null,
  matched_match_id uuid references public.chess_matches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  unique (player_id, request_key),
  check ((rated and season_id is not null) or (not rated and season_id is null)),
  check (not rated or ruleset_type = 'standard'),
  check (expires_at > created_at)
);

create unique index if not exists chess_matchmaking_one_queued_player_idx
  on public.chess_matchmaking_tickets (player_id) where status = 'queued';
create index if not exists chess_matchmaking_queue_idx
  on public.chess_matchmaking_tickets (
    ruleset_hash,
    rated,
    initial_seconds,
    increment_seconds,
    created_at
  ) where status = 'queued';
create index if not exists chess_matchmaking_expiry_idx
  on public.chess_matchmaking_tickets (expires_at) where status = 'queued';
create index if not exists chess_matchmaking_season_idx
  on public.chess_matchmaking_tickets (season_id)
  where season_id is not null;
create index if not exists chess_matchmaking_room_idx
  on public.chess_matchmaking_tickets (matched_room_id)
  where matched_room_id is not null;
create index if not exists chess_matchmaking_match_idx
  on public.chess_matchmaking_tickets (matched_match_id)
  where matched_match_id is not null;

-- All new exposed-schema tables are deny-by-default until an explicit policy
-- and grant below opens the smallest required surface.
alter table public.chess_rating_seasons enable row level security;
alter table public.chess_rooms enable row level security;
alter table public.chess_room_members enable row level security;
alter table public.chess_room_rule_versions enable row level security;
alter table public.chess_room_invitations enable row level security;
alter table public.chess_matches enable row level security;
alter table public.chess_move_commands enable row level security;
alter table public.chess_match_moves enable row level security;
alter table public.chess_match_events enable row level security;
alter table public.chess_player_ratings enable row level security;
alter table public.chess_rating_history enable row level security;
alter table public.chess_player_progress enable row level security;
alter table public.chess_xp_events enable row level security;
alter table public.chess_badges enable row level security;
alter table public.chess_player_badges enable row level security;
alter table public.chess_quests enable row level security;
alter table public.chess_player_quests enable row level security;
alter table public.chess_daily_puzzles enable row level security;
alter table public.chess_puzzle_attempts enable row level security;
alter table public.chess_matchmaking_tickets enable row level security;

-- Seeded, internally curated mate-in-one. The position and move notation are
-- chess facts; no third-party puzzle text or proprietary identifier is copied.
insert into public.chess_daily_puzzles (
  id,
  puzzle_date,
  title,
  fen,
  solution_moves,
  themes,
  rating,
  source,
  source_reference,
  published
)
values (
  'c4000000-0000-4000-8000-000000000001',
  date '2026-07-20',
  'Le mat silencieux',
  '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',
  array['f7f8'],
  array['mateIn1', 'queenEndgame'],
  800,
  'curated-internal',
  'Original Rule Architect foundation composition',
  true
)
on conflict (puzzle_date) do nothing;

insert into public.chess_badges (
  id, slug, name, description, icon_key, rarity, criteria
)
values
  (
    'c4100000-0000-4000-8000-000000000001',
    'first-game',
    'Premier duel',
    'Terminer une première partie multijoueur.',
    'swords',
    'common',
    '{"metric":"games_played","target":1}'::jsonb
  ),
  (
    'c4100000-0000-4000-8000-000000000002',
    'first-win',
    'Première victoire',
    'Remporter une première partie multijoueur.',
    'trophy',
    'common',
    '{"metric":"wins","target":1}'::jsonb
  ),
  (
    'c4100000-0000-4000-8000-000000000003',
    'first-puzzle',
    'Œil tactique',
    'Résoudre un premier problème du jour.',
    'puzzle',
    'common',
    '{"metric":"puzzles_solved","target":1}'::jsonb
  )
on conflict (slug) do nothing;

create or replace function public.chess_platform_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.chess_platform_touch_updated_at()
  from public, anon, authenticated;

drop trigger if exists chess_rating_seasons_touch_updated_at
  on public.chess_rating_seasons;
create trigger chess_rating_seasons_touch_updated_at
before update on public.chess_rating_seasons
for each row execute function public.chess_platform_touch_updated_at();

drop trigger if exists chess_rooms_touch_updated_at on public.chess_rooms;
create trigger chess_rooms_touch_updated_at
before update on public.chess_rooms
for each row execute function public.chess_platform_touch_updated_at();

drop trigger if exists chess_player_progress_touch_updated_at
  on public.chess_player_progress;
create trigger chess_player_progress_touch_updated_at
before update on public.chess_player_progress
for each row execute function public.chess_platform_touch_updated_at();

drop trigger if exists chess_player_quests_touch_updated_at
  on public.chess_player_quests;
create trigger chess_player_quests_touch_updated_at
before update on public.chess_player_quests
for each row execute function public.chess_platform_touch_updated_at();

drop trigger if exists chess_daily_puzzles_touch_updated_at
  on public.chess_daily_puzzles;
create trigger chess_daily_puzzles_touch_updated_at
before update on public.chess_daily_puzzles
for each row execute function public.chess_platform_touch_updated_at();

drop trigger if exists chess_matchmaking_touch_updated_at
  on public.chess_matchmaking_tickets;
create trigger chess_matchmaking_touch_updated_at
before update on public.chess_matchmaking_tickets
for each row execute function public.chess_platform_touch_updated_at();

create or replace function private.is_current_user_chess_room_member(
  p_room_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.chess_room_members member_row
    where member_row.room_id = p_room_id
      and member_row.user_id = auth.uid()
      and member_row.membership_status = 'active'
  );
$$;

revoke all on function private.is_current_user_chess_room_member(uuid)
  from public, anon, authenticated;
grant execute on function private.is_current_user_chess_room_member(uuid)
  to authenticated, service_role;

-- RLS: authenticated users only see public catalogs plus rows they own or
-- participate in. No INSERT/UPDATE/DELETE policy is granted to clients.
drop policy if exists chess_rating_seasons_read on public.chess_rating_seasons;
create policy chess_rating_seasons_read
  on public.chess_rating_seasons for select to authenticated
  using (status in ('active', 'completed'));

drop policy if exists chess_rooms_read on public.chess_rooms;
create policy chess_rooms_read
  on public.chess_rooms for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (
      visibility = 'public'
      and status = 'open'
    )
    or exists (
      select 1
      from public.chess_room_members member_row
      where member_row.room_id = chess_rooms.id
        and member_row.user_id = (select auth.uid())
        and member_row.membership_status = 'active'
    )
  );

drop policy if exists chess_room_members_read on public.chess_room_members;
drop function if exists public.is_current_user_chess_room_member(uuid);
create policy chess_room_members_read
  on public.chess_room_members for select to authenticated
  using ((select private.is_current_user_chess_room_member(room_id)));

drop policy if exists chess_room_rule_versions_read
  on public.chess_room_rule_versions;
create policy chess_room_rule_versions_read
  on public.chess_room_rule_versions for select to authenticated
  using (
    exists (
      select 1
      from public.chess_rooms room_row
      where room_row.id = chess_room_rule_versions.room_id
        and (
          room_row.owner_id = (select auth.uid())
          or exists (
            select 1
            from public.chess_room_members member_row
            where member_row.room_id = room_row.id
              and member_row.user_id = (select auth.uid())
              and member_row.membership_status = 'active'
          )
        )
    )
  );

drop policy if exists chess_room_invitations_read
  on public.chess_room_invitations;
create policy chess_room_invitations_read
  on public.chess_room_invitations for select to authenticated
  using (
    inviter_id = (select auth.uid())
    or invitee_id = (select auth.uid())
  );

drop policy if exists chess_matches_read on public.chess_matches;
create policy chess_matches_read
  on public.chess_matches for select to authenticated
  using (
    white_player_id = (select auth.uid())
    or black_player_id = (select auth.uid())
    or exists (
      select 1
      from public.chess_room_members member_row
      where member_row.room_id = chess_matches.room_id
        and member_row.user_id = (select auth.uid())
        and member_row.membership_status = 'active'
    )
  );

drop policy if exists chess_move_commands_read on public.chess_move_commands;
create policy chess_move_commands_read
  on public.chess_move_commands for select to authenticated
  using (actor_id = (select auth.uid()));

drop policy if exists chess_match_moves_read on public.chess_match_moves;
create policy chess_match_moves_read
  on public.chess_match_moves for select to authenticated
  using (
    exists (
      select 1
      from public.chess_matches match_row
      where match_row.id = chess_match_moves.match_id
        and (
          match_row.white_player_id = (select auth.uid())
          or match_row.black_player_id = (select auth.uid())
          or exists (
            select 1
            from public.chess_room_members member_row
            where member_row.room_id = match_row.room_id
              and member_row.user_id = (select auth.uid())
              and member_row.membership_status = 'active'
          )
        )
    )
  );

drop policy if exists chess_match_events_read on public.chess_match_events;
create policy chess_match_events_read
  on public.chess_match_events for select to authenticated
  using (
    exists (
      select 1
      from public.chess_matches match_row
      where match_row.id = chess_match_events.match_id
        and (
          match_row.white_player_id = (select auth.uid())
          or match_row.black_player_id = (select auth.uid())
          or exists (
            select 1
            from public.chess_room_members member_row
            where member_row.room_id = match_row.room_id
              and member_row.user_id = (select auth.uid())
              and member_row.membership_status = 'active'
          )
        )
    )
  );

drop policy if exists chess_player_ratings_own on public.chess_player_ratings;
create policy chess_player_ratings_own
  on public.chess_player_ratings for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists chess_rating_history_own on public.chess_rating_history;
create policy chess_rating_history_own
  on public.chess_rating_history for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists chess_player_progress_own on public.chess_player_progress;
create policy chess_player_progress_own
  on public.chess_player_progress for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists chess_xp_events_own on public.chess_xp_events;
create policy chess_xp_events_own
  on public.chess_xp_events for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists chess_badges_catalog on public.chess_badges;
create policy chess_badges_catalog
  on public.chess_badges for select to authenticated
  using (is_active);

drop policy if exists chess_player_badges_own on public.chess_player_badges;
create policy chess_player_badges_own
  on public.chess_player_badges for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists chess_quests_catalog on public.chess_quests;
create policy chess_quests_catalog
  on public.chess_quests for select to authenticated
  using (is_active and now() between starts_at and ends_at);

drop policy if exists chess_player_quests_own on public.chess_player_quests;
create policy chess_player_quests_own
  on public.chess_player_quests for select to authenticated
  using (user_id = (select auth.uid()));

-- The puzzle table deliberately has no client SELECT policy because it stores
-- the solution. Public puzzle data is projected by get_daily_chess_puzzle().
drop policy if exists chess_puzzle_attempts_own on public.chess_puzzle_attempts;
create policy chess_puzzle_attempts_own
  on public.chess_puzzle_attempts for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists chess_matchmaking_tickets_own
  on public.chess_matchmaking_tickets;
create policy chess_matchmaking_tickets_own
  on public.chess_matchmaking_tickets for select to authenticated
  using (player_id = (select auth.uid()));

-- A room participant may read the immutable custom rule versions locked to
-- that room. This adds a narrow policy without replacing Rule Architect V2.
drop policy if exists chess_room_members_read_rule_versions
  on public.rule_versions;
create policy chess_room_members_read_rule_versions
  on public.rule_versions for select to authenticated
  using (
    exists (
      select 1
      from public.chess_room_rule_versions locked_rule
      join public.chess_room_members member_row
        on member_row.room_id = locked_rule.room_id
      where locked_rule.rule_version_id = rule_versions.id
        and member_row.user_id = (select auth.uid())
        and member_row.membership_status = 'active'
    )
  );

revoke all on table
  public.chess_rating_seasons,
  public.chess_rooms,
  public.chess_room_members,
  public.chess_room_rule_versions,
  public.chess_room_invitations,
  public.chess_matches,
  public.chess_move_commands,
  public.chess_match_moves,
  public.chess_match_events,
  public.chess_player_ratings,
  public.chess_rating_history,
  public.chess_player_progress,
  public.chess_xp_events,
  public.chess_badges,
  public.chess_player_badges,
  public.chess_quests,
  public.chess_player_quests,
  public.chess_daily_puzzles,
  public.chess_puzzle_attempts,
  public.chess_matchmaking_tickets
from public, anon, authenticated;

grant select on table
  public.chess_rating_seasons,
  public.chess_rooms,
  public.chess_room_members,
  public.chess_room_rule_versions,
  public.chess_room_invitations,
  public.chess_matches,
  public.chess_move_commands,
  public.chess_match_moves,
  public.chess_match_events,
  public.chess_player_ratings,
  public.chess_rating_history,
  public.chess_player_progress,
  public.chess_xp_events,
  public.chess_badges,
  public.chess_player_badges,
  public.chess_quests,
  public.chess_player_quests,
  public.chess_puzzle_attempts,
  public.chess_matchmaking_tickets
to authenticated;

grant all on table
  public.chess_rating_seasons,
  public.chess_rooms,
  public.chess_room_members,
  public.chess_room_rule_versions,
  public.chess_room_invitations,
  public.chess_matches,
  public.chess_move_commands,
  public.chess_match_moves,
  public.chess_match_events,
  public.chess_player_ratings,
  public.chess_rating_history,
  public.chess_player_progress,
  public.chess_xp_events,
  public.chess_badges,
  public.chess_player_badges,
  public.chess_quests,
  public.chess_player_quests,
  public.chess_daily_puzzles,
  public.chess_puzzle_attempts,
  public.chess_matchmaking_tickets
to service_role;

-- The canonical move/event journal is append-only through owner-controlled
-- SECURITY DEFINER RPCs. Even service_role cannot mutate it directly.
revoke insert, update, delete, truncate on table
  public.chess_match_moves,
  public.chess_match_events
from service_role;

create or replace function public.compute_chess_ruleset_hash(
  p_rule_version_ids uuid[]
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_material text;
begin
  if coalesce(cardinality(p_rule_version_ids), 0) = 0 then
    v_material := 'standard:engine:2.0.0';
  else
    select jsonb_agg(
      jsonb_build_array(
        requested.ordinal,
        version_row.id,
        version_row.content_hash,
        version_row.engine_version
      ) order by requested.ordinal
    )::text
    into v_material
    from unnest(p_rule_version_ids)
      with ordinality as requested(version_id, ordinal)
    join public.rule_versions version_row
      on version_row.id = requested.version_id;

    if v_material is null then
      raise exception 'RULE_VERSION_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  return encode(
    extensions.digest(convert_to(v_material, 'UTF8'), 'sha256'),
    'hex'
  );
end;
$$;

revoke all on function public.compute_chess_ruleset_hash(uuid[])
  from public, anon, authenticated;

create or replace function public.create_chess_room(
  p_name text,
  p_visibility text,
  p_request_key uuid,
  p_rule_version_ids uuid[] default '{}'::uuid[],
  p_rated boolean default false,
  p_initial_seconds integer default 600,
  p_increment_seconds integer default 0,
  p_owner_color text default 'random'
)
returns table (
  room_id uuid,
  ruleset_hash text,
  owner_color text,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.chess_rooms%rowtype;
  v_room_id uuid;
  v_rule_count integer := coalesce(cardinality(p_rule_version_ids), 0);
  v_accessible integer;
  v_ruleset_type text;
  v_ruleset_hash text;
  v_owner_color text;
  v_season_id uuid;
  v_configuration jsonb;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_request_key is null then
    raise exception 'REQUEST_KEY_REQUIRED' using errcode = '22023';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 3 and 80 then
    raise exception 'INVALID_ROOM_NAME' using errcode = '22023';
  end if;
  if p_visibility not in ('public', 'private', 'unlisted') then
    raise exception 'INVALID_ROOM_VISIBILITY' using errcode = '22023';
  end if;
  if p_initial_seconds not between 30 and 604800
    or p_increment_seconds not between 0 and 3600 then
    raise exception 'INVALID_TIME_CONTROL' using errcode = '22023';
  end if;
  if p_owner_color not in ('white', 'black', 'random') then
    raise exception 'INVALID_OWNER_COLOR' using errcode = '22023';
  end if;
  if v_rule_count not between 0 and 8 then
    raise exception 'INVALID_RULE_COUNT' using errcode = '22023';
  end if;
  if (
    select count(distinct version_id)
    from unnest(p_rule_version_ids) as version_id
  ) <> v_rule_count then
    raise exception 'DUPLICATE_RULE_VERSION' using errcode = '22023';
  end if;

  v_ruleset_type := case when v_rule_count = 0 then 'standard' else 'custom' end;
  if p_rated and v_ruleset_type <> 'standard' then
    raise exception 'CUSTOM_RULES_CANNOT_BE_RATED' using errcode = '22023';
  end if;

  if v_rule_count > 0 then
    select count(*) into v_accessible
    from unnest(p_rule_version_ids) as requested(version_id)
    where public.can_read_rule_version(requested.version_id);
    if v_accessible <> v_rule_count then
      raise exception 'RULE_VERSION_NOT_ACCESSIBLE' using errcode = '42501';
    end if;
  end if;

  if p_rated then
    select season_row.id into v_season_id
    from public.chess_rating_seasons season_row
    where season_row.status = 'active'
      and clock_timestamp() between season_row.starts_at and season_row.ends_at
    limit 1;
    if v_season_id is null then
      raise exception 'NO_ACTIVE_RATING_SEASON' using errcode = '55000';
    end if;
  end if;

  v_ruleset_hash := public.compute_chess_ruleset_hash(p_rule_version_ids);
  v_owner_color := case
    when p_owner_color in ('white', 'black') then p_owner_color
    when get_byte(extensions.gen_random_bytes(1), 0) % 2 = 0 then 'white'
    else 'black'
  end;
  v_configuration := jsonb_build_object(
    'ruleVersionIds', to_jsonb(p_rule_version_ids),
    'ownerColor', v_owner_color
  );

  select * into v_room
  from public.chess_rooms
  where owner_id = v_user_id and request_key = p_request_key
  for update;

  if found then
    if v_room.name <> trim(p_name)
      or v_room.visibility <> p_visibility
      or v_room.rated <> p_rated
      or v_room.initial_seconds <> p_initial_seconds
      or v_room.increment_seconds <> p_increment_seconds
      or v_room.ruleset_hash <> v_ruleset_hash
      or coalesce(v_room.configuration -> 'ruleVersionIds', '[]'::jsonb)
        <> to_jsonb(p_rule_version_ids) then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;
    return query select v_room.id, v_room.ruleset_hash,
      v_room.configuration ->> 'ownerColor', v_room.status;
    return;
  end if;

  insert into public.chess_rooms (
    owner_id, request_key, name, visibility, ruleset_type, ruleset_hash,
    rated, season_id, initial_seconds, increment_seconds, configuration
  ) values (
    v_user_id, p_request_key, trim(p_name), p_visibility, v_ruleset_type,
    v_ruleset_hash, p_rated, v_season_id, p_initial_seconds,
    p_increment_seconds, v_configuration
  ) returning id into v_room_id;

  insert into public.chess_room_members (
    room_id, user_id, member_role, color
  ) values (v_room_id, v_user_id, 'owner', v_owner_color);

  if v_rule_count > 0 then
    insert into public.chess_room_rule_versions (room_id, rule_version_id, ordinal)
    select v_room_id, requested.version_id, requested.ordinal::smallint
    from unnest(p_rule_version_ids)
      with ordinality as requested(version_id, ordinal);
  end if;

  return query select v_room_id, v_ruleset_hash, v_owner_color, 'open'::text;
end;
$$;

revoke all on function public.create_chess_room(
  text, text, uuid, uuid[], boolean, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.create_chess_room(
  text, text, uuid, uuid[], boolean, integer, integer, text
) to authenticated;

create or replace function public.list_open_chess_rooms(
  p_limit integer default 50
)
returns table (
  room_id uuid,
  room_name text,
  owner_id uuid,
  ruleset_type text,
  ruleset_hash text,
  rated boolean,
  initial_seconds integer,
  increment_seconds integer,
  waiting_since timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  return query
  select room_row.id, room_row.name, room_row.owner_id,
    room_row.ruleset_type, room_row.ruleset_hash, room_row.rated,
    room_row.initial_seconds, room_row.increment_seconds, room_row.created_at
  from public.chess_rooms room_row
  where room_row.visibility = 'public' and room_row.status = 'open'
  order by room_row.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

revoke all on function public.list_open_chess_rooms(integer)
  from public, anon, authenticated;
grant execute on function public.list_open_chess_rooms(integer)
  to authenticated;

create or replace function public.create_chess_room_invitation(
  p_room_id uuid,
  p_invitee_id uuid default null,
  p_ttl_minutes integer default 1440
)
returns table (
  invitation_id uuid,
  invitation_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.chess_rooms%rowtype;
  v_token text;
  v_hash text;
  v_id uuid;
  v_expires timestamptz;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_ttl_minutes not between 5 and 10080 then
    raise exception 'INVALID_INVITATION_TTL' using errcode = '22023';
  end if;
  if p_invitee_id = v_user_id then
    raise exception 'CANNOT_INVITE_SELF' using errcode = '22023';
  end if;

  select * into v_room
  from public.chess_rooms
  where id = p_room_id
  for update;
  if not found or v_room.owner_id <> v_user_id or v_room.status <> 'open' then
    raise exception 'ROOM_NOT_INVITABLE' using errcode = '42501';
  end if;
  if p_invitee_id is not null and not exists (
    select 1 from auth.users user_row where user_row.id = p_invitee_id
  ) then
    raise exception 'INVITEE_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.chess_room_invitations
  set status = 'revoked', responded_at = now()
  where room_id = p_room_id
    and status = 'pending'
    and invitee_id is not distinct from p_invitee_id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(
    extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
    'hex'
  );
  v_expires := now() + make_interval(mins => p_ttl_minutes);

  insert into public.chess_room_invitations (
    room_id, inviter_id, invitee_id, token_hash, expires_at
  ) values (p_room_id, v_user_id, p_invitee_id, v_hash, v_expires)
  returning id into v_id;

  return query select v_id, v_token, v_expires;
end;
$$;

revoke all on function public.create_chess_room_invitation(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.create_chess_room_invitation(uuid, uuid, integer)
  to authenticated;

create or replace function public.create_chess_match_internal(
  p_room_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.chess_rooms%rowtype;
  v_white uuid;
  v_black uuid;
  v_match_id uuid;
  v_seed bigint;
  v_rule_state_hash text;
  v_position_hash text;
  v_initial_fen constant text :=
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
begin
  select * into v_room
  from public.chess_rooms
  where id = p_room_id
  for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;

  select match_row.id into v_match_id
  from public.chess_matches match_row
  where match_row.room_id = p_room_id;
  if v_match_id is not null then
    return v_match_id;
  end if;
  if v_room.status <> 'open' then
    raise exception 'ROOM_NOT_OPEN' using errcode = '55000';
  end if;

  select member_row.user_id into v_white
  from public.chess_room_members member_row
  where member_row.room_id = p_room_id
    and member_row.membership_status = 'active'
    and member_row.color = 'white';
  select member_row.user_id into v_black
  from public.chess_room_members member_row
  where member_row.room_id = p_room_id
    and member_row.membership_status = 'active'
    and member_row.color = 'black';
  if v_white is null or v_black is null then
    raise exception 'ROOM_NEEDS_TWO_PLAYERS' using errcode = '55000';
  end if;

  v_seed := (
    'x' || substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 13)
  )::bit(52)::bigint;
  v_rule_state_hash := encode(
    extensions.digest(
      convert_to(
        v_initial_fen || ':' || v_room.ruleset_hash || ':' || v_seed::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_position_hash := encode(
    extensions.digest(convert_to(v_initial_fen, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.chess_matches (
    room_id, white_player_id, black_player_id, status, rated, season_id,
    ruleset_hash, engine_version, shared_seed, initial_fen, current_fen,
    clock_state, state, rule_state_hash, position_hash, started_at
  ) values (
    p_room_id, v_white, v_black, 'active', v_room.rated, v_room.season_id,
    v_room.ruleset_hash, v_room.engine_version, v_seed, v_initial_fen,
    v_initial_fen,
    jsonb_build_object(
      'whiteMs', v_room.initial_seconds * 1000,
      'blackMs', v_room.initial_seconds * 1000,
      'incrementMs', v_room.increment_seconds * 1000
    ),
    jsonb_build_object(
      'rulesetType', v_room.ruleset_type,
      'rulesetHash', v_room.ruleset_hash,
      'engineVersion', v_room.engine_version,
      'ruleStateHash', v_rule_state_hash
    ),
    v_rule_state_hash,
    v_position_hash,
    now()
  ) returning id into v_match_id;

  insert into public.chess_match_events (
    match_id, revision, event_type, payload
  ) values (
    v_match_id,
    0,
    'match_started',
    jsonb_build_object(
      'whitePlayerId', v_white,
      'blackPlayerId', v_black,
      'rulesetHash', v_room.ruleset_hash,
      'sharedSeed', v_seed,
      'ruleStateHash', v_rule_state_hash,
      'positionHash', v_position_hash,
      'engineVersion', v_room.engine_version
    )
  );

  update public.chess_rooms
  set status = 'in_game', started_at = now(), revision = revision + 1
  where id = p_room_id;

  return v_match_id;
end;
$$;

revoke all on function public.create_chess_match_internal(uuid)
  from public, anon, authenticated;

create or replace function public.join_chess_room(
  p_room_id uuid,
  p_invitation_token text default null
)
returns table (
  room_id uuid,
  match_id uuid,
  assigned_color text,
  room_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.chess_rooms%rowtype;
  v_member public.chess_room_members%rowtype;
  v_invitation public.chess_room_invitations%rowtype;
  v_token_hash text;
  v_color text;
  v_match_id uuid;
  v_player_count integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_room
  from public.chess_rooms
  where id = p_room_id
  for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_member
  from public.chess_room_members member_row
  where member_row.room_id = p_room_id
    and member_row.user_id = v_user_id
    and member_row.membership_status = 'active';
  if found then
    select match_row.id into v_match_id
    from public.chess_matches match_row
    where match_row.room_id = p_room_id;
    return query select p_room_id, v_match_id, v_member.color, v_room.status;
    return;
  end if;

  if v_room.status <> 'open' or v_room.owner_id = v_user_id then
    raise exception 'ROOM_NOT_AVAILABLE' using errcode = '40001';
  end if;

  if v_room.visibility = 'private' then
    if p_invitation_token is not null then
      v_token_hash := encode(
        extensions.digest(
          convert_to(trim(p_invitation_token), 'UTF8'),
          'sha256'
        ),
        'hex'
      );
    end if;

    select * into v_invitation
    from public.chess_room_invitations invitation_row
    where invitation_row.room_id = p_room_id
      and invitation_row.status = 'pending'
      and invitation_row.expires_at > clock_timestamp()
      and (
        invitation_row.invitee_id = v_user_id
        or (
          v_token_hash is not null
          and invitation_row.token_hash = v_token_hash
          and (
            invitation_row.invitee_id is null
            or invitation_row.invitee_id = v_user_id
          )
        )
      )
    order by invitation_row.created_at desc
    limit 1
    for update;
    if not found then
      raise exception 'VALID_INVITATION_REQUIRED' using errcode = '42501';
    end if;
  end if;

  select count(*) into v_player_count
  from public.chess_room_members member_row
  where member_row.room_id = p_room_id
    and member_row.membership_status = 'active'
    and member_row.member_role in ('owner', 'player');
  if v_player_count >= 2 then
    raise exception 'ROOM_FULL' using errcode = '40001';
  end if;

  select case
    when exists (
      select 1 from public.chess_room_members member_row
      where member_row.room_id = p_room_id
        and member_row.membership_status = 'active'
        and member_row.color = 'white'
    ) then 'black'
    else 'white'
  end into v_color;

  insert into public.chess_room_members (
    room_id, user_id, member_role, color
  ) values (p_room_id, v_user_id, 'player', v_color)
  on conflict on constraint chess_room_members_room_id_user_id_key do update
  set member_role = 'player', color = excluded.color,
      membership_status = 'active', joined_at = now(), left_at = null;

  if v_invitation.id is not null then
    update public.chess_room_invitations
    set status = 'accepted', responded_at = now()
    where id = v_invitation.id;
  end if;

  v_match_id := public.create_chess_match_internal(p_room_id);

  return query select p_room_id, v_match_id, v_color, 'in_game'::text;
end;
$$;

revoke all on function public.join_chess_room(uuid, text)
  from public, anon, authenticated;
grant execute on function public.join_chess_room(uuid, text)
  to authenticated;

create or replace function public.get_chess_match_snapshot(
  p_match_id uuid
)
returns table (
  match_id uuid,
  room_id uuid,
  match_status text,
  white_player_id uuid,
  black_player_id uuid,
  ruleset_hash text,
  shared_seed bigint,
  engine_version text,
  current_fen text,
  position_hash text,
  rule_state jsonb,
  rule_state_hash text,
  side_to_move text,
  ply_count integer,
  revision bigint,
  event_sequence bigint,
  command_sequence bigint,
  clock_state jsonb,
  server_now timestamptz,
  turn_started_at timestamptz,
  players_presence jsonb,
  verification_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.chess_matches match_row
    join public.chess_room_members member_row
      on member_row.room_id = match_row.room_id
    where match_row.id = p_match_id
      and member_row.user_id = v_user_id
      and member_row.membership_status = 'active'
  ) then
    raise exception 'MATCH_NOT_ACCESSIBLE' using errcode = '42501';
  end if;

  return query
  select match_row.id, match_row.room_id, match_row.status,
    match_row.white_player_id, match_row.black_player_id,
    match_row.ruleset_hash, match_row.shared_seed, match_row.engine_version,
    match_row.current_fen, match_row.position_hash, match_row.state,
    match_row.rule_state_hash, match_row.side_to_move, match_row.ply_count,
    match_row.revision, match_row.revision + 1,
    match_row.command_sequence, match_row.clock_state, clock_timestamp(),
    coalesce(match_row.last_move_at, match_row.started_at),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'userId', member_row.user_id,
            'color', member_row.color,
            'role', member_row.member_role,
            'presence', member_row.presence_status,
            'lastSeenAt', member_row.last_seen_at,
            'lastSeenRevision', member_row.last_seen_revision,
            'abandonmentRequestedAt', member_row.abandonment_requested_at
          ) order by member_row.color nulls last, member_row.user_id
        )
        from public.chess_room_members member_row
        where member_row.room_id = match_row.room_id
          and member_row.membership_status = 'active'
      ),
      '[]'::jsonb
    ),
    match_row.verification_status
  from public.chess_matches match_row
  where match_row.id = p_match_id;
end;
$$;

revoke all on function public.get_chess_match_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.get_chess_match_snapshot(uuid)
  to authenticated;

create or replace function public.get_chess_match_events_since(
  p_match_id uuid,
  p_after_revision bigint default -1,
  p_limit integer default 200
)
returns table (
  event_id uuid,
  match_id uuid,
  revision bigint,
  sequence bigint,
  event_type text,
  actor_id uuid,
  payload jsonb,
  created_at timestamptz,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_after_revision < -1 then
    raise exception 'INVALID_REPLAY_REVISION' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.chess_matches match_row
    join public.chess_room_members member_row
      on member_row.room_id = match_row.room_id
    where match_row.id = p_match_id
      and member_row.user_id = v_user_id
      and member_row.membership_status = 'active'
  ) then
    raise exception 'MATCH_NOT_ACCESSIBLE' using errcode = '42501';
  end if;

  return query
  select event_row.id, event_row.match_id, event_row.revision,
    event_row.sequence, event_row.event_type, event_row.actor_id,
    event_row.payload, event_row.created_at, clock_timestamp()
  from public.chess_match_events event_row
  where event_row.match_id = p_match_id
    and event_row.revision > p_after_revision
  order by event_row.revision
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;

revoke all on function public.get_chess_match_events_since(
  uuid, bigint, integer
) from public, anon, authenticated;
grant execute on function public.get_chess_match_events_since(
  uuid, bigint, integer
) to authenticated;

create or replace function public.heartbeat_chess_room(
  p_room_id uuid,
  p_last_seen_revision bigint default 0
)
returns table (
  server_now timestamptz,
  room_status text,
  match_id uuid,
  match_revision bigint,
  event_sequence bigint,
  turn_started_at timestamptz,
  clock_state jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_match public.chess_matches%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_last_seen_revision < 0 then
    raise exception 'INVALID_LAST_SEEN_REVISION' using errcode = '22023';
  end if;
  select * into v_match
  from public.chess_matches match_row
  where match_row.room_id = p_room_id;
  if found and p_last_seen_revision > v_match.revision then
    raise exception 'CLIENT_REVISION_AHEAD_OF_SERVER' using errcode = '22023';
  end if;

  update public.chess_room_members
  set last_seen_at = clock_timestamp(),
      last_seen_revision = p_last_seen_revision,
      presence_status = 'online'
  where room_id = p_room_id
    and user_id = v_user_id
    and membership_status = 'active';
  if not found then
    raise exception 'ROOM_MEMBERSHIP_REQUIRED' using errcode = '42501';
  end if;

  return query
  select clock_timestamp(), room_row.status, v_match.id, v_match.revision,
    case when v_match.id is null then null else v_match.revision + 1 end,
    coalesce(v_match.last_move_at, v_match.started_at),
    coalesce(v_match.clock_state, '{}'::jsonb)
  from public.chess_rooms room_row
  where room_row.id = p_room_id;
end;
$$;

revoke all on function public.heartbeat_chess_room(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.heartbeat_chess_room(uuid, bigint)
  to authenticated;

create or replace function public.request_chess_match_abandonment(
  p_match_id uuid,
  p_expected_revision bigint
)
returns table (
  accepted boolean,
  requested_at timestamptz,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_match public.chess_matches%rowtype;
  v_requested_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into v_match
  from public.chess_matches
  where id = p_match_id
  for update;
  if not found or v_match.status <> 'active' then
    raise exception 'MATCH_NOT_ACTIVE' using errcode = '55000';
  end if;
  if v_match.revision <> p_expected_revision then
    raise exception 'STALE_MATCH_REVISION' using errcode = '40001';
  end if;
  if v_user_id not in (v_match.white_player_id, v_match.black_player_id) then
    raise exception 'MATCH_PARTICIPANT_REQUIRED' using errcode = '42501';
  end if;

  update public.chess_room_members
  set abandonment_requested_at = coalesce(abandonment_requested_at, now()),
      presence_status = 'away',
      last_seen_at = clock_timestamp()
  where room_id = v_match.room_id and user_id = v_user_id
  returning abandonment_requested_at into v_requested_at;

  -- This is only a request. A trusted verifier must still finalize the match;
  -- therefore no result, Elo or XP changes here.
  return query select true, v_requested_at, clock_timestamp();
end;
$$;

revoke all on function public.request_chess_match_abandonment(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.request_chess_match_abandonment(uuid, bigint)
  to authenticated;

create or replace function public.submit_chess_move_command(
  p_match_id uuid,
  p_expected_revision bigint,
  p_client_command_id uuid,
  p_uci text,
  p_submitted_clock_ms integer default null
)
returns table (
  command_id uuid,
  command_sequence bigint,
  command_status text,
  authoritative_revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_match public.chess_matches%rowtype;
  v_existing public.chess_move_commands%rowtype;
  v_id uuid;
  v_sequence bigint;
  v_clock_ms bigint;
  v_elapsed_ms bigint;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_client_command_id is null or p_expected_revision is null then
    raise exception 'COMMAND_ID_AND_REVISION_REQUIRED' using errcode = '22023';
  end if;
  if p_uci is null or char_length(trim(p_uci)) not between 4 and 32 then
    raise exception 'INVALID_MOVE_NOTATION' using errcode = '22023';
  end if;
  if p_submitted_clock_ms is not null
    and p_submitted_clock_ms not between 0 and 604800000 then
    raise exception 'INVALID_CLIENT_CLOCK' using errcode = '22023';
  end if;

  select * into v_match
  from public.chess_matches
  where id = p_match_id
  for update;
  if not found then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_existing
  from public.chess_move_commands command_row
  where command_row.match_id = p_match_id
    and command_row.actor_id = v_user_id
    and command_row.client_command_id = p_client_command_id;
  if found then
    if v_existing.expected_revision <> p_expected_revision
      or v_existing.uci <> lower(trim(p_uci)) then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;
    return query select v_existing.id, v_existing.sequence,
      v_existing.status, v_match.revision;
    return;
  end if;

  if v_match.status <> 'active' then
    raise exception 'MATCH_NOT_ACTIVE' using errcode = '55000';
  end if;
  if v_match.revision <> p_expected_revision then
    raise exception 'STALE_MATCH_REVISION' using errcode = '40001';
  end if;
  if (v_match.side_to_move = 'white' and v_match.white_player_id <> v_user_id)
    or (v_match.side_to_move = 'black' and v_match.black_player_id <> v_user_id) then
    raise exception 'NOT_YOUR_TURN' using errcode = '42501';
  end if;

  v_clock_ms := case v_match.side_to_move
    when 'white' then coalesce((v_match.clock_state ->> 'whiteMs')::bigint, 0)
    else coalesce((v_match.clock_state ->> 'blackMs')::bigint, 0)
  end;
  v_elapsed_ms := greatest(
    0,
    floor(extract(epoch from (
      clock_timestamp() - coalesce(v_match.last_move_at, v_match.started_at)
    )) * 1000)::bigint
  );
  if v_clock_ms - v_elapsed_ms <= 0 then
    raise exception 'CLOCK_EXPIRED' using errcode = '55000';
  end if;

  v_sequence := v_match.command_sequence + 1;
  update public.chess_matches
  set command_sequence = v_sequence
  where id = p_match_id;

  insert into public.chess_move_commands (
    match_id, actor_id, client_command_id, sequence, expected_revision,
    uci, submitted_clock_ms
  ) values (
    p_match_id, v_user_id, p_client_command_id, v_sequence,
    p_expected_revision, lower(trim(p_uci)), p_submitted_clock_ms
  ) returning id into v_id;

  return query select v_id, v_sequence, 'pending'::text, v_match.revision;
end;
$$;

revoke all on function public.submit_chess_move_command(
  uuid, bigint, uuid, text, integer
) from public, anon, authenticated;
grant execute on function public.submit_chess_move_command(
  uuid, bigint, uuid, text, integer
) to authenticated;

create or replace function public.commit_chess_move_server(
  p_command_id uuid,
  p_san text,
  p_fen_before text,
  p_fen_after text,
  p_clock_state jsonb,
  p_next_side text,
  p_rule_state_hash text,
  p_spent_ms integer default 0,
  p_event_payload jsonb default '{}'::jsonb
)
returns table (
  move_id uuid,
  match_id uuid,
  ply integer,
  revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_command public.chess_move_commands%rowtype;
  v_match public.chess_matches%rowtype;
  v_move_id uuid;
  v_ply integer;
  v_revision bigint;
  v_position_hash text;
begin
  if p_command_id is null
    or p_fen_before is null
    or p_fen_after is null
    or jsonb_typeof(coalesce(p_clock_state, 'null'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_event_payload, 'null'::jsonb)) <> 'object' then
    raise exception 'INVALID_AUTHORITATIVE_MOVE' using errcode = '22023';
  end if;
  if p_next_side not in ('white', 'black')
    or p_rule_state_hash is null
    or char_length(p_rule_state_hash) not between 16 and 128 then
    raise exception 'INVALID_AUTHORITATIVE_RULE_STATE' using errcode = '22023';
  end if;
  if p_spent_ms not between 0 and 604800000 then
    raise exception 'INVALID_MOVE_DURATION' using errcode = '22023';
  end if;

  select * into v_command
  from public.chess_move_commands
  where id = p_command_id
  for update;
  if not found then
    raise exception 'MOVE_COMMAND_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_match
  from public.chess_matches
  where id = v_command.match_id
  for update;
  if v_command.status = 'accepted' then
    return query
    select move_row.id, move_row.match_id, move_row.ply, move_row.revision
    from public.chess_match_moves move_row
    where move_row.match_id = v_command.match_id
      and move_row.actor_id = v_command.actor_id
      and move_row.client_move_id = v_command.client_command_id;
    return;
  end if;
  if v_command.status <> 'pending' or v_match.status <> 'active' then
    raise exception 'MOVE_COMMAND_NOT_COMMITTABLE' using errcode = '55000';
  end if;
  if v_command.expected_revision <> v_match.revision then
    raise exception 'STALE_MOVE_COMMAND' using errcode = '40001';
  end if;
  if v_match.current_fen <> p_fen_before then
    raise exception 'FEN_REVISION_MISMATCH' using errcode = '40001';
  end if;
  if (v_match.side_to_move = 'white' and v_match.white_player_id <> v_command.actor_id)
    or (v_match.side_to_move = 'black' and v_match.black_player_id <> v_command.actor_id) then
    raise exception 'COMMAND_ACTOR_MISMATCH' using errcode = '42501';
  end if;

  v_ply := v_match.ply_count + 1;
  v_revision := v_match.revision + 1;
  v_position_hash := encode(
    extensions.digest(convert_to(p_fen_after, 'UTF8'), 'sha256'),
    'hex'
  );
  insert into public.chess_match_moves (
    match_id, ply, revision, actor_id, client_move_id, command_sequence,
    side, next_side, uci, san, fen_before, fen_after, spent_ms,
    clock_state, rule_state_hash, position_hash
  ) values (
    v_match.id, v_ply, v_revision, v_command.actor_id,
    v_command.client_command_id, v_command.sequence,
    v_match.side_to_move, p_next_side, v_command.uci,
    nullif(left(trim(p_san), 64), ''), p_fen_before, p_fen_after,
    p_spent_ms, p_clock_state, p_rule_state_hash, v_position_hash
  ) returning id into v_move_id;

  update public.chess_matches
  set current_fen = p_fen_after,
      side_to_move = p_next_side,
      ply_count = v_ply,
      revision = v_revision,
      clock_state = p_clock_state,
      rule_state_hash = p_rule_state_hash,
      position_hash = v_position_hash,
      state = jsonb_set(
        state,
        '{ruleStateHash}',
        to_jsonb(p_rule_state_hash),
        true
      ),
      last_move_at = now()
  where id = v_match.id;

  update public.chess_move_commands as accepted_command
  set status = 'accepted', processed_at = now()
  where accepted_command.id = p_command_id;
  update public.chess_move_commands as pending_command
  set status = 'superseded', processed_at = now(),
      rejection_reason = 'authoritative revision already consumed'
  where pending_command.match_id = v_match.id
    and pending_command.expected_revision = v_match.revision
    and pending_command.id <> p_command_id
    and pending_command.status = 'pending';

  insert into public.chess_match_events (
    match_id, revision, event_type, actor_id, payload
  ) values (
    v_match.id,
    v_revision,
    'move_committed',
    v_command.actor_id,
    p_event_payload || jsonb_build_object(
      'moveId', v_move_id,
      'commandId', p_command_id,
      'clientMoveId', v_command.client_command_id,
      'sequence', v_revision + 1,
      'commandSequence', v_command.sequence,
      'revision', v_revision,
      'ply', v_ply,
      'side', v_match.side_to_move,
      'nextSide', p_next_side,
      'uci', v_command.uci,
      'san', nullif(left(trim(p_san), 64), ''),
      'from', substr(v_command.uci, 1, 2),
      'to', substr(v_command.uci, 3, 2),
      'durationMs', p_spent_ms,
      'fenBefore', p_fen_before,
      'fenAfter', p_fen_after,
      'clockState', p_clock_state,
      'clock_state', p_clock_state,
      'turnStartedAt', now(),
      'serverNow', now(),
      'ruleStateHash', p_rule_state_hash,
      'positionHash', v_position_hash,
      'rulesetHash', v_match.ruleset_hash,
      'matchSeed', v_match.shared_seed,
      'engineVersion', v_match.engine_version
    )
  );

  return query select v_move_id, v_match.id, v_ply, v_revision;
end;
$$;

revoke all on function public.commit_chess_move_server(
  uuid, text, text, text, jsonb, text, text, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.commit_chess_move_server(
  uuid, text, text, text, jsonb, text, text, integer, jsonb
) to service_role;

create or replace function public.reject_chess_move_command_server(
  p_command_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chess_move_commands
  set status = 'rejected', processed_at = now(),
      rejection_reason = left(coalesce(nullif(trim(p_reason), ''), 'rejected'), 300)
  where id = p_command_id and status = 'pending';
  return found;
end;
$$;

revoke all on function public.reject_chess_move_command_server(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reject_chess_move_command_server(uuid, text)
  to service_role;

create or replace function public.enqueue_chess_matchmaking(
  p_request_key uuid,
  p_rule_version_ids uuid[] default '{}'::uuid[],
  p_rated boolean default false,
  p_initial_seconds integer default 600,
  p_increment_seconds integer default 0,
  p_rating_window integer default 200
)
returns table (
  ticket_id uuid,
  ticket_status text,
  room_id uuid,
  match_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.chess_matchmaking_tickets%rowtype;
  v_candidate public.chess_matchmaking_tickets%rowtype;
  v_ticket_id uuid;
  v_room_id uuid;
  v_match_id uuid;
  v_rule_count integer := coalesce(cardinality(p_rule_version_ids), 0);
  v_ruleset_type text;
  v_ruleset_hash text;
  v_season_id uuid;
  v_rating integer := 1200;
  v_initial_rating integer := 1200;
  v_accessible integer;
  v_candidate_color text;
  v_user_color text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_request_key is null then
    raise exception 'REQUEST_KEY_REQUIRED' using errcode = '22023';
  end if;
  if v_rule_count not between 0 and 8
    or p_initial_seconds not between 30 and 604800
    or p_increment_seconds not between 0 and 3600
    or p_rating_window not between 25 and 1000 then
    raise exception 'INVALID_MATCHMAKING_PARAMETERS' using errcode = '22023';
  end if;
  if (
    select count(distinct version_id)
    from unnest(p_rule_version_ids) as version_id
  ) <> v_rule_count then
    raise exception 'DUPLICATE_RULE_VERSION' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chess-player:' || v_user_id::text, 0)
  );

  select * into v_existing
  from public.chess_matchmaking_tickets ticket_row
  where ticket_row.player_id = v_user_id
    and ticket_row.request_key = p_request_key
  for update;
  if found then
    return query select v_existing.id, v_existing.status,
      v_existing.matched_room_id, v_existing.matched_match_id;
    return;
  end if;

  v_ruleset_type := case when v_rule_count = 0 then 'standard' else 'custom' end;
  if p_rated and v_ruleset_type <> 'standard' then
    raise exception 'CUSTOM_RULES_CANNOT_BE_RATED' using errcode = '22023';
  end if;
  if v_rule_count > 0 then
    select count(*) into v_accessible
    from unnest(p_rule_version_ids) as requested(version_id)
    where public.can_read_rule_version(requested.version_id);
    if v_accessible <> v_rule_count then
      raise exception 'RULE_VERSION_NOT_ACCESSIBLE' using errcode = '42501';
    end if;
  end if;

  if p_rated then
    select season_row.id, season_row.initial_rating
      into v_season_id, v_initial_rating
    from public.chess_rating_seasons season_row
    where season_row.status = 'active'
      and clock_timestamp() between season_row.starts_at and season_row.ends_at
    limit 1;
    if v_season_id is null then
      raise exception 'NO_ACTIVE_RATING_SEASON' using errcode = '55000';
    end if;
    select coalesce(rating_row.rating, v_initial_rating) into v_rating
    from (select 1) seed
    left join public.chess_player_ratings rating_row
      on rating_row.season_id = v_season_id
      and rating_row.user_id = v_user_id;
  end if;

  v_ruleset_hash := public.compute_chess_ruleset_hash(p_rule_version_ids);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chess-queue:' || v_ruleset_hash || ':' || p_rated::text || ':'
      || p_initial_seconds::text || ':' || p_increment_seconds::text,
      0
    )
  );

  update public.chess_matchmaking_tickets
  set status = case when expires_at <= clock_timestamp() then 'expired' else 'cancelled' end
  where player_id = v_user_id and status = 'queued';
  update public.chess_matchmaking_tickets
  set status = 'expired'
  where status = 'queued' and expires_at <= clock_timestamp();

  select * into v_candidate
  from public.chess_matchmaking_tickets ticket_row
  where ticket_row.status = 'queued'
    and ticket_row.player_id <> v_user_id
    and ticket_row.ruleset_hash = v_ruleset_hash
    and ticket_row.ruleset_type = v_ruleset_type
    and ticket_row.rule_version_ids = p_rule_version_ids
    and ticket_row.rated = p_rated
    and ticket_row.season_id is not distinct from v_season_id
    and ticket_row.initial_seconds = p_initial_seconds
    and ticket_row.increment_seconds = p_increment_seconds
    and abs(ticket_row.player_rating - v_rating)
      <= least(ticket_row.rating_window, p_rating_window)
    and ticket_row.expires_at > clock_timestamp()
  order by ticket_row.created_at
  limit 1
  for update skip locked;

  if not found then
    insert into public.chess_matchmaking_tickets (
      player_id, request_key, ruleset_type, ruleset_hash, rule_version_ids,
      rated, season_id, player_rating, rating_window, initial_seconds,
      increment_seconds
    ) values (
      v_user_id, p_request_key, v_ruleset_type, v_ruleset_hash,
      p_rule_version_ids, p_rated, v_season_id, v_rating, p_rating_window,
      p_initial_seconds, p_increment_seconds
    ) returning id into v_ticket_id;
    return query select v_ticket_id, 'queued'::text, null::uuid, null::uuid;
    return;
  end if;

  v_room_id := gen_random_uuid();
  v_candidate_color := case
    when get_byte(extensions.gen_random_bytes(1), 0) % 2 = 0 then 'white'
    else 'black'
  end;
  v_user_color := case v_candidate_color when 'white' then 'black' else 'white' end;

  insert into public.chess_rooms (
    id, owner_id, request_key, name, visibility, ruleset_type, ruleset_hash,
    rated, season_id, initial_seconds, increment_seconds, configuration
  ) values (
    v_room_id, v_candidate.player_id, v_room_id,
    'Partie rapide', 'unlisted', v_ruleset_type, v_ruleset_hash,
    p_rated, v_season_id, p_initial_seconds, p_increment_seconds,
    jsonb_build_object(
      'source', 'matchmaking',
      'ruleVersionIds', to_jsonb(p_rule_version_ids)
    )
  );
  insert into public.chess_room_members (
    room_id, user_id, member_role, color
  ) values
    (v_room_id, v_candidate.player_id, 'owner', v_candidate_color),
    (v_room_id, v_user_id, 'player', v_user_color);
  if v_rule_count > 0 then
    insert into public.chess_room_rule_versions (room_id, rule_version_id, ordinal)
    select v_room_id, requested.version_id, requested.ordinal::smallint
    from unnest(p_rule_version_ids)
      with ordinality as requested(version_id, ordinal);
  end if;

  v_match_id := public.create_chess_match_internal(v_room_id);
  update public.chess_matchmaking_tickets
  set status = 'matched', matched_room_id = v_room_id,
      matched_match_id = v_match_id
  where id = v_candidate.id;

  insert into public.chess_matchmaking_tickets (
    player_id, request_key, status, ruleset_type, ruleset_hash,
    rule_version_ids, rated, season_id, player_rating, rating_window,
    initial_seconds, increment_seconds, matched_room_id, matched_match_id
  ) values (
    v_user_id, p_request_key, 'matched', v_ruleset_type, v_ruleset_hash,
    p_rule_version_ids, p_rated, v_season_id, v_rating, p_rating_window,
    p_initial_seconds, p_increment_seconds, v_room_id, v_match_id
  ) returning id into v_ticket_id;

  return query select v_ticket_id, 'matched'::text, v_room_id, v_match_id;
end;
$$;

revoke all on function public.enqueue_chess_matchmaking(
  uuid, uuid[], boolean, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.enqueue_chess_matchmaking(
  uuid, uuid[], boolean, integer, integer, integer
) to authenticated;

create or replace function public.cancel_chess_matchmaking(
  p_ticket_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  update public.chess_matchmaking_tickets
  set status = 'cancelled'
  where id = p_ticket_id and player_id = v_user_id and status = 'queued';
  return found;
end;
$$;

revoke all on function public.cancel_chess_matchmaking(uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_chess_matchmaking(uuid)
  to authenticated;

create or replace function public.grant_chess_xp_internal(
  p_user_id uuid,
  p_amount integer,
  p_source_type text,
  p_source_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if p_user_id is null
    or p_amount not between 1 and 100000
    or p_source_type not in ('match', 'puzzle', 'quest', 'admin')
    or p_source_id is null
    or jsonb_typeof(coalesce(p_metadata, 'null'::jsonb)) <> 'object' then
    raise exception 'INVALID_XP_AWARD' using errcode = '22023';
  end if;

  insert into public.chess_xp_events (
    user_id, amount, source_type, source_id, metadata
  ) values (
    p_user_id, p_amount, p_source_type, p_source_id, p_metadata
  ) on conflict (user_id, source_type, source_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return false;
  end if;

  insert into public.chess_player_progress (user_id, total_xp, level)
  values (
    p_user_id,
    p_amount,
    least(10000, floor(sqrt(p_amount::numeric / 100))::integer + 1)
  )
  on conflict (user_id) do update
  set total_xp = public.chess_player_progress.total_xp + excluded.total_xp,
      level = least(
        10000,
        floor(sqrt(
          (public.chess_player_progress.total_xp + excluded.total_xp)::numeric
          / 100
        ))::integer + 1
      );
  return true;
end;
$$;

revoke all on function public.grant_chess_xp_internal(
  uuid, integer, text, uuid, jsonb
) from public, anon, authenticated;

create or replace function public.award_chess_badge_internal(
  p_user_id uuid,
  p_badge_slug text,
  p_source_type text,
  p_source_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  insert into public.chess_player_badges (
    user_id, badge_id, source_type, source_id
  )
  select p_user_id, badge_row.id, p_source_type, p_source_id
  from public.chess_badges badge_row
  where badge_row.slug = p_badge_slug and badge_row.is_active
  on conflict (user_id, badge_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.award_chess_badge_internal(
  uuid, text, text, uuid
) from public, anon, authenticated;

create or replace function public.advance_chess_quests_internal(
  p_user_id uuid,
  p_objective_type text,
  p_increment integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
begin
  if p_increment <= 0 or p_objective_type not in (
    'games_played', 'wins', 'draws', 'puzzles_solved', 'xp_earned'
  ) then
    return 0;
  end if;

  insert into public.chess_player_quests (
    user_id, quest_id, target_snapshot
  )
  select p_user_id, quest_row.id, quest_row.target
  from public.chess_quests quest_row
  where quest_row.is_active
    and quest_row.objective_type = p_objective_type
    and clock_timestamp() between quest_row.starts_at and quest_row.ends_at
  on conflict (user_id, quest_id) do nothing;

  update public.chess_player_quests player_quest
  set progress = least(
        player_quest.target_snapshot,
        player_quest.progress + p_increment
      ),
      completed_at = case
        when player_quest.progress + p_increment >= player_quest.target_snapshot
        then coalesce(player_quest.completed_at, now())
        else player_quest.completed_at
      end
  from public.chess_quests quest_row
  where player_quest.quest_id = quest_row.id
    and player_quest.user_id = p_user_id
    and player_quest.completed_at is null
    and quest_row.is_active
    and quest_row.objective_type = p_objective_type
    and clock_timestamp() between quest_row.starts_at and quest_row.ends_at;
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

revoke all on function public.advance_chess_quests_internal(
  uuid, text, integer
) from public, anon, authenticated;

create or replace function public.apply_verified_game_progress_internal(
  p_user_id uuid,
  p_outcome text,
  p_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_xp integer;
begin
  if p_outcome not in ('win', 'draw', 'loss') then
    raise exception 'INVALID_GAME_OUTCOME' using errcode = '22023';
  end if;
  v_xp := case p_outcome when 'win' then 25 when 'draw' then 15 else 10 end;
  perform public.grant_chess_xp_internal(
    p_user_id,
    v_xp,
    'match',
    p_match_id,
    jsonb_build_object('outcome', p_outcome)
  );

  insert into public.chess_player_progress (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
  update public.chess_player_progress
  set games_played = games_played + 1,
      wins = wins + case when p_outcome = 'win' then 1 else 0 end,
      draws = draws + case when p_outcome = 'draw' then 1 else 0 end,
      losses = losses + case when p_outcome = 'loss' then 1 else 0 end,
      current_streak = case
        when p_outcome = 'win' then current_streak + 1
        else 0
      end,
      best_streak = greatest(
        best_streak,
        case when p_outcome = 'win' then current_streak + 1 else 0 end
      ),
      last_activity_on = current_date
  where user_id = p_user_id;

  perform public.award_chess_badge_internal(
    p_user_id, 'first-game', 'match', p_match_id
  );
  if p_outcome = 'win' then
    perform public.award_chess_badge_internal(
      p_user_id, 'first-win', 'match', p_match_id
    );
  end if;
  perform public.advance_chess_quests_internal(
    p_user_id, 'games_played', 1
  );
  if p_outcome = 'win' then
    perform public.advance_chess_quests_internal(p_user_id, 'wins', 1);
  elsif p_outcome = 'draw' then
    perform public.advance_chess_quests_internal(p_user_id, 'draws', 1);
  end if;
end;
$$;

revoke all on function public.apply_verified_game_progress_internal(
  uuid, text, uuid
) from public, anon, authenticated;

create or replace function public.finalize_chess_match_server(
  p_match_id uuid,
  p_result text,
  p_termination text,
  p_verification_reference text
)
returns table (
  finalized boolean,
  white_rating integer,
  black_rating integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.chess_matches%rowtype;
  v_season public.chess_rating_seasons%rowtype;
  v_white public.chess_player_ratings%rowtype;
  v_black public.chess_player_ratings%rowtype;
  v_white_score numeric;
  v_black_score numeric;
  v_white_expected numeric;
  v_black_expected numeric;
  v_white_after integer;
  v_black_after integer;
  v_white_outcome text;
  v_black_outcome text;
  v_event_revision bigint;
begin
  if p_result not in ('1-0', '0-1', '1/2-1/2') then
    raise exception 'INVALID_MATCH_RESULT' using errcode = '22023';
  end if;
  if p_verification_reference is null
    or char_length(trim(p_verification_reference)) not between 8 and 300 then
    raise exception 'AUTHORITATIVE_VERIFICATION_REQUIRED' using errcode = '22023';
  end if;
  if p_termination is null or char_length(trim(p_termination)) not between 2 and 100 then
    raise exception 'INVALID_TERMINATION' using errcode = '22023';
  end if;

  select * into v_match
  from public.chess_matches
  where id = p_match_id
  for update;
  if not found then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_match.status = 'completed' then
    if v_match.result <> p_result
      or v_match.verification_reference <> trim(p_verification_reference) then
      raise exception 'FINALIZATION_CONFLICT' using errcode = '55000';
    end if;
    if v_match.rated then
      select rating into v_white_after
      from public.chess_player_ratings
      where season_id = v_match.season_id and user_id = v_match.white_player_id;
      select rating into v_black_after
      from public.chess_player_ratings
      where season_id = v_match.season_id and user_id = v_match.black_player_id;
    end if;
    return query select false, v_white_after, v_black_after;
    return;
  end if;
  if v_match.status <> 'active'
    or v_match.white_player_id is null
    or v_match.black_player_id is null then
    raise exception 'MATCH_NOT_FINALIZABLE' using errcode = '55000';
  end if;

  v_white_score := case p_result when '1-0' then 1 when '0-1' then 0 else 0.5 end;
  v_black_score := 1 - v_white_score;
  v_white_outcome := case when v_white_score = 1 then 'win'
    when v_white_score = 0 then 'loss' else 'draw' end;
  v_black_outcome := case when v_black_score = 1 then 'win'
    when v_black_score = 0 then 'loss' else 'draw' end;

  if v_match.rated then
    select * into v_season
    from public.chess_rating_seasons
    where id = v_match.season_id
    for update;
    if not found then
      raise exception 'RATING_SEASON_NOT_FOUND' using errcode = 'P0002';
    end if;

    insert into public.chess_player_ratings (
      season_id, user_id, rating, peak_rating
    ) values
      (v_season.id, v_match.white_player_id, v_season.initial_rating, v_season.initial_rating),
      (v_season.id, v_match.black_player_id, v_season.initial_rating, v_season.initial_rating)
    on conflict (season_id, user_id) do nothing;

    perform 1 from public.chess_player_ratings rating_row
    where rating_row.season_id = v_season.id
      and rating_row.user_id in (v_match.white_player_id, v_match.black_player_id)
    order by rating_row.user_id
    for update;
    select * into v_white from public.chess_player_ratings
    where season_id = v_season.id and user_id = v_match.white_player_id;
    select * into v_black from public.chess_player_ratings
    where season_id = v_season.id and user_id = v_match.black_player_id;

    v_white_expected := 1 / (
      1 + power(10::numeric, (v_black.rating - v_white.rating)::numeric / 400)
    );
    v_black_expected := 1 - v_white_expected;
    v_white_after := greatest(
      v_season.rating_floor,
      round(v_white.rating + v_season.k_factor * (v_white_score - v_white_expected))::integer
    );
    v_black_after := greatest(
      v_season.rating_floor,
      round(v_black.rating + v_season.k_factor * (v_black_score - v_black_expected))::integer
    );

    update public.chess_player_ratings
    set rating = v_white_after,
        peak_rating = greatest(peak_rating, v_white_after),
        games_played = games_played + 1,
        wins = wins + case when v_white_score = 1 then 1 else 0 end,
        draws = draws + case when v_white_score = 0.5 then 1 else 0 end,
        losses = losses + case when v_white_score = 0 then 1 else 0 end,
        provisional = games_played + 1 < 10
    where season_id = v_season.id and user_id = v_match.white_player_id;
    update public.chess_player_ratings
    set rating = v_black_after,
        peak_rating = greatest(peak_rating, v_black_after),
        games_played = games_played + 1,
        wins = wins + case when v_black_score = 1 then 1 else 0 end,
        draws = draws + case when v_black_score = 0.5 then 1 else 0 end,
        losses = losses + case when v_black_score = 0 then 1 else 0 end,
        provisional = games_played + 1 < 10
    where season_id = v_season.id and user_id = v_match.black_player_id;

    insert into public.chess_rating_history (
      season_id, user_id, match_id, rating_before, rating_after, delta,
      expected_score, actual_score
    ) values
      (
        v_season.id, v_match.white_player_id, v_match.id, v_white.rating,
        v_white_after, v_white_after - v_white.rating,
        v_white_expected, v_white_score
      ),
      (
        v_season.id, v_match.black_player_id, v_match.id, v_black.rating,
        v_black_after, v_black_after - v_black.rating,
        v_black_expected, v_black_score
      );
  end if;

  v_event_revision := v_match.revision + 1;
  update public.chess_matches
  set status = 'completed',
      result = p_result,
      termination = left(trim(p_termination), 100),
      revision = v_event_revision,
      ended_at = now(),
      verification_status = 'verified',
      verification_reference = trim(p_verification_reference),
      verified_at = now(),
      rating_processed_at = case when rated then now() else null end
  where id = v_match.id;
  update public.chess_rooms
  set status = 'completed', closed_at = now(), revision = revision + 1
  where id = v_match.room_id;
  insert into public.chess_match_events (
    match_id, revision, event_type, payload
  ) values (
    v_match.id,
    v_event_revision,
    'match_verified',
    jsonb_build_object(
      'result', p_result,
      'termination', left(trim(p_termination), 100),
      'verificationReference', trim(p_verification_reference),
      'rated', v_match.rated,
      'whiteRating', v_white_after,
      'blackRating', v_black_after
    )
  );

  perform public.apply_verified_game_progress_internal(
    v_match.white_player_id, v_white_outcome, v_match.id
  );
  perform public.apply_verified_game_progress_internal(
    v_match.black_player_id, v_black_outcome, v_match.id
  );
  return query select true, v_white_after, v_black_after;
end;
$$;

revoke all on function public.finalize_chess_match_server(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.finalize_chess_match_server(
  uuid, text, text, text
) to service_role;

create or replace function public.get_chess_leaderboard(
  p_season_id uuid default null,
  p_limit integer default 100
)
returns table (
  rank bigint,
  user_id uuid,
  rating integer,
  games_played integer,
  wins integer,
  draws integer,
  losses integer,
  provisional boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_season_id uuid := p_season_id;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if v_season_id is null then
    select season_row.id into v_season_id
    from public.chess_rating_seasons season_row
    where season_row.status in ('active', 'completed')
    order by (season_row.status = 'active') desc, season_row.ends_at desc
    limit 1;
  end if;
  if v_season_id is null then
    return;
  end if;
  return query
  select row_number() over (
      order by rating_row.rating desc, rating_row.games_played desc,
        rating_row.user_id
    ),
    rating_row.user_id, rating_row.rating, rating_row.games_played,
    rating_row.wins, rating_row.draws, rating_row.losses,
    rating_row.provisional
  from public.chess_player_ratings rating_row
  where rating_row.season_id = v_season_id
  order by rating_row.rating desc, rating_row.games_played desc,
    rating_row.user_id
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

revoke all on function public.get_chess_leaderboard(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_chess_leaderboard(uuid, integer)
  to authenticated;

create or replace function public.claim_chess_quest(
  p_quest_id uuid
)
returns table (
  claimed boolean,
  xp_reward integer,
  badge_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_player_quest public.chess_player_quests%rowtype;
  v_quest public.chess_quests%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into v_player_quest
  from public.chess_player_quests
  where user_id = v_user_id and quest_id = p_quest_id
  for update;
  if not found or v_player_quest.completed_at is null then
    raise exception 'QUEST_NOT_COMPLETED' using errcode = '55000';
  end if;
  select * into v_quest from public.chess_quests where id = p_quest_id;
  if v_player_quest.claimed_at is not null then
    return query select false, v_quest.xp_reward, v_quest.badge_id;
    return;
  end if;
  update public.chess_player_quests set claimed_at = now()
  where user_id = v_user_id and quest_id = p_quest_id;
  if v_quest.xp_reward > 0 then
    perform public.grant_chess_xp_internal(
      v_user_id, v_quest.xp_reward, 'quest', v_quest.id,
      jsonb_build_object('questSlug', v_quest.slug)
    );
  end if;
  if v_quest.badge_id is not null then
    insert into public.chess_player_badges (
      user_id, badge_id, source_type, source_id
    ) values (v_user_id, v_quest.badge_id, 'quest', v_quest.id)
    on conflict (user_id, badge_id) do nothing;
  end if;
  return query select true, v_quest.xp_reward, v_quest.badge_id;
end;
$$;

revoke all on function public.claim_chess_quest(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_chess_quest(uuid)
  to authenticated;

create or replace function public.get_daily_chess_puzzle(
  p_date date default current_date
)
returns table (
  available boolean,
  puzzle_id uuid,
  puzzle_date date,
  title text,
  fen text,
  themes text[],
  rating integer,
  attempt_status text,
  attempt_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.chess_daily_puzzles puzzle_row
    where puzzle_row.puzzle_date = p_date and puzzle_row.published
  ) then
    return query
    select true, puzzle_row.id, puzzle_row.puzzle_date, puzzle_row.title,
      puzzle_row.fen, puzzle_row.themes, puzzle_row.rating,
      attempt_row.status, coalesce(attempt_row.attempt_count, 0)
    from public.chess_daily_puzzles puzzle_row
    left join public.chess_puzzle_attempts attempt_row
      on attempt_row.puzzle_id = puzzle_row.id
      and attempt_row.user_id = v_user_id
    where puzzle_row.puzzle_date = p_date and puzzle_row.published;
  else
    -- Explicit empty state: callers never need to invent a placeholder puzzle.
    return query select false, null::uuid, p_date, null::text, null::text,
      '{}'::text[], null::integer, null::text, 0;
  end if;
end;
$$;

revoke all on function public.get_daily_chess_puzzle(date)
  from public, anon, authenticated;
grant execute on function public.get_daily_chess_puzzle(date)
  to authenticated;

create or replace function public.submit_daily_chess_puzzle(
  p_puzzle_id uuid,
  p_moves text[],
  p_duration_ms integer default null
)
returns table (
  solved boolean,
  attempt_status text,
  attempt_count integer,
  xp_awarded integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_puzzle public.chess_daily_puzzles%rowtype;
  v_attempt public.chess_puzzle_attempts%rowtype;
  v_moves text[];
  v_solution text[];
  v_solved boolean;
  v_xp_inserted boolean;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_moves), 0) not between 1 and 64
    or p_duration_ms is not null and p_duration_ms not between 0 and 86400000 then
    raise exception 'INVALID_PUZZLE_ATTEMPT' using errcode = '22023';
  end if;

  select * into v_puzzle
  from public.chess_daily_puzzles
  where id = p_puzzle_id and published and puzzle_date <= current_date
  for share;
  if not found then
    raise exception 'PUZZLE_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  select array_agg(lower(trim(move_value)) order by ordinal)
    into v_moves
  from unnest(p_moves) with ordinality as submitted(move_value, ordinal);
  select array_agg(lower(trim(move_value)) order by ordinal)
    into v_solution
  from unnest(v_puzzle.solution_moves)
    with ordinality as expected(move_value, ordinal);
  if exists (
    select 1 from unnest(v_moves) as move_value
    where move_value !~ '^[a-z0-9][a-z0-9=+#x@:_-]{1,31}$'
  ) then
    raise exception 'INVALID_PUZZLE_MOVE_NOTATION' using errcode = '22023';
  end if;

  insert into public.chess_puzzle_attempts (puzzle_id, user_id)
  values (p_puzzle_id, v_user_id)
  on conflict (puzzle_id, user_id) do nothing;
  select * into v_attempt
  from public.chess_puzzle_attempts
  where puzzle_id = p_puzzle_id and user_id = v_user_id
  for update;
  if v_attempt.status = 'solved' then
    return query select true, 'solved'::text, v_attempt.attempt_count, 0;
    return;
  end if;
  if v_attempt.attempt_count >= 20 then
    return query select false, 'failed'::text, v_attempt.attempt_count, 0;
    return;
  end if;

  v_solved := v_moves = v_solution;
  update public.chess_puzzle_attempts as attempt_row
  set attempt_count = attempt_row.attempt_count + 1,
      submitted_line = v_moves,
      duration_ms = coalesce(p_duration_ms, attempt_row.duration_ms),
      last_attempt_at = now(),
      status = case
        when v_solved then 'solved'
        when attempt_row.attempt_count + 1 >= 20 then 'failed'
        else 'started'
      end,
      solved_at = case when v_solved then now() else attempt_row.solved_at end
  where attempt_row.id = v_attempt.id
  returning * into v_attempt;

  if v_solved then
    v_xp_inserted := public.grant_chess_xp_internal(
      v_user_id,
      30,
      'puzzle',
      v_puzzle.id,
      jsonb_build_object(
        'puzzleDate', v_puzzle.puzzle_date,
        'attemptCount', v_attempt.attempt_count
      )
    );
    if v_xp_inserted then
      insert into public.chess_player_progress (user_id, puzzles_solved)
      values (v_user_id, 1)
      on conflict (user_id) do update
      set puzzles_solved = public.chess_player_progress.puzzles_solved + 1,
          last_activity_on = current_date;
      perform public.award_chess_badge_internal(
        v_user_id, 'first-puzzle', 'puzzle', v_puzzle.id
      );
      perform public.advance_chess_quests_internal(
        v_user_id, 'puzzles_solved', 1
      );
    end if;
  end if;

  return query select v_solved, v_attempt.status, v_attempt.attempt_count,
    case when v_xp_inserted then 30 else 0 end;
end;
$$;

revoke all on function public.submit_daily_chess_puzzle(
  uuid, text[], integer
) from public, anon, authenticated;
grant execute on function public.submit_daily_chess_puzzle(
  uuid, text[], integer
) to authenticated;

create or replace function public.cleanup_chess_matchmaking_server()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
begin
  update public.chess_matchmaking_tickets
  set status = 'expired'
  where status = 'queued' and expires_at <= clock_timestamp();
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

revoke all on function public.cleanup_chess_matchmaking_server()
  from public, anon, authenticated;
grant execute on function public.cleanup_chess_matchmaking_server()
  to service_role;

-- Supabase Realtime is enabled only when its publication exists. The guard
-- keeps local/plain Postgres validation idempotent.
do $realtime$
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
      if not exists (
        select 1
        from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format(
          'alter publication supabase_realtime add table public.%I',
          v_table
        );
      end if;
    end loop;
  end if;
end;
$realtime$;

notify pgrst, 'reload schema';

commit;
