begin;

-- integration-health reads this registry with the service role. Keep it out
-- of the public Data API even on projects that still grant public-table
-- privileges by default.
create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.api_registry (
  id uuid primary key default gen_random_uuid()
);

alter table public.api_registry
  add column if not exists service text,
  add column if not exists category text,
  add column if not exists target text,
  add column if not exists method text,
  add column if not exists config jsonb,
  add column if not exists notes text,
  add column if not exists active boolean,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

-- Legacy installations used service_name/endpoint_url/is_active/metadata.
-- Preserve those columns and their data, but do not copy metadata or API-key
-- references into the executable config. Legacy probes are disabled until an
-- operator explicitly reviews and converts them to the new contract.
do $legacy_api_registry$
declare
  v_has_service_name boolean;
  v_has_endpoint_url boolean;
  v_has_is_active boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'api_registry'
      and column_name = 'service_name'
  ) into v_has_service_name;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'api_registry'
      and column_name = 'endpoint_url'
  ) into v_has_endpoint_url;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'api_registry'
      and column_name = 'is_active'
  ) into v_has_is_active;

  if v_has_service_name then
    execute $sql$
      update public.api_registry
      set
        active = false,
        config = jsonb_build_object(
          'migration_source', 'legacy_api_registry',
          'review_required', true
        ),
        notes = case
          when nullif(btrim(notes), '') is null then
            'Legacy registry entry migrated disabled; review before activation.'
          else notes
        end
      where nullif(btrim(service), '') is null
    $sql$;

    execute $sql$
      update public.api_registry
      set service = nullif(btrim(service_name), '')
      where nullif(btrim(service), '') is null
        and nullif(btrim(service_name), '') is not null
    $sql$;

    -- New-contract inserts must not need to populate retired legacy columns.
    alter table public.api_registry alter column service_name drop not null;
  end if;

  if v_has_endpoint_url then
    execute $sql$
      update public.api_registry
      set target = nullif(btrim(endpoint_url), '')
      where nullif(btrim(target), '') is null
        and nullif(btrim(endpoint_url), '') is not null
    $sql$;

    alter table public.api_registry alter column endpoint_url drop not null;
  end if;

  -- Record the former activation state as a boolean only. The legacy entry
  -- remains disabled because its request method and cost are not trustworthy.
  if v_has_is_active then
    execute $sql$
      update public.api_registry
      set config = config || jsonb_build_object(
        'legacy_was_active', coalesce(is_active, false)
      )
      where config ->> 'migration_source' = 'legacy_api_registry'
    $sql$;
  end if;
end;
$legacy_api_registry$;

-- Fill only missing contract values. Existing new-contract rows retain their
-- operational settings, subject to the security constraints below.
update public.api_registry
set
  id = coalesce(id, gen_random_uuid()),
  service = coalesce(
    nullif(btrim(service), ''),
    'legacy-' || coalesce(id::text, gen_random_uuid()::text)
  ),
  category = case lower(nullif(btrim(category), ''))
    when 'supabase' then 'supabase'
    when 'database' then 'supabase'
    when 'table' then 'supabase'
    when 'edge_function' then 'edge_function'
    when 'edge-function' then 'edge_function'
    when 'function' then 'edge_function'
    when 'coach_api' then 'coach_api'
    when 'coach-api' then 'coach_api'
    when 'coach' then 'coach_api'
    when 'http' then 'http'
    else 'http'
  end,
  target = coalesce(
    nullif(btrim(target), ''),
    nullif(btrim(service), ''),
    'unconfigured'
  ),
  method = upper(nullif(btrim(method), '')),
  config = coalesce(config, '{}'::jsonb),
  active = coalesce(active, true),
  created_at = coalesce(created_at, now()),
  updated_at = greatest(
    coalesce(updated_at, created_at, now()),
    coalesce(created_at, now())
  );

