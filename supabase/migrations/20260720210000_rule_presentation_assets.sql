begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.rule_presentations (
  id uuid primary key default gen_random_uuid(),
  compilation_id uuid not null unique
    references public.rule_compilations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_key uuid not null,
  status text not null
    check (status in ('processing', 'ready', 'fallback', 'failed')),
  model text not null check (char_length(model) between 1 and 120),
  blueprint jsonb not null default '{}'::jsonb
    check (jsonb_typeof(blueprint) = 'object'),
  resolved_assets jsonb not null default '[]'::jsonb
    check (jsonb_typeof(resolved_assets) = 'array'),
  diagnostics jsonb not null default '[]'::jsonb
    check (jsonb_typeof(diagnostics) = 'array'),
  metrics jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metrics) = 'object'),
  content_hash text,
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, request_key),
  constraint rule_presentations_content_hash_required
    check (status in ('processing', 'failed') or content_hash is not null),
  constraint rule_presentations_content_hash_format
    check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.rule_assets (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null
    references public.rule_presentations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null check (request_id ~ '^[a-z][a-z0-9-]{1,49}$'),
  visual_id text not null check (visual_id ~ '^[a-z][a-z0-9-]{1,49}$'),
  status text not null check (status in ('ready', 'fallback')),
  provider text not null check (provider in ('openverse', 'builtin')),
  provider_asset_id text,
  storage_bucket text,
  storage_path text,
  public_url text,
  mime_type text,
  byte_size integer check (byte_size is null or byte_size between 1 and 2097152),
  sha256 text,
  license text not null check (license in ('cc0', 'pdm', 'builtin')),
  license_url text,
  attribution text not null check (char_length(attribution) between 1 and 500),
  landing_url text,
  fallback text not null check (
    fallback in (
      'procedural-dragon',
      'procedural-specter',
      'procedural-impact',
      'procedural-portal',
      'none'
    )
  ),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (presentation_id, request_id),
  constraint rule_assets_owner_consistency
    foreign key (presentation_id, user_id)
    references public.rule_presentations(id, user_id)
    on delete cascade,
  constraint rule_assets_ready_fields_required
    check (
      status = 'fallback'
      or (
        provider = 'openverse'
        and provider_asset_id is not null
        and storage_bucket = 'rule-assets-public'
        and storage_path is not null
        and public_url is not null
        and mime_type in ('image/jpeg', 'image/png', 'image/webp')
        and byte_size is not null
        and sha256 is not null
        and license in ('cc0', 'pdm')
      )
    ),
  constraint rule_assets_fallback_provider
    check (status <> 'fallback' or provider = 'builtin'),
  constraint rule_assets_sha256_format
    check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  constraint rule_assets_storage_path_format
    check (
      storage_path is null
      or storage_path ~ '^v1/[0-9a-f-]{36}/[0-9a-f]{64}\.(jpg|png|webp)$'
    ),
  constraint rule_assets_public_url_https
    check (public_url is null or public_url ~ '^https://'),
  constraint rule_assets_license_url_https
    check (license_url is null or license_url ~ '^https://'),
  constraint rule_assets_landing_url_https
    check (landing_url is null or landing_url ~ '^https://')
);

create index if not exists idx_rule_presentations_user_updated
  on public.rule_presentations(user_id, updated_at desc);
create index if not exists idx_rule_presentations_status_updated
  on public.rule_presentations(status, updated_at)
  where status in ('processing', 'failed');
create index if not exists idx_rule_assets_presentation
  on public.rule_assets(presentation_id, created_at);
create index if not exists idx_rule_assets_ready_sha256
  on public.rule_assets(sha256)
  where status = 'ready' and sha256 is not null;

alter table public.rule_presentations enable row level security;
alter table public.rule_assets enable row level security;

revoke all on public.rule_presentations from anon, authenticated;
revoke all on public.rule_assets from anon, authenticated;
grant select on public.rule_presentations to authenticated;
grant select on public.rule_assets to authenticated;
grant select, insert, update, delete on public.rule_presentations to service_role;
grant select, insert, update, delete on public.rule_assets to service_role;

drop policy if exists "Owners read rule presentations"
  on public.rule_presentations;
create policy "Owners read rule presentations"
  on public.rule_presentations for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Owners read rule assets" on public.rule_assets;
create policy "Owners read rule assets"
  on public.rule_assets for select
  to authenticated
  using (user_id = auth.uid());

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'rule-assets-public',
  'rule-assets-public',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do nothing;

do $$
declare
  v_bucket storage.buckets%rowtype;
begin
  select * into v_bucket
  from storage.buckets
  where id = 'rule-assets-public';

  if not found
    or v_bucket.public is not true
    or v_bucket.file_size_limit is distinct from 2097152
    or v_bucket.allowed_mime_types is distinct from
      array['image/jpeg', 'image/png', 'image/webp']::text[] then
    raise exception 'RULE_ASSET_BUCKET_CONFIGURATION_MISMATCH';
  end if;
end;
$$;

drop policy if exists "Public read approved rule assets" on storage.objects;
create policy "Public read approved rule assets"
  on storage.objects for select
  to public
  using (bucket_id = 'rule-assets-public');

create or replace function public.enforce_rule_presentation_compilation_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_compilation public.rule_compilations%rowtype;
begin
  select * into v_compilation
  from public.rule_compilations
  where id = new.compilation_id
    and user_id = new.user_id
  for update;

  if not found then
    raise exception 'PRESENTATION_COMPILATION_NOT_FOUND';
  end if;

  if v_compilation.status <> 'validated'
    or v_compilation.published_version_id is not null then
    raise exception 'PRESENTATION_COMPILATION_NOT_EDITABLE';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_rule_presentation_compilation_state()
  from public, anon, authenticated;

