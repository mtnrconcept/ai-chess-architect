# Supabase Troubleshooting Guide

## Lovable ↔ Supabase integration checklist

When wiring the Lovable preview/production builds to a brand-new Supabase project, resolve the following three blockers before
testing the UI again:

1. **Environment variables in Lovable** – Provide the exact project URL and anon key in both the preview and production
   environments.
   ```bash
   VITE_SUPABASE_URL="https://ucaqbhmyutlnitnedowk.supabase.co"
   VITE_SUPABASE_PROJECT_NAME="AI Chess Architect"
   VITE_SUPABASE_ANON_KEY="<your anon key>"
   ```
   The anon key is safe to expose to the browser; grab it from **Project Settings → API** in Supabase (or regenerate it from the
   JWT secret if you self-host).

2. **Schema and views** – Apply the migrations in `supabase/migrations` (or run their SQL in the dashboard) so that the REST API
   can resolve `/rest/v1/tournaments`, `/rest/v1/tournament_overview`, and related resources.
   * Ensure the tables `public.tournaments`, `public.tournament_registrations`, `public.tournament_matches`, and `public.lobbies`
     exist.
   * Recreate the `public.tournament_overview` view after fixing any `WITHIN GROUP` errors in ordered-set aggregates.
   * If Row Level Security is enabled, add at least a `SELECT` policy that allows anonymous reads while you test the
     integration.

3. **Edge function secrets and CORS** – For `functions/v1/sync-tournaments`, define `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` in the function's secret store so the Deno runtime can authenticate. Keep the existing CORS
   preflight handler and verify that `OPTIONS` replies with 204 and the headers:
   `Access-Control-Allow-Origin: *`,
   `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`,
   `Access-Control-Allow-Methods: POST, OPTIONS`.

### Quick validation commands

* REST health check:
  ```bash
  curl "https://ucaqbhmyutlnitnedowk.supabase.co/rest/v1/tournaments?select=*" \
    -H "apikey: $VITE_SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
  ```
  A `200 []` response confirms the table exists and RLS grants reads.
* PostgREST schema cache refresh:
  ```sql
  select pg_notify('pgrst', 'reload schema');
  ```

  Depuis le dépôt, tu peux déclencher cette notification sans passer par psql en exécutant `pnpm run postgrest:reload`, qui se c
  onnecte via `SUPABASE_DB_URL` et envoie la commande `NOTIFY` automatiquement.
* Edge function preflight:
  ```bash
  curl -i -X OPTIONS "https://ucaqbhmyutlnitnedowk.functions.supabase.co/sync-tournaments"
  ```

Share this checklist with any automation agent (“Codex”) so it knows which secrets, SQL migrations, and validations to execute
before handing the project back to Lovable.

## `supabase: command not found`

Certains environnements de build ou de test ne fournissent pas le binaire Supabase CLI. Les commandes telles que `supabase db push` échouent alors immédiatement.

### Solution recommandée

Utilise le script Node déjà inclus dans ce dépôt :

```bash
pnpm run db:migrate
```

Ce script se connecte directement à la base configurée via `SUPABASE_DB_URL`, applique uniquement les migrations SQL encore inédites (grâce à la table `public.__lovable_schema_migrations`), et assure le chiffrement TLS (`sslmode=require`). Il constitue une alternative drop-in à `supabase db push` dans les pipelines CI/CD ou les conteneurs minimalistes.

## `WITHIN GROUP is required for ordered-set aggregate mode`

Postgres raises this error whenever an ordered-set aggregate (for example `percentile_cont`, `percentile_disc`, or `mode`) is invoked without the mandatory `WITHIN GROUP (ORDER BY ...)` clause.

### Symptoms

Supabase logs show messages similar to:

```
ERROR: WITHIN GROUP is required for ordered-set aggregate mode
```

The rest of the connections in the logs (for example `supabase_admin`, `authenticator`, realtime replication, Prometheus exporter) are expected and typically succeed over TLS 1.3.

### Common causes

* A view, SQL function (RPC), or direct PostgREST query uses an ordered-set aggregate without the `WITHIN GROUP` clause.
* Client code calls `/rest/v1` endpoints that expand into SQL using `percentile_*` or `mode` and omits the clause.

### How to locate the faulty definition

You can inspect definitions manually or run the companion script `supabase/scripts/find_missing_ordered_set_aggregates.sql` from psql:

