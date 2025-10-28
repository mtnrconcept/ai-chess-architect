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

Tous les doublons détectés lors du précédent audit ont été supprimés. Chaque table ne possède plus qu'une seule migration de création, datée du 18 octobre 2025, qui sert désormais de référence.

### Edge functions

No duplicate edge function implementations were detected—each `index.ts` under `supabase/functions/*` is unique.

## Recommendations

* Continuer à privilégier des migrations incrémentales (`alter table`, `add column`, etc.) plutôt que des recréations complètes.
* Relancer `node scripts/check-supabase-duplicates.mjs` après chaque série de migrations pour détecter rapidement toute régression.
* Documenter les décisions de schéma directement dans les fichiers SQL afin que les futures contributions puissent suivre la convention actuelle.
