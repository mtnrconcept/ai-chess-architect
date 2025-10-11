# Supabase Troubleshooting Guide

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