```
\i supabase/scripts/find_missing_ordered_set_aggregates.sql
```

Run the following searches while connected as an admin role to find functions or views that call ordered-set aggregates incorrectly:

```sql
-- Functions
SELECT n.nspname AS schema,
       p.proname AS function,
       pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
  AND pg_get_functiondef(p.oid) ILIKE '%percentile_%'
  AND pg_get_functiondef(p.oid) NOT ILIKE '%WITHIN GROUP%';

SELECT n.nspname AS schema,
       p.proname AS function,
       pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
  AND pg_get_functiondef(p.oid) ILIKE '%mode(%'
  AND pg_get_functiondef(p.oid) NOT ILIKE '%WITHIN GROUP%';

-- Views
SELECT schemaname,
       viewname,
       definition
FROM pg_views
WHERE schemaname NOT IN ('pg_catalog','information_schema')
  AND ((definition ILIKE '%percentile_%' AND definition NOT ILIKE '%WITHIN GROUP%')
       OR (definition ILIKE '%mode(%' AND definition NOT ILIKE '%WITHIN GROUP%'));
```

### Fixing the definition

Rewrite the offending SQL so that each ordered-set aggregate includes `WITHIN GROUP (ORDER BY ...)`:

```sql
-- Correct median and mode examples
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY score) FROM stats;
SELECT percentile_disc(0.9) WITHIN GROUP (ORDER BY score) FROM stats;
SELECT mode() WITHIN GROUP (ORDER BY score) FROM stats;
```

When exposing the logic via PostgREST, prefer encapsulating it in a view or RPC:

```sql
CREATE OR REPLACE FUNCTION public.stats_percentiles()
RETURNS TABLE (elo_p50 numeric, elo_p90 numeric) AS $$
  SELECT
    percentile_cont(0.5) WITHIN GROUP (ORDER BY elo),
    percentile_cont(0.9) WITHIN GROUP (ORDER BY elo)
  FROM public.player_stats;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

After updating the definition, rerun the original request to confirm the error no longer appears.

### Alternatives when ordered-set aggregates are unsuitable

* **Median via window functions**:

  ```sql
  SELECT AVG(val) AS median
  FROM (
    SELECT val
    FROM (
      SELECT val,
             ROW_NUMBER() OVER (ORDER BY val) AS rn,
             COUNT(*)    OVER ()              AS ct
      FROM t
    ) ranked
    WHERE rn IN ((ct + 1) / 2, (ct + 2) / 2)
  ) median_values;
  ```

* **Approximate percentiles**: use `tdigest`/`percentile_agg` if the extension is available.

## `PGRST205: Could not find the table public.tournaments in the schema cache`

PostgREST returns `PGRST205` when the requested table or view is missing from its schema cache. This generally means the object
does not exist, lives in a different schema, or the cache is stale.

### 1. Confirm the table exists and locate its schema

Run these quick checks in the SQL editor:

```sql
-- Returns 'public.tournaments' if it exists, otherwise NULL
select to_regclass('public.tournaments');

-- List similarly named tables across schemas
select table_schema, table_name
from information_schema.tables
where table_name ilike '%tournament%';
```

If the first query returns `NULL`, the table is missing; proceed to the creation step. If it appears under another schema (for
example `app.tournaments`), either adjust the schema or query it with `from('app.tournaments')` / `schema('app')` in Supabase
client code.

### 2. Create a minimal table (if it is missing)

To unblock development quickly, create a simple structure that you can extend later:

```sql
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft',
  mode text,
  starts_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_tournaments_updated_at on public.tournaments;
