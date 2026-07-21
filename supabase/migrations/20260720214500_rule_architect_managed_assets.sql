begin;

create table if not exists public.rule_assets (
  asset_id text primary key,
  storage_path text not null unique,
  provider text not null,
  provider_file_id text not null,
  label text not null,
  source_page_url text not null,
  source_asset_url text not null,
  license_short_name text not null,
  attribution text not null default '',
  content_type text not null,
  width integer not null,
  height integer not null,
  byte_size integer not null,
  content_sha256 text not null unique,
  moderation_id text not null,
  moderation_model text not null,
  moderation_flagged boolean not null default false,
  moderation_categories jsonb not null default '[]'::jsonb,
  moderation_checked_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint rule_assets_asset_id_safe check (
    asset_id ~ '^asset_[0-9a-f]{40}\.(png|jpg|webp)$'
  ),
  constraint rule_assets_storage_path_safe check (
    storage_path = 'managed/' || asset_id
  ),
  constraint rule_assets_provider_safe check (
    provider = 'wikimedia_commons'
  ),
  constraint rule_assets_provider_file_safe check (
    provider_file_id ~ '^[0-9]{1,20}$'
  ),
  constraint rule_assets_source_page_safe check (
    source_page_url ~ '^https://commons\.wikimedia\.org/wiki/File:[^?#]+$'
  ),
  constraint rule_assets_source_asset_safe check (
    source_asset_url ~ '^https://upload\.wikimedia\.org/wikipedia/commons/[^?#]+$'
  ),
  constraint rule_assets_license_safe check (
    lower(license_short_name) in ('public domain', 'cc0', 'cc0 1.0')
  ),
  constraint rule_assets_content_type_safe check (
    content_type in ('image/png', 'image/jpeg', 'image/webp')
  ),
  constraint rule_assets_dimensions_safe check (
    width between 64 and 4096 and height between 64 and 4096
  ),
  constraint rule_assets_byte_size_safe check (
    byte_size between 1 and 5242880
  ),
  constraint rule_assets_sha_safe check (
    content_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint rule_assets_moderation_model_present check (
    length(moderation_model) between 1 and 120
  ),
  constraint rule_assets_moderation_passed check (
    moderation_flagged = false
  ),
  constraint rule_assets_moderation_categories_array check (
    jsonb_typeof(moderation_categories) = 'array'
  )
);

create unique index if not exists rule_assets_provider_file_unique
  on public.rule_assets (provider, provider_file_id);

alter table public.rule_assets enable row level security;
alter table public.rule_assets force row level security;

revoke all on table public.rule_assets from anon, authenticated;
grant select, insert, update, delete on table public.rule_assets to service_role;

-- Never mutate an existing bucket into a public bucket. A pre-existing bucket
-- with the same identifier may contain unrelated private objects. Create the
-- expected bucket only when absent, then validate its complete configuration.
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
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

do $$
declare
  v_name text;
  v_public boolean;
  v_file_size_limit bigint;
  v_allowed_mime_types text[];
  v_expected_mime_types constant text[] :=
    array['image/png', 'image/jpeg', 'image/webp'];
begin
  select
    name,
    public,
    file_size_limit,
    allowed_mime_types
  into strict
    v_name,
    v_public,
    v_file_size_limit,
    v_allowed_mime_types
  from storage.buckets
  where id = 'rule-assets';

  if v_name <> 'rule-assets'
    or v_public is distinct from true
    or v_file_size_limit is distinct from 5242880
    or v_allowed_mime_types is null
    or cardinality(v_allowed_mime_types) <> 3
    or not (
      v_allowed_mime_types @> v_expected_mime_types
      and v_expected_mime_types @> v_allowed_mime_types
    ) then
    raise exception 'RULE_ASSET_BUCKET_CONFIGURATION_MISMATCH'
      using errcode = '22023';
  end if;
end;
$$;

comment on table public.rule_assets is
  'Assets visuels externes copiés, modérés et contrôlés pour Rule Architect V2. Aucune URL utilisateur ni ressource exécutable.';
comment on column public.rule_assets.content_sha256 is
  'Empreinte SHA-256 du fichier effectivement téléchargé et stocké.';
comment on column public.rule_assets.moderation_categories is
  'Catégories booléennes signalées par le modèle de modération; vide pour un asset accepté.';

commit;
