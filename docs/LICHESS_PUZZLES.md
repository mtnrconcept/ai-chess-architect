# Problèmes d'échecs quotidiens Aichess — données libres

Source : Lichess Open Database, licence **CC0 1.0**.
- Portail : https://database.lichess.org/#puzzles
- Extrait ouvert : https://github.com/mcognetta/lichess-combined-puzzle-game-db
- Origine : base des puzzles Lichess, préparés à partir de parties publiques.

## Adaptation au moteur existant

Le serveur `get_daily_chess_puzzle(date)` n'expose **jamais la solution**.
Le serveur `submit_daily_chess_puzzle(...)` vérifie une ligne de coups et attribue les XP une seule fois.
L'interface actuelle prend un coup de joueur à la fois, donc l'import sélectionne exclusivement
les puzzles marqués `oneMove` qui possèdent deux coups UCI :
le premier est le coup adverse (à appliquer au FEN source), le second est la réponse de l'utilisateur.

Import de source :

```bash
python scripts/prepare_lichess_candidates.py combined_puzzle_db_first_50k.ndjson.bz2 candidates.json
node scripts/build-lichess-daily-puzzles.mjs candidates.json seed.sql 2026-11-08 365
```

Le fichier `supabase/migrations/20261108144021_lichess_cc0_daily_puzzles.sql`
contient 365 problèmes distincts datés du 8 novembre 2026 au 7 novembre 2027.
L'import vérifie les coups avec `chess.js` et contrôle les mats annoncés par les tags.
Une journée déjà configurée par un administrateur est préservée : `ON CONFLICT DO NOTHING`.

Les données ne sont pas intégrées dans le bundle Vite public; seules les positions et métadonnées
sont exposées par la RPC sécurisée lorsque l'utilisateur est authentifié.

## Maintenance

Avant la fin de l'horizon d'un an, importer une nouvelle plage à partir de la base
Lichess ou d'un nouvel extrait. L'app doit conserver un état « indisponible » véridique
si aucune énigme n'a été publiée pour la date du jour.

## Tournois et PvP

Les 60 tournois existants sont affichés à partir de Supabase. L'interface de salons de tournoi
montre les inscrits et tables officiels, mais les salons PvP sécurisés créés depuis cette page sont
**amicaux**, isolés des résultats du tournoi. Le classement officiel existant reste indépendant.
Ne jamais prétendre qu'une partie amicale incrémente le résultat d'un tournoi.