create trigger trg_tournaments_updated_at
before update on public.tournaments
for each row execute function public.set_updated_at();
```

Tailor the columns to match the application model if needed.

### 3. Refresh the PostgREST schema cache

Run `select pg_notify('pgrst','reload schema');` (or restart the API from **Project Settings → API → Restart**) after creating
or renaming tables so PostgREST immediately discovers the new structure.

---

## REST `/rest/v1` calls return **400 Bad Request** for seemingly valid filters

PostgREST validates every query parameter. A 400 response usually means at least one clause refers to a column that does not
exist in the cached schema. Common culprits:

* `order=created_at.asc` when `created_at` is missing or renamed.
* `select=active_rules,mode,status` when one column was dropped or belongs to another schema.
* Passing filters such as `status=in.(waiting,matched)` with typos or incorrect URL encoding.

### Quick checks

1. Confirm the table is reachable:

   ```bash
   curl -s "$SUPABASE_URL/rest/v1/lobbies?select=count" \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY"
   ```

2. Inspect the canonical column list:

   ```sql
   select column_name, data_type
   from information_schema.columns
   where table_schema = 'public' and table_name = 'lobbies'
   order by ordinal_position;
   ```

3. Re-run the failing request with a minimal `select` and verified `order` clause. If it succeeds, add fields back gradually to
   pinpoint the offender.

### Fixes

* Correct the column names in the client code.
* If you recently ran a migration, trigger a schema reload (see previous section).
* Avoid hand-crafted URLs—`@supabase/supabase-js` builds safe filters automatically and URL-encodes values for you.

---

## REST `/rest/v1/...` endpoints return **404 Not Found** for tables such as `tournaments`

`404` combined with Supabase logs that mention `PGRST205` indicates the table or view is missing or PostgREST never refreshed its
cache. In practice this surfaces when the dashboard shows `/rest/v1/tournaments` or `/rest/v1/tournament_overview` returning `404`
while Lovable still points to a freshly created project. Fix it with the following checklist:

1. **Apply the migrations** – Run `supabase db push` (or execute the SQL files in `supabase/migrations`) so that the tables
   `public.tournaments`, `public.tournament_matches`, `public.tournament_registrations` and the `public.tournament_overview`
   view exist.
2. **Reload PostgREST's schema cache** – After the objects are present, run
   `select pg_notify('pgrst','reload schema');` to make `/rest/v1/*` aware of them. Skipping this step keeps the 404 in place.
3. **(Optional) Grant explicit privileges** – If you work with custom roles, ensure they have `usage` on the schema and `select`
   on the tables/views (for example `grant usage on schema public to anon; grant select on public.tournaments to anon;`).

If you are using a non-`public` schema, remember to either set the schema on the client (`supabase.schema('app')`) or create
synonyms in `public` so the REST API can expose them.

For a quick bootstrap environment, reuse the minimal DDL from `supabase/migrations/20251215100000_create_tournament_system.sql`
and `20260301120000_create_user_games.sql`. After creation, rerun the `pg_notify` command above to expose them.

---

## Edge Function `/functions/v1/sync-tournaments` returns **500 Internal Server Error**

Unhandled exceptions bubble up as HTTP 500. Ensure the function logs the exact failure and that it has access to every table it
touches (use the **service role key** when bypassing RLS). Wrap the handler in a try/catch and echo the message plus stack trace
to the logs so Supabase's dashboard reveals the underlying issue. Example skeleton:

```ts
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );

    // TODO: add your sync logic here.
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    console.error("sync-tournaments error", error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
});
```

---

## Le coach IA fonctionne mais les tournois ne se synchronisent pas

Ce symptôme indique généralement que seule la partie « lecture publique » de Supabase est configurée. Les tournois, eux, reposent
sur une fonction edge (`sync-tournaments`) qui écrit dans les tables `public.tournaments`, `public.tournament_matches` et
`public.tournament_registrations`. Vérifie les points suivants :

1. **Clé service role manquante** – Le coach n'utilise que la clé publishable (`anon`). La fonction `sync-tournaments` appelle
   `getSupabaseServiceRoleClient()` et renvoie `Supabase client not configured` si `SUPABASE_SERVICE_ROLE_KEY` (ou ses alias
   `SUPABASE_SERVICE_ROLE` / `SERVICE_ROLE_KEY`) n'est pas défini dans les secrets du projet. Ajoute la clé via
   `npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...` puis redéploie les fonctions.
2. **Projet incorrect** – Les fonctions forcent par défaut l'identifiant `ucaqbhmyutlnitnedowk`. Si tu as cloné le projet dans un
   autre environnement, renseigne `SUPABASE_PROJECT_ID`/`SUPABASE_URL` avec l'identifiant exact ou adapte le code. Sans cela, la
   fonction écrira dans un projet vide et l'UI ne verra aucun tournoi.
3. **Migrations non appliquées** – Sans les tables/vues de `supabase/migrations`, la fonction lève `feature_unavailable`. Exécute
   `pnpm run db:push` (ou `pnpm run db:migrate`) et force un `NOTIFY pgrst, 'reload schema';` pour que `/rest/v1/tournaments` soit
   exposé immédiatement.
4. **Edge function non déployée** – Un coach fonctionnel prouve que les API REST répondent, mais pas que la fonction `sync-tournaments`
   est à jour. Redeploie-la explicitement : `npx supabase functions deploy sync-tournaments` (ou via l'interface Supabase) afin qu'elle
   prenne les derniers secrets et le code TypeScript.

Lorsque ces quatre points sont validés, un appel manuel à `POST https://<project>.functions.supabase.co/sync-tournaments` doit
retourner `{ "created": 20, "ensuredBlocks": 2 }` (ou des valeurs proches) et les tournois apparaissent côté client.

---

## Edge Function `/functions/v1/chess-insights` returns **429 Too Many Requests**

Supabase throttles edge functions per project. Burst requests from a UI (for example, firing on every keypress) exhaust the
limit quickly.

### Mitigations

* **Debounce** or **throttle** client calls so only one request fires after user input settles (600–1000 ms works well).
* Add a lightweight cache (Postgres table, Redis, or in-memory) keyed by `(user_id, payload)` inside the function and reuse
  results for 60–120 seconds.
* Serialize concurrent invocations per user. Track active calls in the UI and disable the trigger until the prior one resolves.
* When a 429 slips through, perform exponential backoff retries and communicate the reason to the user via a toast/snackbar.

These guardrails keep analytics features responsive without violating the rate limits.

Even after creating the table, PostgREST may serve cached metadata. Force a reload:

```sql
NOTIFY pgrst, 'reload schema';
```

A metadata change such as `COMMENT ON TABLE public.tournaments IS '...';` can also trigger a refresh, but the `NOTIFY` is
explicit.

### 4. Grant access for quick verification

Start with permissive grants to confirm the API works, then tighten them:

```sql
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.tournaments to anon, authenticated;

alter table public.tournaments enable row level security;

create policy "tournaments_read_all"
on public.tournaments
for select
to anon, authenticated
using (true);

create policy "tournaments_write_all"
on public.tournaments
for all
to authenticated
using (true)
with check (true);
```

Replace these broad policies with application-specific rules once everything is working.

### 5. Verify client-side queries

Ensure the client points to the correct schema:

```ts
supabase.from('tournaments').select('*');              // Table in public
supabase.schema('app').from('tournaments').select('*'); // Table in another schema
supabase.from('app.tournaments').select('*');          // Alternative notation
```

When calling the REST endpoint directly, the path should be `/rest/v1/tournaments?select=*` (or include the schema name if it is
not `public`).

### 6. If the table exists but the error continues

Double-check the following:

1. The `NOTIFY pgrst, 'reload schema';` command ran successfully.
2. You are connected to the intended project and database branch.
3. The target is a regular table or view (materialized views or unsupported objects might be hidden).
4. For Edge Functions or service-role clients, confirm the exact name and schema; permissions are unlikely to be the root cause
   with the service role.

### 7. Smoke test

Insert a dummy row and query it back:

```sql
insert into public.tournaments (name, status, mode, starts_at)
values ('Test Open', 'open', 'variant', now() + interval '1 day')
returning *;
```

```ts
const { data, error } = await supabase
  .from('tournaments')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(1);
console.log({ data, error });
```

You should see the newly inserted tournament.


---

## Edge Function `/functions/v1/sync-tournaments` logs `Table/vues tournois introuvables. Applique les migrations.`

The sync logic queries the `public.tournaments`, `public.tournament_matches`, `public.tournament_registrations` tables and the `public.tournament_overview`/`public.tournament_leaderboard` views. The error indicates these objects are missing or PostgREST has not reloaded the schema cache.

### Resolution

1. Apply the tournament migrations:

   ```bash
   supabase db push
   # or, for a clean local project
   supabase db reset
   ```

   These commands replay the SQL in `supabase/migrations/20251215100000_create_tournament_system.sql` (and the later hardening migrations) which create the required tables, views and RLS policies.

2. Notify PostgREST to reload the schema if the API had already started:

   ```sql
   select pg_notify('pgrst', 'reload schema');
   ```

3. Retry the Edge Function invocation. It should now succeed and emit an HTTP 200 response.

If you are working against a remote project, remember to deploy the database changes (`supabase db push --linked`) and redeploy the Edge Function (`supabase functions deploy sync-tournaments`).
