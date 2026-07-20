begin;

create table if not exists public.rule_scene_assets (
  id uuid primary key default gen_random_uuid(),
  scene_id text not null unique
    check (scene_id ~ '^scene\.[a-z0-9][a-z0-9.-]{2,63}$'),
  status text not null
    check (status in ('ready', 'failed')),
  storage_path text unique,
  mime_type text
    check (mime_type is null or mime_type in ('image/png', 'image/webp', 'image/jpeg')),
  byte_size integer
    check (byte_size is null or byte_size between 1 and 4194304),
  sha256 text
    check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  provider text not null default 'openverse'
    check (provider = 'openverse'),
  provider_asset_id text,
  title text,
  creator text,
  creator_url text,
  license text
    check (license is null or license in ('cc0', 'pdm', 'by')),
  license_url text,
  attribution text,
  source_page_url text,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rule_scene_assets_ready_fields
    check (
      status <> 'ready'
      or (
        storage_path is not null
        and mime_type is not null
        and byte_size is not null
        and sha256 is not null
        and provider_asset_id is not null
        and license is not null
        and attribution is not null
        and source_page_url is not null
        and failure_code is null
      )
    ),
  constraint rule_scene_assets_failed_fields
    check (
      status <> 'failed'
      or (
        failure_code is not null
        and storage_path is null
        and mime_type is null
        and byte_size is null
        and sha256 is null
      )
    )
);

create table if not exists public.rule_compilation_scene_assets (
  compilation_id uuid not null
    references public.rule_compilations(id) on delete cascade,
  scene_asset_id uuid not null
    references public.rule_scene_assets(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (compilation_id, scene_asset_id)
);

create index if not exists idx_rule_scene_assets_provider_asset
  on public.rule_scene_assets(provider, provider_asset_id)
  where provider_asset_id is not null;

create index if not exists idx_rule_compilation_scene_assets_asset
  on public.rule_compilation_scene_assets(scene_asset_id);

alter table public.rule_scene_assets enable row level security;
alter table public.rule_compilation_scene_assets enable row level security;

revoke all on table public.rule_scene_assets from anon, authenticated;
revoke all on table public.rule_compilation_scene_assets from anon, authenticated;
grant all on table public.rule_scene_assets to service_role;
grant all on table public.rule_compilation_scene_assets to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'rule-assets',
  'rule-assets',
  false,
  4194304,
  array['image/png', 'image/webp', 'image/jpeg']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No browser policy is created on storage.objects. Only the service-role Edge
-- function can write or sign these private objects.

commit;
