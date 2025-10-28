-- 2025-10-29_tournaments_policies.sql

-- Hypothèses de schéma :
--   - Table: public.tournaments
--   - Colonnes utiles: id (uuid), creator_id (uuid), published (bool), visibility (text: 'public'|'private'), starts_at (timestamptz), ...
--   - Table de participation: public.tournament_participants (tournament_id uuid, user_id uuid)

alter table public.tournaments enable row level security;

-- Voir les tournois publics publiés
create policy "tournaments_select_public"
  on public.tournaments
  for select
  to authenticated
  using (published = true and visibility = 'public');

-- Voir ses propres tournois (créateur/organisateur)
create policy "tournaments_select_owner"
  on public.tournaments
  for select
  to authenticated
  using (creator_id = auth.uid());

-- Voir les tournois où l'utilisateur est inscrit
create policy "tournaments_select_member"
  on public.tournaments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tournament_participants tp
      where tp.tournament_id = tournaments.id
        and tp.user_id = auth.uid()
    )
  );

-- (Optionnel) Créer un tournoi (owner = auth.uid())
create policy "tournaments_insert_owner"
  on public.tournaments
  for insert
  to authenticated
  with check (creator_id = auth.uid());

-- (Optionnel) Mettre à jour son tournoi
create policy "tournaments_update_owner"
  on public.tournaments
  for update
  to authenticated
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());
