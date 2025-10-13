# Supabase duplicate audit

This audit captures potential duplicates between Supabase edge functions and database table definitions. It is based on inspecting the edge function sources under `supabase/functions` and the SQL migrations under `supabase/migrations`.

## How to reproduce

Run the helper script to scan the repository:

```bash
node scripts/check-supabase-duplicates.mjs
```

The script reports repeated table creation statements across migrations and compares edge function implementations by file hash.

## Findings

### Table definitions

| Table | Migrations declaring the table | Notes |
| --- | --- | --- |
| `lobbies` | `20251006142922_1a4a36e6-9d2d-4c63-bdc5-965377714def.sql`, `20260315100000_hardening_tournament_schema.sql` | Both migrations attempt to create the lobby container for matches. Review whether both are required or if one should be refactored into `alter table` statements. |
| `tournaments` | `20251215100000_create_tournament_system.sql`, `20260315100000_hardening_tournament_schema.sql` | Later migration recreates the table with slightly different defaults (JSON rules vs. text array). Confirm intended schema evolution. |
| `tournament_matches` | `20251215100000_create_tournament_system.sql`, `20260315100000_hardening_tournament_schema.sql` | Second migration introduces a simplified match schema; check for safe coexistence with existing columns. |
| `tournament_registrations` | `20251215100000_create_tournament_system.sql`, `20260315100000_hardening_tournament_schema.sql` | Similar duplication to match tables; ensure schema convergence. |
| `user_games` | `20260301120000_create_user_games.sql`, `20260415121500_security_hardening.sql` | Security hardening migration recreates the table with stricter defaults instead of altering the existing definition. |

### Edge functions

No duplicate edge function implementations were detected—each `index.ts` under `supabase/functions/*` is unique.

## Recommendations

* Consolidate repeated table creations into dedicated migration paths that use `alter table` statements so future schema diffs stay clear.
* Decide which variant of the tournament tables (`jsonb` vs `text[]` rules, optional columns, etc.) should be authoritative and adjust migrations accordingly.
* Keep the duplicate audit script handy during Supabase workstreams to validate future contributions.
