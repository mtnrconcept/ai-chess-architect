# Diagnostic des tournois

## Statut actuel

Les migrations destructives qui réécrivaient le schéma des tournois (`20251215100000_create_tournament_system.sql`, `20260315100000_hardening_tournament_schema.sql`, `20260215120000_seed_demo_tournaments.sql`, etc.) ont été retirées du dépôt. Le dossier `supabase/migrations` ne contient plus que la série de scripts initiale (datée du 18 octobre 2025) qui conserve toutes les colonnes attendues par le code.

Après avoir synchronisé ces migrations (`pnpm run db:push`) et relancé `select pg_notify('pgrst','reload schema');`, la fonction `sync-tournaments` retrouve les colonnes `player1_id`, `player2_id`, `table_number`, `is_ai_match`, `ai_opponent_label`, `ai_opponent_difficulty`, `winner_id`, `reported_by`, etc. Les statuts `pending`, `playing`, `finished` et `cancelled` sont de nouveau disponibles, ce qui permet aux edge functions `tournament-matchmaking` et `report-tournament-match` d'exécuter leurs mises à jour sans lever d'erreur.【F:supabase/functions/tournament-matchmaking/index.ts†L52-L111】【F:supabase/functions/report-tournament-match/index.ts†L54-L129】

## Bonnes pratiques

- **Limiter les migrations destructives** : pour modifier les colonnes ou les contraintes, privilégier `alter table` plutôt que la recréation complète des tables.
- **Vérifier la cohérence avec le client** : comparer toute évolution de schéma avec les types générés dans `src/integrations/supabase/types.ts` afin d'éviter les divergences silencieuses.
- **Toujours recharger PostgREST** après une mise à jour du schéma pour rendre les nouvelles colonnes accessibles immédiatement (`pnpm run postgrest:reload`).