drop trigger if exists trg_enforce_rule_presentation_compilation_state
  on public.rule_presentations;
create trigger trg_enforce_rule_presentation_compilation_state
before insert or update of compilation_id, user_id
on public.rule_presentations
for each row
execute function public.enforce_rule_presentation_compilation_state();

create or replace function public.apply_rule_presentation_hash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gameplay_hash text;
  v_combined_hash text;
  v_published_version_id uuid;
begin
  if new.status not in ('ready', 'fallback')
    or new.content_hash is null
    or coalesce((new.blueprint ->> 'enabled')::boolean, false) is false then
    return new;
  end if;

  select
      coalesce(metrics ->> 'gameplayContentHash', content_hash),
      published_version_id
    into v_gameplay_hash, v_published_version_id
  from public.rule_compilations
  where id = new.compilation_id
    and user_id = new.user_id
  for update;

  if v_gameplay_hash is null then
    raise exception 'GAMEPLAY_CONTENT_HASH_MISSING';
  end if;

  if v_published_version_id is not null then
    raise exception 'RULE_ALREADY_PUBLISHED';
  end if;

  v_combined_hash := encode(
    extensions.digest(
      convert_to(v_gameplay_hash || ':' || new.content_hash, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  update public.rule_compilations
  set content_hash = v_combined_hash,
      metrics = coalesce(metrics, '{}'::jsonb)
        || jsonb_build_object(
          'gameplayContentHash', v_gameplay_hash,
          'presentationContentHash', new.content_hash
        ),
      updated_at = now()
  where id = new.compilation_id
    and user_id = new.user_id
    and (
      content_hash is distinct from v_combined_hash
      or metrics ->> 'presentationContentHash' is distinct from new.content_hash
    );

  return new;
end;
$$;

revoke all on function public.apply_rule_presentation_hash()
  from public, anon, authenticated;

drop trigger if exists trg_apply_rule_presentation_hash
  on public.rule_presentations;
create trigger trg_apply_rule_presentation_hash
after insert or update of status, content_hash, blueprint
on public.rule_presentations
for each row
execute function public.apply_rule_presentation_hash();

create or replace function public.attach_rule_presentation_to_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_presentation public.rule_presentations%rowtype;
  v_assets jsonb;
  v_manifest jsonb;
begin
  select * into v_presentation
  from public.rule_presentations
  where compilation_id = new.compilation_id
    and user_id = new.created_by;

  if not found then
    return new;
  end if;

  if v_presentation.status = 'processing'
    and v_presentation.updated_at > now() - interval '5 minutes' then
    raise exception 'PRESENTATION_STILL_PROCESSING';
  end if;

  if v_presentation.status not in ('ready', 'fallback')
    or coalesce(
      (v_presentation.blueprint ->> 'enabled')::boolean,
      false
    ) is false then
    return new;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requestId', request_id,
        'visualId', visual_id,
        'status', status,
        'provider', provider,
        'providerAssetId', provider_asset_id,
        'storageBucket', storage_bucket,
        'storagePath', storage_path,
        'publicUrl', public_url,
        'mimeType', mime_type,
        'byteSize', byte_size,
        'sha256', sha256,
        'license', license,
        'licenseUrl', license_url,
        'attribution', attribution,
        'landingUrl', landing_url,
        'fallback', fallback
      )
      order by request_id
    ),
    '[]'::jsonb
  ) into v_assets
  from public.rule_assets
  where presentation_id = v_presentation.id
    and request_id in (
      select request_item ->> 'id'
      from jsonb_array_elements(
        coalesce(
          v_presentation.blueprint -> 'assetRequests',
          '[]'::jsonb
        )
      ) as request_item
    );

  v_manifest := jsonb_build_object(
    'schemaVersion', coalesce(
      v_presentation.blueprint ->> 'schemaVersion',
      '1.0.0'
    ),
    'contentHash', v_presentation.content_hash,
    'enabled', true,
    'sequences', coalesce(
      v_presentation.blueprint -> 'sequences',
      '[]'::jsonb
    ),
    'assets', v_assets
  );

  new.rule_json := jsonb_set(
    coalesce(new.rule_json, '{}'::jsonb),
    '{assets}',
    coalesce(new.rule_json -> 'assets', '{}'::jsonb)
      || jsonb_build_object('presentation', v_manifest),
    true
  );
  new.validation := coalesce(new.validation, '{}'::jsonb)
    || jsonb_build_object(
      'presentationId', v_presentation.id,
      'presentationHash', v_presentation.content_hash,
      'presentationStatus', v_presentation.status
    );
  return new;
end;
$$;

revoke all on function public.attach_rule_presentation_to_version()
  from public, anon, authenticated;

drop trigger if exists trg_attach_rule_presentation_to_version
  on public.rule_versions;
create trigger trg_attach_rule_presentation_to_version
before insert on public.rule_versions
for each row
execute function public.attach_rule_presentation_to_version();

create or replace function public.attach_rule_presentation_to_chess_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assets jsonb;
begin
  select rule_json -> 'assets'
    into v_assets
  from public.rule_versions
  where legacy_rule_id = new.rule_id;

  if v_assets is null then
    return new;
  end if;

  new.rule_json := jsonb_set(
    coalesce(new.rule_json, '{}'::jsonb),
    '{assets}',
    v_assets,
    true
  );
  new.assets := v_assets;
  return new;
end;
$$;

revoke all on function public.attach_rule_presentation_to_chess_rule()
  from public, anon, authenticated;

drop trigger if exists trg_attach_rule_presentation_to_chess_rule
  on public.chess_rules;
create trigger trg_attach_rule_presentation_to_chess_rule
before insert on public.chess_rules
for each row
execute function public.attach_rule_presentation_to_chess_rule();

commit;
