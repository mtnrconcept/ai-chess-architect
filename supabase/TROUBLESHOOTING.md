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

