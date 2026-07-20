begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.rule_compilations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  prompt_hash text not null,
  model text not null,
  status text not null
    check (status in ('processing', 'validated', 'rejected', 'published', 'failed')),
  blueprint jsonb not null default '{}'::jsonb,
  compiled_rule jsonb,
  diagnostics jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  content_hash text,
  request_key uuid not null,
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  published_at timestamptz,
  unique (user_id, request_key),
  constraint rule_compilations_content_hash_required
    check (
      status in ('processing', 'rejected', 'failed')
      or content_hash is not null
    )
);

create table if not exists public.rule_blueprints (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  rule_key text not null
    check (rule_key ~ '^[a-z][a-z0-9-]{2,49}$'),
  title text not null check (char_length(title) between 3 and 100),
  description text not null check (char_length(description) between 10 and 600),
  category text not null,
  tags text[] not null default '{}'::text[],
  visibility text not null default 'private'
    check (visibility in ('private', 'unlisted', 'public')),
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, rule_key)
);

create table if not exists public.rule_versions (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null
    references public.rule_blueprints(id) on delete restrict,
  compilation_id uuid not null unique
    references public.rule_compilations(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  schema_version text not null,
  engine_version text not null,
  legacy_rule_id text not null unique,
  blueprint_json jsonb not null,
  rule_json jsonb not null,
  content_hash text not null,
  visibility text not null default 'private'
    check (visibility in ('private', 'unlisted', 'public')),
  validation jsonb not null default '{}'::jsonb,
  balance_score integer not null default 0
    check (balance_score between 0 and 100),
  created_by uuid not null references auth.users(id) on delete restrict,
  published_at timestamptz not null default now(),
  unique (blueprint_id, version_number),
  unique (blueprint_id, content_hash)
);

alter table public.rule_compilations
  add column published_version_id uuid
  references public.rule_versions(id) on delete restrict;

alter table public.rule_blueprints
  drop constraint if exists rule_blueprints_current_version_id_fkey;

alter table public.rule_blueprints
  add constraint rule_blueprints_current_version_id_fkey
  foreign key (current_version_id)
  references public.rule_versions(id)
  on delete restrict
  deferrable initially deferred;

alter table public.lobbies
  add column if not exists rule_set_hash text,
  add column if not exists engine_version text not null default '2.0.0',
  add column if not exists match_seed bigint,
  add column if not exists rules_locked_at timestamptz,
  add column if not exists revision bigint not null default 0,
  add column if not exists request_key uuid;

-- The historical installations do not all expose the same status set on the
-- legacy projection. In particular, production still only allowed
-- active/disabled while newer repository snapshots also use archived/draft.
-- Keep the projection private without making a private V2 rule look active in
-- older clients by accepting the union of the known legacy states.
alter table public.chess_rules
  drop constraint if exists chess_rules_status_check;

alter table public.chess_rules
  add constraint chess_rules_status_check
  check (status in ('active', 'disabled', 'archived', 'draft'));

alter table public.lobbies
  add constraint lobbies_v2_request_key_required
    check (rule_set_hash is null or request_key is not null),
  add constraint lobbies_v2_matched_seed_required
    check (
      rule_set_hash is null
      or status <> 'matched'
      or match_seed is not null
    ),
  add constraint lobbies_v2_waiting_player_seed_hidden
    check (
      rule_set_hash is null
      or mode <> 'player'
      or status <> 'waiting'
      or match_seed is null
    );

create table if not exists public.lobby_rule_versions (
  lobby_id uuid not null
    references public.lobbies(id) on delete cascade,
  rule_version_id uuid not null
    references public.rule_versions(id) on delete restrict,
  ordinal smallint not null check (ordinal between 1 and 8),
  primary key (lobby_id, rule_version_id),
  unique (lobby_id, ordinal)
);

create table if not exists public.rule_compile_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rule_compilations_user_created
  on public.rule_compilations(user_id, created_at desc);

create index if not exists idx_rule_compilations_expires
  on public.rule_compilations(expires_at)
  where status in ('processing', 'validated', 'rejected', 'failed');

create unique index if not exists idx_lobbies_v2_creator_request_key
  on public.lobbies(creator_id, request_key)
  where request_key is not null and rule_set_hash is not null;

create index if not exists idx_rule_blueprints_owner
  on public.rule_blueprints(owner_id, updated_at desc);

create index if not exists idx_rule_blueprints_public
  on public.rule_blueprints(updated_at desc)
  where visibility = 'public';

create index if not exists idx_rule_versions_blueprint
  on public.rule_versions(blueprint_id, version_number desc);

create index if not exists idx_rule_versions_hash
  on public.rule_versions(content_hash);

create index if not exists idx_lobbies_rule_set_hash
  on public.lobbies(rule_set_hash)
  where rule_set_hash is not null;

create index if not exists idx_lobbies_v2_waiting
  on public.lobbies(created_at desc)
  where rule_set_hash is not null and status = 'waiting';

alter table public.rule_compilations enable row level security;
alter table public.rule_blueprints enable row level security;
alter table public.rule_versions enable row level security;
alter table public.lobby_rule_versions enable row level security;
alter table public.rule_compile_rate_limits enable row level security;

create or replace function public.can_read_rule_version(
  p_version_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rule_versions rv
    join public.rule_blueprints rb on rb.id = rv.blueprint_id
    where rv.id = p_version_id
      and (
        rv.visibility = 'public'
        or rb.owner_id = auth.uid()
        or exists (
          select 1
          from public.lobby_rule_versions lrv
          join public.lobbies l on l.id = lrv.lobby_id
          where lrv.rule_version_id = rv.id
            and (
              l.creator_id = auth.uid()
              or l.opponent_id = auth.uid()
            )
        )
      )
  );
$$;

create or replace function public.can_read_rule_blueprint(
  p_blueprint_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rule_blueprints rb
    where rb.id = p_blueprint_id
      and (
        rb.visibility = 'public'
        or rb.owner_id = auth.uid()
        or exists (
          select 1
          from public.rule_versions rv
          join public.lobby_rule_versions lrv
            on lrv.rule_version_id = rv.id
          join public.lobbies l
            on l.id = lrv.lobby_id
          where rv.blueprint_id = rb.id
            and (
              l.creator_id = auth.uid()
              or l.opponent_id = auth.uid()
            )
        )
      )
  );
$$;

drop policy if exists "Owners read compilations" on public.rule_compilations;
create policy "Owners read compilations"
  on public.rule_compilations for select
  to authenticated
  using (
    user_id = auth.uid()
    and expires_at > now()
  );

drop policy if exists "Readers access blueprints" on public.rule_blueprints;
create policy "Readers access blueprints"
  on public.rule_blueprints for select
  to authenticated
  using (public.can_read_rule_blueprint(id));

drop policy if exists "Readers access rule versions" on public.rule_versions;
create policy "Readers access rule versions"
  on public.rule_versions for select
  to authenticated
  using (public.can_read_rule_version(id));

drop policy if exists "Readers access lobby versions" on public.lobby_rule_versions;
create policy "Readers access lobby versions"
  on public.lobby_rule_versions for select
  to authenticated
  using (
    exists (
      select 1
      from public.lobbies l
      where l.id = lobby_id
        and (
          l.creator_id = auth.uid()
          or l.opponent_id = auth.uid()
        )
    )
  );

revoke all on public.rule_compilations from anon, authenticated;
revoke all on public.rule_blueprints from anon, authenticated;
revoke all on public.rule_versions from anon, authenticated;
revoke all on public.lobby_rule_versions from anon, authenticated;
revoke all on public.rule_compile_rate_limits from anon, authenticated;

grant select on public.rule_compilations to authenticated;
grant select on public.rule_blueprints to authenticated;
grant select on public.rule_versions to authenticated;
grant select on public.lobby_rule_versions to authenticated;

-- Les lobbies historiques restent modifiables par le client.
-- Les lobbies V2 (rule_set_hash non nul) passent exclusivement par les RPC.
-- Some production snapshots contain this additional permissive SELECT policy.
-- Leaving it in place would make every V2 lobby readable despite the policy
-- below because permissive RLS policies are combined with OR.
drop policy if exists lobbies_read_all on public.lobbies;

drop policy if exists "Users can view all lobbies" on public.lobbies;
create policy "Users can view allowed lobbies"
  on public.lobbies for select
  using (
    rule_set_hash is null
    or creator_id = auth.uid()
    or opponent_id = auth.uid()
  );

drop policy if exists "Users can create lobbies" on public.lobbies;
create policy "Users can create legacy lobbies"
  on public.lobbies for insert
  to authenticated
  with check (
    auth.uid() = creator_id
    and rule_set_hash is null
  );

drop policy if exists "Creators can update their lobbies" on public.lobbies;
drop policy if exists "Creators manage their lobbies" on public.lobbies;
create policy "Creators manage legacy lobbies"
  on public.lobbies for update
  to authenticated
  using (
    auth.uid() = creator_id
    and rule_set_hash is null
  )
  with check (
    auth.uid() = creator_id
    and rule_set_hash is null
  );

drop policy if exists "Players can join waiting lobbies" on public.lobbies;
create policy "Players join legacy waiting lobbies"
  on public.lobbies for update
  to authenticated
  using (
    rule_set_hash is null
    and status = 'waiting'
    and mode = 'player'
  )
  with check (
    rule_set_hash is null
    and status = 'matched'
    and is_active = false
    and opponent_id = auth.uid()
  );

drop policy if exists "Creators can delete their lobbies" on public.lobbies;
create policy "Creators delete legacy lobbies"
  on public.lobbies for delete
  to authenticated
  using (
    auth.uid() = creator_id
    and rule_set_hash is null
  );

-- A legacy join still uses a direct UPDATE from the historical client. RLS can
-- constrain the resulting row, but cannot by itself prevent the joiner from
-- replacing unrelated columns in the same statement. This trigger narrows a
-- non-creator update to the four matchmaking fields only.
create or replace function public.protect_legacy_lobby_join_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role'
    or old.rule_set_hash is not null
    or old.creator_id = auth.uid() then
    return new;
  end if;

  if auth.uid() is null
    or old.status <> 'waiting'
    or old.mode <> 'player'
    or new.opponent_id is distinct from auth.uid()
    or new.status <> 'matched'
    or new.is_active is distinct from false
    or char_length(coalesce(new.opponent_name, '')) > 80
    or (
      to_jsonb(new)
        - 'opponent_id'
        - 'opponent_name'
        - 'status'
        - 'is_active'
        - 'updated_at'
    ) is distinct from (
      to_jsonb(old)
        - 'opponent_id'
        - 'opponent_name'
        - 'status'
        - 'is_active'
        - 'updated_at'
    ) then
    raise exception 'LEGACY_LOBBY_JOIN_FIELDS_FORBIDDEN'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists lobbies_protect_legacy_join_update
  on public.lobbies;
create trigger lobbies_protect_legacy_join_update
before update on public.lobbies
for each row execute function public.protect_legacy_lobby_join_update();

revoke all on function public.protect_legacy_lobby_join_update()
  from public, anon, authenticated;

create or replace function public.reject_rule_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'RULE_VERSION_IMMUTABLE'
    using errcode = '55000';
end;
$$;

drop trigger if exists rule_versions_immutable_update
  on public.rule_versions;
create trigger rule_versions_immutable_update
before update on public.rule_versions
for each row execute function public.reject_rule_version_mutation();

drop trigger if exists rule_versions_immutable_delete
  on public.rule_versions;
create trigger rule_versions_immutable_delete
before delete on public.rule_versions
for each row execute function public.reject_rule_version_mutation();

revoke all on function public.reject_rule_version_mutation()
  from public, anon, authenticated;


create or replace function public.protect_versioned_chess_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_rule_architect_version boolean;
  v_targets_rule_architect_version boolean;
begin
  if tg_op = 'INSERT' then
    select exists (
      select 1
      from public.rule_versions rv
      where rv.legacy_rule_id = new.rule_id
    ) into v_targets_rule_architect_version;

    if v_targets_rule_architect_version
      and not exists (
        select 1
        from public.rule_versions rv
        where rv.legacy_rule_id = new.rule_id
          and rv.rule_json = new.rule_json
          and rv.created_by = new.created_by
      ) then
      raise exception 'VERSIONED_RULE_PROJECTION_MISMATCH'
        using errcode = '55000';
    end if;
    return new;
  end if;

  select exists (
    select 1
    from public.rule_versions rv
    where rv.legacy_rule_id = old.rule_id
  ) into v_is_rule_architect_version;

  if tg_op = 'UPDATE' then
    select exists (
      select 1
      from public.rule_versions rv
      where rv.legacy_rule_id = new.rule_id
    ) into v_targets_rule_architect_version;

    if not v_is_rule_architect_version
      and v_targets_rule_architect_version then
      raise exception 'VERSIONED_RULE_IMMUTABLE'
        using errcode = '55000';
    end if;
  end if;

  if not v_is_rule_architect_version then
    return case
      when tg_op = 'DELETE' then old
      else new
    end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'VERSIONED_RULE_IMMUTABLE'
      using errcode = '55000';
  end if;

  if (
    to_jsonb(new)
      - 'usage_count'
      - 'updated_at'
  ) is distinct from (
    to_jsonb(old)
      - 'usage_count'
      - 'updated_at'
  ) then
    raise exception 'VERSIONED_RULE_IMMUTABLE'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists chess_rules_protect_versioned_insert
  on public.chess_rules;
create trigger chess_rules_protect_versioned_insert
before insert on public.chess_rules
for each row execute function public.protect_versioned_chess_rule();

drop trigger if exists chess_rules_protect_versioned_update
  on public.chess_rules;
create trigger chess_rules_protect_versioned_update
before update on public.chess_rules
for each row execute function public.protect_versioned_chess_rule();

drop trigger if exists chess_rules_protect_versioned_delete
  on public.chess_rules;
create trigger chess_rules_protect_versioned_delete
before delete on public.chess_rules
for each row execute function public.protect_versioned_chess_rule();

revoke all on function public.protect_versioned_chess_rule()
  from public, anon, authenticated;

create or replace function public.consume_rule_compile_quota(
  p_limit integer default 12,
  p_window_minutes integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.rule_compile_rate_limits%rowtype;
  v_now timestamptz := clock_timestamp();
  -- Callers may make their own quota stricter, never weaker than 12/hour.
  v_limit integer := least(coalesce(p_limit, 12), 12);
  v_window_minutes integer := least(
    greatest(coalesce(p_window_minutes, 60), 60),
    10080
  );
begin
  if v_user_id is null or v_limit < 1 then
    return false;
  end if;

  -- Materialize the row first so concurrent first requests lock the same row.
  insert into public.rule_compile_rate_limits (
    user_id,
    window_start,
    request_count,
    updated_at
  )
  values (
    v_user_id,
    v_now,
    0,
    v_now
  )
  on conflict (user_id) do nothing;

  select *
    into v_row
  from public.rule_compile_rate_limits
  where user_id = v_user_id
  for update;

  if v_row.window_start
      <= v_now - make_interval(mins => v_window_minutes) then
    update public.rule_compile_rate_limits
    set window_start = v_now,
        request_count = 1,
        updated_at = v_now
    where user_id = v_user_id;
    return true;
  end if;

  if v_row.request_count >= v_limit then
    return false;
  end if;

  update public.rule_compile_rate_limits
  set request_count = request_count + 1,
      updated_at = v_now
  where user_id = v_user_id;

  return true;
end;
$$;

revoke all on function public.consume_rule_compile_quota(integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rule_compile_quota(integer, integer)
  to authenticated;

create or replace function public.publish_rule_compilation_v2(
  p_compilation_id uuid,
  p_visibility text default 'unlisted'
)
returns table (
  blueprint_id uuid,
  version_id uuid,
  version_number integer,
  legacy_rule_id text,
  content_hash text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_comp public.rule_compilations%rowtype;
  v_blueprint_id uuid;
  v_version_id uuid;
  v_version_number integer;
  v_legacy_rule_id text;
  v_rule_json jsonb;
  v_priority integer;
  v_tags text[];
  v_pieces text[];
  v_existing public.rule_versions%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED'
      using errcode = '42501';
  end if;

  if p_visibility not in ('private', 'unlisted', 'public') then
    raise exception 'INVALID_VISIBILITY'
      using errcode = '22023';
  end if;

  select *
    into v_comp
  from public.rule_compilations
  where id = p_compilation_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'COMPILATION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_comp.published_version_id is not null then
    select *
      into v_existing
    from public.rule_versions
    where id = v_comp.published_version_id;

    if found then
      if v_existing.visibility <> p_visibility then
        raise exception 'VERSION_VISIBILITY_IMMUTABLE'
          using errcode = '55000';
      end if;

      return query
      select
        v_existing.blueprint_id,
        v_existing.id,
        v_existing.version_number,
        v_existing.legacy_rule_id,
        v_existing.content_hash;
      return;
    end if;
  end if;

  select *
    into v_existing
  from public.rule_versions
  where compilation_id = p_compilation_id;

  if found then
    if v_existing.visibility <> p_visibility then
      raise exception 'VERSION_VISIBILITY_IMMUTABLE'
        using errcode = '55000';
    end if;

    update public.rule_compilations
    set status = 'published',
        published_version_id = v_existing.id,
        published_at = coalesce(published_at, now()),
        prompt = '[redacted after publication]',
        updated_at = now()
    where id = p_compilation_id;

    return query
    select
      v_existing.blueprint_id,
      v_existing.id,
      v_existing.version_number,
      v_existing.legacy_rule_id,
      v_existing.content_hash;
    return;
  end if;

  if v_comp.status <> 'validated'
    or v_comp.compiled_rule is null
    or v_comp.content_hash is null then
    raise exception 'COMPILATION_NOT_PUBLISHABLE'
      using errcode = '55000';
  end if;

  if v_comp.expires_at <= now() then
    raise exception 'COMPILATION_EXPIRED'
      using errcode = '55000';
  end if;

  insert into public.rule_blueprints (
    owner_id,
    rule_key,
    title,
    description,
    category,
    tags,
    visibility
  )
  values (
    v_user_id,
    v_comp.blueprint ->> 'ruleKey',
    v_comp.blueprint ->> 'title',
    v_comp.blueprint ->> 'summary',
    v_comp.blueprint ->> 'category',
    coalesce(
      array(
        select jsonb_array_elements_text(
          coalesce(v_comp.blueprint -> 'tags', '[]'::jsonb)
        )
      ),
      '{}'::text[]
    ),
    p_visibility
  )
  on conflict (owner_id, rule_key)
  do update set
    title = excluded.title,
    description = excluded.description,
    category = excluded.category,
    tags = excluded.tags,
    updated_at = now()
  returning id into v_blueprint_id;


perform 1
from public.rule_blueprints
where id = v_blueprint_id
for update;

select *
  into v_existing
from public.rule_versions rv
where rv.blueprint_id = v_blueprint_id
  and rv.content_hash = v_comp.content_hash
limit 1;

if found then
  if v_existing.visibility <> p_visibility then
    raise exception 'IDENTICAL_VERSION_VISIBILITY_CONFLICT'
      using errcode = '55000';
  end if;

  update public.rule_compilations
  set status = 'published',
      published_version_id = v_existing.id,
      published_at = now(),
      prompt = '[redacted after publication]',
      updated_at = now(),
      metrics = coalesce(metrics, '{}'::jsonb)
        || jsonb_build_object(
          'publicationNote',
          'DEDUPLICATED_PUBLICATION'
        )
  where id = p_compilation_id;

  update public.rule_blueprints
  set current_version_id = v_existing.id,
      visibility = v_existing.visibility,
      updated_at = now()
  where id = v_blueprint_id;

  return query
  select
    v_existing.blueprint_id,
    v_existing.id,
    v_existing.version_number,
    v_existing.legacy_rule_id,
    v_existing.content_hash;
  return;
end if;

select coalesce(max(rv.version_number), 0) + 1
    into v_version_number
  from public.rule_versions rv
  where rv.blueprint_id = v_blueprint_id;

  v_legacy_rule_id :=
    (v_comp.blueprint ->> 'ruleKey')
    || '-'
    || replace(v_blueprint_id::text, '-', '')
    || '@v'
    || v_version_number::text;

  v_rule_json := jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          v_comp.compiled_rule,
          '{meta,ruleId}',
          to_jsonb(v_legacy_rule_id),
          true
        ),
        '{meta,ruleName}',
        to_jsonb(v_comp.blueprint ->> 'title'),
        true
      ),
      '{meta,isActive}',
      'true'::jsonb,
      true
    ),
    '{createdAt}',
    to_jsonb(now()::text),
    true
  );

  select coalesce(
    max((trigger_item ->> 'priority')::integer),
    1
  )
  into v_priority
  from jsonb_array_elements(
    coalesce(v_comp.blueprint -> 'triggers', '[]'::jsonb)
  ) as trigger_item;

  v_tags := coalesce(
    array(
      select jsonb_array_elements_text(
        coalesce(v_comp.blueprint -> 'tags', '[]'::jsonb)
      )
    ),
    '{}'::text[]
  );

  v_pieces := coalesce(
    array(
      select jsonb_array_elements_text(
        coalesce(v_comp.blueprint -> 'affectedPieces', '[]'::jsonb)
      )
    ),
    '{}'::text[]
  );

  insert into public.rule_versions (
    blueprint_id,
    compilation_id,
    version_number,
    schema_version,
    engine_version,
    legacy_rule_id,
    blueprint_json,
    rule_json,
    content_hash,
    visibility,
    validation,
    balance_score,
    created_by
  )
  values (
    v_blueprint_id,
    p_compilation_id,
    v_version_number,
    coalesce(v_comp.blueprint ->> 'schemaVersion', '2.0.0'),
    '2.0.0',
    v_legacy_rule_id,
    v_comp.blueprint,
    v_rule_json,
    v_comp.content_hash,
    p_visibility,
    jsonb_build_object(
      'diagnostics', v_comp.diagnostics,
      'metrics', v_comp.metrics
    ),
    coalesce(
      (v_comp.metrics ->> 'balanceScore')::integer,
      0
    ),
    v_user_id
  )
  returning id into v_version_id;

  update public.rule_blueprints
  set current_version_id = v_version_id,
      visibility = p_visibility,
      updated_at = now()
  where id = v_blueprint_id;

  insert into public.chess_rules (
    rule_id,
    rule_name,
    description,
    category,
    rule_json,
    source,
    status,
    is_functional,
    created_by,
    tags,
    affected_pieces,
    priority,
    assets,
    prompt,
    prompt_key,
    ai_model,
    generation_duration_ms,
    complexity_level,
    validation_notes
  )
  values (
    v_legacy_rule_id,
    v_comp.blueprint ->> 'title',
    v_comp.blueprint ->> 'summary',
    v_comp.blueprint ->> 'category',
    v_rule_json,
    'ai_generated',
    case
      when p_visibility = 'public' then 'active'
      else 'draft'
    end,
    true,
    v_user_id,
    v_tags,
    v_pieces,
    v_priority,
    null,
    null,
    encode(
      extensions.digest(
        convert_to(
          v_user_id::text
          || ':' || v_comp.prompt_hash
          || ':' || v_comp.content_hash,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ),
    v_comp.model,
    case
      when v_comp.metrics ? 'generationDurationMs'
      then (v_comp.metrics ->> 'generationDurationMs')::integer
      else null
    end,
    v_comp.metrics ->> 'complexity',
    left(v_comp.diagnostics::text, 5000)
  );

  update public.rule_compilations
  set status = 'published',
      published_version_id = v_version_id,
      published_at = now(),
      prompt = '[redacted after publication]',
      updated_at = now()
  where id = p_compilation_id;

  return query
  select
    v_blueprint_id,
    v_version_id,
    v_version_number,
    v_legacy_rule_id,
    v_comp.content_hash;
end;
$$;

revoke all on function public.publish_rule_compilation_v2(uuid, text)
  from public, anon, authenticated;
grant execute on function public.publish_rule_compilation_v2(uuid, text)
  to authenticated;

create or replace function public.create_rule_lobby_v2(
  p_name text,
  p_rule_version_ids uuid[],
  p_request_key uuid,
  p_mode text default 'player'
)
returns table (
  lobby_id uuid,
  ruleset_hash text,
  match_seed bigint,
  legacy_rule_ids text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_lobby_id uuid;
  v_ruleset_hash text;
  v_match_seed bigint;
  v_legacy_rule_ids text[];
  v_hash_material text;
  v_requested integer;
  v_accessible integer;
  v_existing public.lobbies%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED'
      using errcode = '42501';
  end if;

  if p_name is null
    or char_length(trim(p_name)) not between 3 and 80 then
    raise exception 'INVALID_LOBBY_NAME'
      using errcode = '22023';
  end if;

  if p_mode not in ('player', 'ai') then
    raise exception 'INVALID_LOBBY_MODE'
      using errcode = '22023';
  end if;

  if p_request_key is null then
    raise exception 'REQUEST_KEY_REQUIRED'
      using errcode = '22023';
  end if;

  v_requested := coalesce(cardinality(p_rule_version_ids), 0);
  if v_requested not between 1 and 8 then
    raise exception 'INVALID_RULE_COUNT'
      using errcode = '22023';
  end if;

  if (
    select count(distinct value)
    from unnest(p_rule_version_ids) as value
  ) <> v_requested then
    raise exception 'DUPLICATE_RULE_VERSION'
      using errcode = '22023';
  end if;

  select *
    into v_existing
  from public.lobbies
  where creator_id = v_user_id
    and request_key = p_request_key
    and rule_set_hash is not null
  for update;

  if found then
    if v_existing.name <> trim(p_name)
      or v_existing.mode <> p_mode
      or coalesce(
        v_existing.game_state -> 'ruleVersionIds',
        '[]'::jsonb
      ) <> to_jsonb(p_rule_version_ids) then
      raise exception 'IDEMPOTENCY_KEY_REUSED'
        using errcode = '22023';
    end if;

    return query
    select
      v_existing.id,
      v_existing.rule_set_hash,
      case
        when v_existing.mode = 'ai'
          or v_existing.status = 'matched'
        then v_existing.match_seed
        else null
      end,
      v_existing.active_rules;
    return;
  end if;

  select count(*)
    into v_accessible
  from unnest(p_rule_version_ids) as requested(version_id)
  where public.can_read_rule_version(requested.version_id);

  if v_accessible <> v_requested then
    raise exception 'RULE_VERSION_NOT_ACCESSIBLE'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from unnest(p_rule_version_ids) as requested(version_id)
    join public.rule_versions rv
      on rv.id = requested.version_id
    group by rv.blueprint_json ->> 'ruleKey'
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_RULE_KEY'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_rule_version_ids) as requested(version_id)
    join public.rule_versions rv
      on rv.id = requested.version_id
    group by rv.blueprint_json ->> 'stateNamespace'
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_STATE_NAMESPACE'
      using errcode = '22023';
  end if;

  select
    array_agg(rv.legacy_rule_id order by requested.ordinal),
    jsonb_agg(
      jsonb_build_array(
        requested.ordinal,
        rv.id,
        rv.content_hash,
        rv.engine_version
      )
      order by requested.ordinal
    )::text
  into
    v_legacy_rule_ids,
    v_hash_material
  from unnest(p_rule_version_ids)
    with ordinality as requested(version_id, ordinal)
  join public.rule_versions rv
    on rv.id = requested.version_id;

  v_ruleset_hash := encode(
    extensions.digest(
      convert_to(v_hash_material, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_match_seed := case
    when p_mode = 'ai' then
      ('x' || substr(
        encode(extensions.gen_random_bytes(8), 'hex'),
        1,
        13
      ))::bit(52)::bigint
    else null
  end;

  insert into public.lobbies (
    name,
    creator_id,
    active_rules,
    max_players,
    is_active,
    game_state,
    mode,
    status,
    opponent_id,
    opponent_name,
    rule_set_hash,
    engine_version,
    match_seed,
    rules_locked_at,
    revision,
    request_key
  )
  values (
    trim(p_name),
    v_user_id,
    v_legacy_rule_ids,
    2,
    p_mode = 'player',
    jsonb_build_object(
      'ruleArchitectVersion', '2.0.0',
      'ruleVersionIds', to_jsonb(p_rule_version_ids),
      'rulesetHash', v_ruleset_hash,
      'engineVersion', '2.0.0'
    ),
    p_mode,
    case when p_mode = 'ai' then 'matched' else 'waiting' end,
    null,
    case when p_mode = 'ai' then 'IA' else null end,
    v_ruleset_hash,
    '2.0.0',
    v_match_seed,
    now(),
    1,
    p_request_key
  )
  on conflict (creator_id, request_key)
    where request_key is not null
      and rule_set_hash is not null
  do nothing
  returning id into v_lobby_id;

  if v_lobby_id is null then
    select *
      into v_existing
    from public.lobbies
    where creator_id = v_user_id
      and request_key = p_request_key
      and rule_set_hash is not null;

    if not found
      or v_existing.name <> trim(p_name)
      or v_existing.mode <> p_mode
      or coalesce(
        v_existing.game_state -> 'ruleVersionIds',
        '[]'::jsonb
      ) <> to_jsonb(p_rule_version_ids) then
      raise exception 'IDEMPOTENCY_KEY_REUSED'
        using errcode = '22023';
    end if;

    return query
    select
      v_existing.id,
      v_existing.rule_set_hash,
      case
        when v_existing.mode = 'ai'
          or v_existing.status = 'matched'
        then v_existing.match_seed
        else null
      end,
      v_existing.active_rules;
    return;
  end if;

  insert into public.lobby_rule_versions (
    lobby_id,
    rule_version_id,
    ordinal
  )
  select
    v_lobby_id,
    requested.version_id,
    requested.ordinal::smallint
  from unnest(p_rule_version_ids)
    with ordinality as requested(version_id, ordinal);

  return query
  select
    v_lobby_id,
    v_ruleset_hash,
    case when p_mode = 'ai' then v_match_seed else null end,
    v_legacy_rule_ids;
end;
$$;

revoke all on function public.create_rule_lobby_v2(text, uuid[], uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_rule_lobby_v2(text, uuid[], uuid, text)
  to authenticated;

create or replace function public.join_rule_lobby_v2(
  p_lobby_id uuid,
  p_opponent_name text default null
)
returns table (
  lobby_id uuid,
  ruleset_hash text,
  match_seed bigint,
  legacy_rule_ids text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_lobby public.lobbies%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED'
      using errcode = '42501';
  end if;

  select *
    into v_lobby
  from public.lobbies
  where id = p_lobby_id
  for update;

  if not found
    or v_lobby.rule_set_hash is null
    or v_lobby.mode <> 'player' then
    raise exception 'LOBBY_NOT_AVAILABLE'
      using errcode = '40001';
  end if;

  if v_lobby.status = 'matched'
    and v_lobby.opponent_id = v_user_id then
    return query
    select
      v_lobby.id,
      v_lobby.rule_set_hash,
      v_lobby.match_seed,
      v_lobby.active_rules;
    return;
  end if;

  if v_lobby.status <> 'waiting'
    or v_lobby.opponent_id is not null
    or v_lobby.creator_id = v_user_id then
    raise exception 'LOBBY_NOT_AVAILABLE'
      using errcode = '40001';
  end if;

  update public.lobbies as target_lobby
  set opponent_id = v_user_id,
      opponent_name = nullif(left(trim(p_opponent_name), 80), ''),
      status = 'matched',
      is_active = false,
      match_seed = coalesce(
        target_lobby.match_seed,
        ('x' || substr(
          encode(extensions.gen_random_bytes(8), 'hex'),
          1,
          13
        ))::bit(52)::bigint
      ),
      revision = revision + 1,
      updated_at = now()
  where target_lobby.id = p_lobby_id
    and target_lobby.status = 'waiting'
    and target_lobby.opponent_id is null
  returning target_lobby.* into v_lobby;

  if not found then
    raise exception 'LOBBY_JOIN_RACE_LOST'
      using errcode = '40001';
  end if;

  return query
  select
    v_lobby.id,
    v_lobby.rule_set_hash,
    v_lobby.match_seed,
    v_lobby.active_rules;
end;
$$;

revoke all on function public.join_rule_lobby_v2(uuid, text)
  from public, anon, authenticated;
grant execute on function public.join_rule_lobby_v2(uuid, text)
  to authenticated;

create or replace function public.cancel_rule_lobby_v2(
  p_lobby_id uuid
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
    raise exception 'AUTH_REQUIRED'
      using errcode = '42501';
  end if;

  update public.lobbies
  set status = 'cancelled',
      is_active = false,
      revision = revision + 1,
      updated_at = now()
  where id = p_lobby_id
    and creator_id = v_user_id
    and rule_set_hash is not null
    and status in ('waiting', 'matched');

  return found;
end;
$$;

revoke all on function public.cancel_rule_lobby_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_rule_lobby_v2(uuid)
  to authenticated;

create or replace function public.list_rule_lobbies_v2()
returns table (
  lobby_id uuid,
  lobby_name text,
  creator_id uuid,
  legacy_rule_ids text[],
  ruleset_hash text,
  engine_version text,
  status text,
  mode text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.id,
    l.name,
    l.creator_id,
    l.active_rules,
    l.rule_set_hash,
    l.engine_version,
    l.status,
    l.mode,
    l.created_at
  from public.lobbies l
  where l.rule_set_hash is not null
    and l.mode = 'player'
    and l.status = 'waiting'
    and l.opponent_id is null
  order by l.created_at desc
  limit 100;
$$;

revoke all on function public.list_rule_lobbies_v2()
  from public, anon, authenticated;
grant execute on function public.list_rule_lobbies_v2()
  to authenticated;

create or replace function public.get_rule_lobby_v2(
  p_lobby_id uuid
)
returns table (
  lobby_id uuid,
  lobby_name text,
  creator_id uuid,
  opponent_id uuid,
  opponent_name text,
  legacy_rule_ids text[],
  ruleset_hash text,
  engine_version text,
  match_seed bigint,
  status text,
  mode text,
  game_state jsonb,
  created_at timestamptz,
  is_participant boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.id,
    l.name,
    l.creator_id,
    case
      when auth.uid() in (l.creator_id, l.opponent_id)
      then l.opponent_id
      else null
    end,
    case
      when auth.uid() in (l.creator_id, l.opponent_id)
      then l.opponent_name
      else null
    end,
    l.active_rules,
    l.rule_set_hash,
    l.engine_version,
    case
      when auth.uid() in (l.creator_id, l.opponent_id)
        and (
          l.mode = 'ai'
          or l.status = 'matched'
        )
      then l.match_seed
      else null
    end,
    l.status,
    l.mode,
    case
      when auth.uid() in (l.creator_id, l.opponent_id)
      then l.game_state
      else '{}'::jsonb
    end,
    l.created_at,
    auth.uid() in (l.creator_id, l.opponent_id)
  from public.lobbies l
  where l.id = p_lobby_id
    and l.rule_set_hash is not null
    and (
      l.status = 'waiting'
      or auth.uid() in (l.creator_id, l.opponent_id)
    );
$$;

revoke all on function public.get_rule_lobby_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.get_rule_lobby_v2(uuid)
  to authenticated;


create or replace function public.get_rule_lobby_runtime_v2(
  p_lobby_id uuid
)
returns table (
  lobby_id uuid,
  lobby_name text,
  creator_id uuid,
  opponent_id uuid,
  opponent_name text,
  mode text,
  status text,
  ruleset_hash text,
  engine_version text,
  match_seed bigint,
  rules jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.id,
    l.name,
    l.creator_id,
    l.opponent_id,
    l.opponent_name,
    l.mode,
    l.status,
    l.rule_set_hash,
    l.engine_version,
    l.match_seed,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'legacyRuleId', rv.legacy_rule_id,
          'ruleJson', rv.rule_json,
          'ordinal', lrv.ordinal
        )
        order by lrv.ordinal
      ) filter (where rv.id is not null),
      '[]'::jsonb
    )
  from public.lobbies l
  join public.lobby_rule_versions lrv
    on lrv.lobby_id = l.id
  join public.rule_versions rv
    on rv.id = lrv.rule_version_id
  where l.id = p_lobby_id
    and l.rule_set_hash is not null
    and l.status = 'matched'
    and (
      l.creator_id = auth.uid()
      or l.opponent_id = auth.uid()
    )
  group by
    l.id,
    l.name,
    l.creator_id,
    l.opponent_id,
    l.opponent_name,
    l.mode,
    l.status,
    l.rule_set_hash,
    l.engine_version,
    l.match_seed;
$$;

revoke all on function public.get_rule_lobby_runtime_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.get_rule_lobby_runtime_v2(uuid)
  to authenticated;

create or replace function public.cleanup_expired_rule_compilations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.rule_compilations
  where expires_at < now()
    and status in (
      'processing',
      'validated',
      'rejected',
      'failed'
    );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_expired_rule_compilations()
  from public, anon, authenticated;
grant execute on function public.cleanup_expired_rule_compilations()
  to service_role;

revoke all on function public.can_read_rule_version(uuid)
  from public, anon, authenticated;
revoke all on function public.can_read_rule_blueprint(uuid)
  from public, anon, authenticated;

grant execute on function public.can_read_rule_version(uuid)
  to authenticated;
grant execute on function public.can_read_rule_blueprint(uuid)
  to authenticated;

commit;
