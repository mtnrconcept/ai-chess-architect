begin;

do $api_registry_contract$
declare
  v_missing_columns text[];
  v_seed_count integer;
  v_table_probe_count integer;
  v_preflight_count integer;
begin
  select array_agg(expected.column_name order by expected.column_name)
    into v_missing_columns
  from (
    values
      ('id'),
      ('service'),
      ('category'),
      ('target'),
      ('method'),
      ('config'),
      ('notes'),
      ('active'),
      ('created_at'),
      ('updated_at')
  ) as expected(column_name)
  left join information_schema.columns actual
    on actual.table_schema = 'public'
   and actual.table_name = 'api_registry'
   and actual.column_name = expected.column_name
  where actual.column_name is null;

  if v_missing_columns is not null then
    raise exception 'API_REGISTRY_COLUMNS_MISSING: %', v_missing_columns;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'api_registry'
      and column_name in (
        'id', 'service', 'category', 'target', 'config', 'active',
        'created_at', 'updated_at'
      )
      and is_nullable <> 'NO'
  ) then
    raise exception 'API_REGISTRY_REQUIRED_COLUMN_IS_NULLABLE';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'api_registry'
      and c.relrowsecurity
      and c.relforcerowsecurity
  ) then
    raise exception 'API_REGISTRY_RLS_NOT_FORCED';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'api_registry'
  ) then
    raise exception 'API_REGISTRY_MUST_NOT_HAVE_PUBLIC_DATA_POLICIES';
  end if;

  if has_table_privilege('anon', 'public.api_registry', 'SELECT')
    or has_table_privilege('anon', 'public.api_registry', 'INSERT')
    or has_table_privilege('anon', 'public.api_registry', 'UPDATE')
    or has_table_privilege('anon', 'public.api_registry', 'DELETE') then
    raise exception 'ANON_CAN_ACCESS_API_REGISTRY';
  end if;

  if has_table_privilege('authenticated', 'public.api_registry', 'SELECT')
    or has_table_privilege('authenticated', 'public.api_registry', 'INSERT')
    or has_table_privilege('authenticated', 'public.api_registry', 'UPDATE')
    or has_table_privilege('authenticated', 'public.api_registry', 'DELETE') then
    raise exception 'AUTHENTICATED_CAN_ACCESS_API_REGISTRY';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.api_registry',
    'SELECT'
  ) then
    raise exception 'SERVICE_ROLE_CANNOT_READ_API_REGISTRY';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_proc p on p.oid = t.tgfoid
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where t.tgrelid = 'public.api_registry'::regclass
      and t.tgname = 'api_registry_touch_updated_at'
      and not t.tgisinternal
      and n.nspname = 'private'
      and p.proname = 'api_registry_touch_updated_at'
      and not p.prosecdef
      and array_to_string(p.proconfig, ',') like '%search_path=%'
  ) then
    raise exception 'API_REGISTRY_UPDATED_AT_TRIGGER_NOT_HARDENED';
  end if;

  if has_function_privilege(
    'anon',
    'private.api_registry_touch_updated_at()',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'private.api_registry_touch_updated_at()',
    'EXECUTE'
  ) then
    raise exception 'CLIENT_CAN_EXECUTE_API_REGISTRY_TRIGGER_FUNCTION';
  end if;

  select count(*)
    into v_seed_count
  from public.api_registry
  where config ->> 'seed_marker' = '20260722150000_integration_health';

  select count(*)
    into v_table_probe_count
  from public.api_registry
  where config ->> 'seed_marker' = '20260722150000_integration_health'
    and active
    and category = 'supabase'
    and method is null
    and config ->> 'probe_kind' = 'bounded_table_select'
    and config ->> 'columns' = 'id'
    and config ->> 'table' = target;

  select count(*)
    into v_preflight_count
  from public.api_registry
  where config ->> 'seed_marker' = '20260722150000_integration_health'
    and active
    and category = 'edge_function'
    and method = 'OPTIONS'
    and config ->> 'probe_kind' = 'cors_preflight'
    and config ->> 'method' = 'OPTIONS'
    and config ->> 'expect_status' = '204'
    and config ->> 'timeout_ms' = '3000';

  if v_seed_count <> 6
    or v_table_probe_count <> 3
    or v_preflight_count <> 3 then
    raise exception
      'API_REGISTRY_MANAGED_PROBES_INVALID: total %, table %, preflight %',
      v_seed_count,
      v_table_probe_count,
      v_preflight_count;
  end if;

  if exists (
    select 1
    from public.api_registry
    where config ->> 'seed_marker' = '20260722150000_integration_health'
      and not private.api_registry_config_has_no_secret_keys(config)
  ) then
    raise exception 'API_REGISTRY_MANAGED_PROBE_CONTAINS_SECRET_KEY';
  end if;

  if exists (
    select 1
    from public.api_registry
    where config ->> 'migration_source' = 'legacy_api_registry'
      and active
  ) then
    raise exception 'UNREVIEWED_LEGACY_PROBE_IS_ACTIVE';
  end if;
end;
$api_registry_contract$;

do $api_registry_write_guards$
declare
  v_id constant uuid := 'd0000000-0000-4000-8000-000000001500';
  v_initial_updated_at timestamptz;
  v_updated_at timestamptz;
begin
  insert into public.api_registry (
    id, service, category, target, config, notes, active
  ) values (
    v_id,
    'api-registry-sql-test',
    'supabase',
    'chess_rules',
    '{"table":"chess_rules","columns":"id"}'::jsonb,
    'Synthetic transaction-scoped row.',
    false
  )
  returning updated_at into v_initial_updated_at;

  update public.api_registry
  set
    notes = 'Trigger verification.',
    updated_at = '2000-01-01 00:00:00+00'::timestamptz
  where id = v_id;

  select updated_at into v_updated_at
  from public.api_registry
  where id = v_id;

  if v_updated_at < v_initial_updated_at
    or v_updated_at = '2000-01-01 00:00:00+00'::timestamptz then
    raise exception 'API_REGISTRY_UPDATED_AT_TRIGGER_FAILED';
  end if;

  begin
    insert into public.api_registry (
      service, category, target, config, active
    ) values (
      'api-registry-invalid-secret-test',
      'http',
      'https://example.invalid/health',
      '{"headers":{"Authorization":"Bearer redacted"}}'::jsonb,
      false
    );
    raise exception 'API_REGISTRY_SECRET_CONFIG_WAS_ACCEPTED';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.api_registry (
      service, category, target, config, active
    ) values (
      'api-registry-invalid-category-test',
      'database_admin',
      'chess_rules',
      '{}'::jsonb,
      false
    );
    raise exception 'API_REGISTRY_INVALID_CATEGORY_WAS_ACCEPTED';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.api_registry (
      service, category, target, config, active
    ) values (
      'api-registry-sql-test',
      'supabase',
      'rule_versions',
      '{}'::jsonb,
      false
    );
    raise exception 'API_REGISTRY_DUPLICATE_SERVICE_WAS_ACCEPTED';
  exception
    when unique_violation then null;
  end;
end;
$api_registry_write_guards$;

rollback;