-- Configuration is declarative, not a secret store. The recursive predicate
-- blocks common credential-bearing keys at every nesting level while still
-- allowing harmless headers such as Accept or Content-Type.
create or replace function private.api_registry_config_has_no_secret_keys(
  p_value jsonb
)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_key text;
  v_normalized_key text;
  v_child jsonb;
begin
  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in
      select entry.key, entry.value
      from pg_catalog.jsonb_each(p_value) as entry(key, value)
    loop
      v_normalized_key := lower(
        pg_catalog.regexp_replace(v_key, '[^a-zA-Z0-9]', '', 'g')
      );

      if v_normalized_key in (
        'apikey',
        'authorization',
        'password',
        'passwd',
        'secret',
        'clientsecret',
        'servicerole',
        'servicerolekey',
        'token',
        'accesstoken',
        'refreshtoken',
        'credential',
        'credentials',
        'cookie',
        'privatekey',
        'signingkey',
        'webhooksecret'
      ) then
        return false;
      end if;

      if jsonb_typeof(v_child) in ('object', 'array')
        and not private.api_registry_config_has_no_secret_keys(v_child) then
        return false;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in
      select element.value
      from pg_catalog.jsonb_array_elements(p_value) as element(value)
    loop
      if jsonb_typeof(v_child) in ('object', 'array')
        and not private.api_registry_config_has_no_secret_keys(v_child) then
        return false;
      end if;
    end loop;
  end if;

  return true;
end;
$$;

revoke all on function private.api_registry_config_has_no_secret_keys(jsonb)
  from public, anon, authenticated;

do $validate_existing_config$
begin
  if exists (
    select 1
    from public.api_registry
    where jsonb_typeof(config) is distinct from 'object'
      or not private.api_registry_config_has_no_secret_keys(config)
  ) then
    raise exception 'API_REGISTRY_UNSAFE_CONFIG_REQUIRES_MANUAL_REVIEW'
      using errcode = '23514';
  end if;
end;
$validate_existing_config$;

do $validate_unique_services$
begin
  if exists (
    select service
    from public.api_registry
    group by service
    having count(*) > 1
  ) then
    raise exception 'API_REGISTRY_DUPLICATE_SERVICE_REQUIRES_MANUAL_REVIEW'
      using errcode = '23505';
  end if;
end;
$validate_unique_services$;

alter table public.api_registry
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column service set not null,
  alter column category set not null,
  alter column target set not null,
  alter column config set default '{}'::jsonb,
  alter column config set not null,
  alter column active set default true,
  alter column active set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $api_registry_primary_key$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.api_registry'::regclass
      and contype = 'p'
  ) then
    alter table public.api_registry
      add constraint api_registry_pkey primary key (id);
  end if;
end;
$api_registry_primary_key$;

do $api_registry_unique_service$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a
      on a.attrelid = c.conrelid
      and a.attnum = any(c.conkey)
    where c.conrelid = 'public.api_registry'::regclass
      and c.contype = 'u'
      and pg_catalog.array_length(c.conkey, 1) = 1
      and a.attname = 'service'
  ) then
    alter table public.api_registry
      add constraint api_registry_service_key unique (service);
  end if;
end;
$api_registry_unique_service$;

alter table public.api_registry
  drop constraint if exists api_registry_service_nonempty,
  drop constraint if exists api_registry_target_nonempty,
  drop constraint if exists api_registry_category_allowed,
  drop constraint if exists api_registry_method_allowed,
  drop constraint if exists api_registry_config_object_safe,
  drop constraint if exists api_registry_timestamps_ordered;

alter table public.api_registry
  add constraint api_registry_service_nonempty
    check (service = btrim(service) and service <> ''),
  add constraint api_registry_target_nonempty
    check (target = btrim(target) and target <> ''),
  add constraint api_registry_category_allowed
    check (category in ('supabase', 'edge_function', 'coach_api', 'http')),
  add constraint api_registry_method_allowed
    check (
      method is null
      or method in ('GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS')
    ),
  add constraint api_registry_config_object_safe
    check (
      jsonb_typeof(config) = 'object'
      and private.api_registry_config_has_no_secret_keys(config)
    ),
  add constraint api_registry_timestamps_ordered
    check (updated_at >= created_at);

