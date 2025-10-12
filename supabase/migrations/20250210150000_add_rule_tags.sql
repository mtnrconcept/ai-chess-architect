-- Add tags metadata to custom rules for lobby filtering
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_tables
    where schemaname = 'public'
      and tablename = 'custom_chess_rules'
  ) then
    perform
      pg_catalog.set_config('search_path', 'public', true);

    execute 'alter table public.custom_chess_rules add column if not exists tags text[] default array[]::text[]';

    execute '
      update public.custom_chess_rules
        set tags = array[]::text[]
        where tags is null
    ';
  end if;
end;
$$ language plpgsql;
