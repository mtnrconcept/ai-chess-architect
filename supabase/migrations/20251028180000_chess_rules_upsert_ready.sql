-- 1) Extensions utiles
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- 2) Table (idempotent)
create table if not exists public.chess_rules (
  id uuid primary key default gen_random_uuid(),
  rule_id text not null,
  variant_id text,
  name text,
  version integer default 1,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) Contraintes d'unicité pour upsert
--    (A) unicité business sur (rule_id, variant_id)
do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'chess_rules_rule_variant_key'
  ) then
    alter table public.chess_rules
      add constraint chess_rules_rule_variant_key unique (rule_id, variant_id);
  end if;
end$$;

--    (B) optionnel : si tu veux autoriser l'upsert uniquement par rule_id,
--        décommente la contrainte suivante (et adapte on_conflict côté client).
-- alter table public.chess_rules
--   add constraint chess_rules_rule_id_key unique (rule_id);

-- 4) Trigger updated_at (idempotent)
create or replace function public.tg__set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_chess_rules_set_updated_at'
  ) then
    create trigger trg_chess_rules_set_updated_at
      before update on public.chess_rules
      for each row execute function public.tg__set_updated_at();
  end if;
end$$;

-- 5) RLS : activer et politiques saines
alter table public.chess_rules enable row level security;

-- Lecture publique (anonyme + authentifié)
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'chess_rules' and policyname = 'chess_rules_select_all'
  ) then
    create policy chess_rules_select_all
      on public.chess_rules
      for select
      to public
      using (true);
  end if;
end$$;

-- Insert/Upsert réservé aux utilisateurs authentifiés
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'chess_rules' and policyname = 'chess_rules_insert_auth'
  ) then
    create policy chess_rules_insert_auth
      on public.chess_rules
      for insert
      to authenticated
      with check (true);
  end if;
end$$;

-- Update réservé aux utilisateurs authentifiés
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'chess_rules' and policyname = 'chess_rules_update_auth'
  ) then
    create policy chess_rules_update_auth
      on public.chess_rules
      for update
      to authenticated
      using (true)
      with check (true);
  end if;
end$$;

-- (Optionnel) Delete réservé aux admins (exemple via claim 'role' = 'service_role' si besoin)
-- create policy chess_rules_delete_admin
--   on public.chess_rules
--   for delete
--   to authenticated
--   using ( coalesce( (auth.jwt() ->> 'role') = 'service_role', false) );
