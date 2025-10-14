# Diagnostic des tournois

## Pourquoi la synchronisation échoue

La fonction edge `sync-tournaments` attend que la table `tournament_matches` expose toutes les colonnes et les valeurs d'état utilisées par le front et les autres edge functions. Dans la migration `supabase/migrations/20260315100000_hardening_tournament_schema.sql`, la table est recréée avec une définition minimale qui ne contient plus les colonnes consommées par le code (par exemple `player1_id`, `player2_id`, `table_number`, `is_ai_match`, `ai_opponent_label`, `ai_opponent_difficulty`, `started_at`, `updated_at`, `winner_id`, `reported_by`, etc.) et restreint le champ `status` aux valeurs `pending`, `playing` et `done`.【F:supabase/migrations/20260315100000_hardening_tournament_schema.sql†L22-L55】

Les fonctions `tournament-matchmaking` et `report-tournament-match`, ainsi que le client web, manipulent explicitement les états `pending`, `playing` et `finished` et lisent/écrivent les colonnes supprimées. Dès que la fonction tente de mettre à jour un match en `playing` ou `finished`, Postgres renvoie une violation de contrainte (`status` ne fait plus partie des valeurs autorisées) ou une erreur « column does not exist », ce qui interrompt la synchronisation après la création des premiers tournois injectés par les seeds.【F:supabase/functions/tournament-matchmaking/index.ts†L52-L111】【F:supabase/functions/report-tournament-match/index.ts†L54-L129】

## Effets observés

- Le script `npm run sync:tournaments` invoque bien l'edge function mais celle-ci échoue dès qu'elle essaye de préparer des matches, car le schéma ne correspond plus. Aucune nouvelle entrée n'est insérée malgré l'absence d'erreur côté UI : seuls les tournois pré-semés via `20260215120000_seed_demo_tournaments.sql` restent visibles.【F:supabase/migrations/20260215120000_seed_demo_tournaments.sql†L1-L11】
- L'inscription (`registerForTournament`) échoue elle aussi : la migration minimale supprime les colonnes `display_name`, `avatar_url`, `wins`, `losses`, `draws`, `points`, `current_match_id`, `is_waiting` nécessaires à l'upsert effectué par le client. Chaque tentative se termine par une erreur PostgREST « column does not exist » ou « null value in column … » et le front bascule en mode « tournois indisponibles ».【F:src/lib/tournamentApi.ts†L404-L440】

## Correctifs à appliquer

1. Restaurer la définition complète des tables `tournament_matches` et `tournament_registrations` telle qu'introduite dans `20251215100000_create_tournament_system.sql` (colonnes et contraintes comprises), ou écrire une migration de rattrapage qui ajoute les colonnes et met à jour le `CHECK` sur `status` (`pending`, `playing`, `finished`, `cancelled`).【F:supabase/migrations/20251215100000_create_tournament_system.sql†L160-L520】
2. Supprimer ou corriger la migration `20260315100000_hardening_tournament_schema.sql` pour qu'elle n'écrase plus le schéma avec une version incompatible, notamment en alignant les valeurs autorisées de `status` avec celles attendues par le code (`pending`, `playing`, `finished`).
3. Après correction, relancer `npm run db:push` puis `npm run postgrest:reload` afin de réappliquer les migrations et forcer PostgREST à rafraîchir son cache comme indiqué dans le README.【F:README.md†L95-L134】

Tant que ces divergences ne sont pas corrigées, les fonctions d'inscription, de matchmaking et de reporting continueront à échouer, ce qui explique l'absence de synchronisation malgré la présence de quelques tournois affichés en lecture seule.
