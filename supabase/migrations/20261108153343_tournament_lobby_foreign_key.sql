-- Restore the authoritative tournament_matches → lobbies relationship.
-- Tournament matchmaking and every tournament details query already expect
-- tournament_matches.lobby_id, but older databases never received the column.
-- Additive, idempotent and nullable: historical results remain untouched.
begin;

alter table public.tournament_matches
  add column if not exists lobby_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tournament_matches'::regclass
      and conname = 'tournament_matches_lobby_id_fkey'
  ) then
    alter table public.tournament_matches
      add constraint tournament_matches_lobby_id_fkey
      foreign key (lobby_id) references public.lobbies (id)
      on delete set null;
  end if;
end;
$$;

create index if not exists tournament_matches_lobby_id_idx
  on public.tournament_matches (lobby_id)
  where lobby_id is not null;

comment on column public.tournament_matches.lobby_id is
  'Server-created lobby for this tournament match. Nullable for historical matches.';

notify pgrst, 'reload schema';
commit;