create or replace function private.api_registry_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.api_registry_touch_updated_at()
  from public, anon, authenticated;

drop trigger if exists update_api_registry_updated_at on public.api_registry;
drop trigger if exists api_registry_touch_updated_at on public.api_registry;
create trigger api_registry_touch_updated_at
before update on public.api_registry
for each row execute function private.api_registry_touch_updated_at();

alter table public.api_registry enable row level security;
alter table public.api_registry force row level security;

-- No row policy is needed: only service_role reads the registry. Remove the
-- historical "Everyone can view" policy and any environment-specific policy
-- that could become dangerous after a future grant change.
do $drop_api_registry_policies$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'api_registry'
  loop
    execute format(
      'drop policy if exists %I on public.api_registry',
      v_policy.policyname
    );
  end loop;
end;
$drop_api_registry_policies$;

revoke all on table public.api_registry from public, anon, authenticated;
grant select on table public.api_registry to service_role;

-- Managed probes are intentionally cheap: three single-row table reads and
-- three CORS preflights. No credential is stored; Edge authentication headers
-- are added at runtime from the service-role environment.
insert into public.api_registry (
  service,
  category,
  target,
  method,
  config,
  notes,
  active
)
values
  (
    'core-table-chess-rules',
    'supabase',
    'chess_rules',
    null,
    '{
      "seed_marker": "20260722150000_integration_health",
      "probe_kind": "bounded_table_select",
      "table": "chess_rules",
      "columns": "id"
    }'::jsonb,
    'Managed health probe: reads at most one chess_rules id.',
    true
  ),
  (
    'core-table-rule-blueprints',
    'supabase',
    'rule_blueprints',
    null,
    '{
      "seed_marker": "20260722150000_integration_health",
      "probe_kind": "bounded_table_select",
      "table": "rule_blueprints",
      "columns": "id"
    }'::jsonb,
    'Managed health probe: reads at most one rule_blueprints id.',
    true
  ),
  (
    'core-table-rule-versions',
    'supabase',
    'rule_versions',
    null,
    '{
      "seed_marker": "20260722150000_integration_health",
      "probe_kind": "bounded_table_select",
      "table": "rule_versions",
      "columns": "id"
    }'::jsonb,
    'Managed health probe: reads at most one rule_versions id.',
    true
  ),
  (
    'edge-integration-health-preflight',
    'edge_function',
    'integration-health',
    'OPTIONS',
    '{
      "seed_marker": "20260722150000_integration_health",
      "probe_kind": "cors_preflight",
      "method": "OPTIONS",
      "expect_status": 204,
      "timeout_ms": 3000
    }'::jsonb,
    'Managed health probe: expects a 204 CORS preflight response.',
    true
  ),
  (
    'edge-generate-rule-questions-preflight',
    'edge_function',
    'generate-rule-questions',
    'OPTIONS',
    '{
      "seed_marker": "20260722150000_integration_health",
      "probe_kind": "cors_preflight",
      "method": "OPTIONS",
      "expect_status": 204,
      "timeout_ms": 3000
    }'::jsonb,
    'Managed health probe: expects a 204 CORS preflight response.',
    true
  ),
  (
    'edge-compile-chess-rule-preflight',
    'edge_function',
    'compile-chess-rule',
    'OPTIONS',
    '{
      "seed_marker": "20260722150000_integration_health",
      "probe_kind": "cors_preflight",
      "method": "OPTIONS",
      "expect_status": 204,
      "timeout_ms": 3000
    }'::jsonb,
    'Managed health probe: expects a 204 CORS preflight response.',
    true
  )
on conflict (service) do update
set
  category = excluded.category,
  target = excluded.target,
  method = excluded.method,
  config = excluded.config,
  notes = excluded.notes,
  active = true
where public.api_registry.config ->> 'seed_marker'
  = '20260722150000_integration_health';

commit;
