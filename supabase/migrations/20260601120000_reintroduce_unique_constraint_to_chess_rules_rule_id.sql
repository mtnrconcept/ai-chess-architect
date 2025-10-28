-- Reintroduce the chess_rules.rule_id unique constraint for reliable upserts
-- 1. Remove duplicate rule_id entries, keeping the most recently updated row
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
  and rr.rn > 1;

-- 2. Add the unique constraint if it does not already exist
DO $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chess_rules_rule_id_key'
      and conrelid = 'public.chess_rules'::regclass
  ) then
    alter table public.chess_rules
      add constraint chess_rules_rule_id_key unique (rule_id);
  end if;
end$$;

-- 3. Refresh PostgREST metadata so the change is picked up immediately
select pg_notify('pgrst', 'reload schema');
