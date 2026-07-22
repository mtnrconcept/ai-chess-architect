-- This historical migration predates the migration that creates
-- tournament_matches. It must be a no-op on a fresh database; a later additive
-- migration guarantees the columns after the table exists.
do $migration$
begin
  if pg_catalog.to_regclass('public.tournament_matches') is null then
    return;
  end if;

  execute $alter_table$
    alter table public.tournament_matches
      add column if not exists is_ai_match boolean not null default false,
      add column if not exists ai_opponent_label text,
      add column if not exists ai_opponent_difficulty text
  $alter_table$;

  execute $backfill$
    update public.tournament_matches
    set is_ai_match = coalesce(is_ai_match, false)
  $backfill$;
end
$migration$;
