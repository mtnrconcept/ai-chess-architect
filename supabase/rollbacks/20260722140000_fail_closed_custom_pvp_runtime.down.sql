begin;

drop trigger if exists lobbies_custom_pvp_runtime_gate on public.lobbies;
drop function if exists private.enforce_custom_pvp_runtime_availability();

commit;
