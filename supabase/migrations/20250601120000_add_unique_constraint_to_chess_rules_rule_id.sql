-- This historical migration predates the migration that creates chess_rules.
-- On a fresh database it must therefore be a no-op; the later 2026 migration
-- reintroduces the same constraint after the table exists.
do $migration$
begin
  if pg_catalog.to_regclass('public.chess_rules') is null then
    return;
  end if;

  execute $deduplicate$
    with ranked_rules as (
      select
        id,
        rule_id,
        row_number() over (
          partition by rule_id
          order by coalesce(updated_at, created_at) desc, created_at desc, id desc
        ) as rn
      from public.chess_rules
    )
    delete from public.chess_rules cr
    using ranked_rules rr
    where cr.id = rr.id
      and rr.rn > 1
  $deduplicate$;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'chess_rules_rule_id_key'
      and conrelid = pg_catalog.to_regclass('public.chess_rules')
  ) then
    execute 'alter table public.chess_rules '
      || 'add constraint chess_rules_rule_id_key unique (rule_id)';
  end if;

  perform pg_catalog.pg_notify('pgrst', 'reload schema');
end
$migration$;
