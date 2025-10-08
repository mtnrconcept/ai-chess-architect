-- Seed curated tournaments for demo environments
insert into public.tournaments (
  id,
  name,
  description,
  variant_name,
  variant_source,
  variant_rules,
  start_time,
  end_time,
  status
)
values
  (
    '00000000-0000-4000-8000-000000000101',
    'Voltus Hyper Knights Sprint',
    'Format blitz survolté issu de la variante Voltus Hyper Knights.',
    'Voltus Hyper Knights',
    'fallback',
    array['preset_mov_01', 'preset_mov_07'],
    timezone('utc', now()) - interval '1 hour',
    timezone('utc', now()) + interval '1 hour',
    'running'
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    'Tempête Royale Arena',
    'Tournoi orienté attaque avec double charge royale.',
    'Tempête Royale',
    'fallback',
    array['preset_mov_05', 'preset_mov_06'],
    timezone('utc', now()) + interval '30 minutes',
    timezone('utc', now()) + interval '2 hours 30 minutes',
    'scheduled'
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    'Arène des Pions Clash',
    'Rotation rapide axée sur le contrôle central et les pions agressifs.',
    'Arène des Pions',
    'fallback',
    array['preset_mov_04', 'preset_mov_10'],
    timezone('utc', now()) - interval '4 hours',
    timezone('utc', now()) - interval '2 hours',
    'completed'
  ),
  (
    '00000000-0000-4000-8000-000000000104',
    'Diagonales Infinies Marathon',
    'Endurance stratégique basée sur des diagonales illimitées.',
    'Diagonales Infinies',
    'fallback',
    array['preset_mov_02', 'preset_mov_09'],
    timezone('utc', now()) + interval '3 hours',
    timezone('utc', now()) + interval '5 hours',
    'scheduled'
  )
on conflict (id) do nothing;
