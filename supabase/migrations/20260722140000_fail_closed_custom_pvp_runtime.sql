begin;

-- Custom rules currently execute in the deterministic client runtime. Until
-- the same interpreter is authoritative on the move server, a two-player
-- lobby would create two independent games and must never be advertised as a
-- synchronized match. AI lobbies remain fully local and deterministic.
create or replace function private.enforce_custom_pvp_runtime_availability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rule_set_hash is not null
    and new.mode = 'player'
    and (
      tg_op = 'INSERT'
      or new.status = 'matched'
      or new.opponent_id is not null
    ) then
    raise exception 'CUSTOM_PVP_RUNTIME_NOT_AUTHORITATIVE'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_custom_pvp_runtime_availability()
  from public, anon, authenticated;

drop trigger if exists lobbies_custom_pvp_runtime_gate on public.lobbies;
create trigger lobbies_custom_pvp_runtime_gate
before insert or update of mode, rule_set_hash, status, opponent_id
on public.lobbies
for each row execute function private.enforce_custom_pvp_runtime_availability();

commit;
