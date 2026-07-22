-- Reintroduce the constraint only when the legacy table exists.
do $$
begin
  if to_regclass('public.chess_rules') is not null then
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

    if not exists (
      select 1
      from pg_constraint
      where conname = 'chess_rules_rule_id_key'
        and conrelid = to_regclass('public.chess_rules')
    ) then
      alter table public.chess_rules
        add constraint chess_rules_rule_id_key unique (rule_id);
    end if;
  end if;
end
$$;

select pg_notify('pgrst', 'reload schema');
