begin;

alter table public.tournament_matches
  add column if not exists is_ai_match boolean not null default false,
  add column if not exists ai_opponent_label text,
  add column if not exists ai_opponent_difficulty text;

update public.tournament_matches
set is_ai_match = false
where is_ai_match is null;

commit;
