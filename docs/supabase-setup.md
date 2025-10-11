# Configuration Supabase

Ce guide explique comment appliquer les migrations SQL et déployer les Edge Functions utilisées par Voltus Chess Architect.

## 1. Prérequis

- [Supabase CLI](https://supabase.com/docs/guides/cli) ≥ 1.210
- Node.js ≥ 18 et npm (les scripts utilisent `tsx`)
- Un projet Supabase provisionné avec un accès **Service Role**

Assurez-vous de vous connecter au CLI :

```bash
supabase login
```

Si vous disposez d'un **access token** spécifique au projet, exportez-le avant d'exécuter les commandes :

```bash
export SUPABASE_ACCESS_TOKEN="<votre-token>"
```

## 2. Renseigner les variables d'environnement

Copiez le fichier d'exemple et complétez les identifiants du projet :

```bash
cp env.example .env
```

Dans `.env`, renseignez :

- `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` pour le front
- `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` pour les scripts Node et les Edge Functions
- `SUPABASE_DB_URL` (URL **pgbouncer** fournie par Supabase) pour l'application des migrations

> ⚠️ Ces valeurs ne doivent jamais être commitées. Gardez-les exclusivement dans vos environnements d'exécution.

## 3. Appliquer les migrations SQL

Depuis la racine du projet :

```bash
npm install
SUPABASE_DB_URL="postgresql://postgres:<mot-de-passe>@db.<ref>.supabase.co:6543/postgres?pgbouncer=true&sslmode=require" \
npm run supabase:migrate
```

Le script lit tous les fichiers `supabase/migrations/*.sql`, exécute ceux qui n'ont pas encore été appliqués, puis notifie PostgREST afin qu'il recharge le schéma. Vous pouvez également fournir la chaîne de connexion via `SUPABASE_DB_CONNECTION_STRING` ou `DATABASE_URL`.

## 4. Déployer les Edge Functions

Vérifiez que `supabase/config.toml` contient `project_id = "<votre-ref>"`. Si ce n'est pas le cas, exportez `SUPABASE_PROJECT_REF` avant de lancer le script.

Exécutez ensuite :

```bash
./supabase/deploy-edge-functions.sh
```

Le script déploie automatiquement les fonctions :

- `chess-insights`
- `generate-chess-rule`
- `load-user-games`
- `record-user-game`
- `report-tournament-match`
- `sync-tournaments`
- `tournament-matchmaking`

Utilisez l'option `--dry-run` pour afficher les fonctions sans lancer le déploiement.

### Secrets requis côté Supabase

Les Edge Functions utilisent le client `service_role`. Vérifiez que les secrets suivants sont définis :

```bash
supabase secrets set \
  SUPABASE_URL="https://<ref>.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="<clé-service-role>" \
  --project-ref <votre-ref>
```

Relancez `./supabase/deploy-edge-functions.sh` après avoir ajouté ou modifié des secrets.

## 5. Vérifications rapides

1. Ouvrez la console Supabase → **Table Editor** et vérifiez que les tables `custom_chess_rules`, `lobbies`, `user_games`, `tournaments`, `tournament_matches` et `tournament_registrations` existent.
2. Depuis la CLI, interrogez une table publique :

   ```bash
   supabase db remote commit --project-ref <votre-ref> --dry-run
   ```

   (la commande échoue si la connexion ou les identifiants sont incorrects)

3. Appelez une Edge Function :

   ```bash
   curl -i "https://<ref>.functions.supabase.co/generate-chess-rule" \
     -H "Content-Type: application/json" \
     -d '{"prompt":"Une règle originale pour le cavalier"}'
   ```

   Vous devez recevoir un JSON avec la règle générée ou un message d'erreur lié à la validation.

En cas de problème, consultez `supabase/TROUBLESHOOTING.md` pour les erreurs PostgREST fréquentes.
