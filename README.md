# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/1e794698-feca-4fca-ab3b-11990c0b270d

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/1e794698-feca-4fca-ab3b-11990c0b270d) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Local configuration

Copy `env.example` to `.env` and provide the Supabase project credentials:

```sh
cp env.example .env
```

- `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont requis côté client. Le build Vite échoue si ces variables manquent.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `SUPABASE_DB_URL` sont optionnelles pour l'exécution des scripts et des Edge Functions depuis votre environnement local.

Au démarrage du client (`npm run dev`), l'initialisation du SDK affiche `Supabase URL present` dans la console pour signaler que la configuration est détectée sans exposer la clé publique.

Les Edge Functions n'utilisent plus de passerelle Lovable privée et n'ont besoin que des secrets Supabase standards (URL + clé Service Role) définis via `supabase secrets set`.

## Lovable Cloud Setup

Configurez Supabase afin que les aperçus Lovable fonctionnent avec l'authentification et les Edge Functions :

- **Auth → Site URL** : domaine de production Lovable (`https://<project>.lovable.app`).
- **Auth → Additional Redirect URLs** : domaine de prévisualisation Lovable (`https://preview-*.lovable.app`).
- **API → Allowed Origins** : ajoutez les domaines de prévisualisation et de production Lovable pour autoriser les appels REST et Edge Functions depuis ces environnements.

La CI Lovable doit fournir `SUPABASE_DB_URL` afin d'appliquer les migrations avant la mise en production.

## QA & smoke tests

Avant chaque livraison, validez la connexion Supabase à l'aide du client partagé :

1. `supabase.auth.signInWithOtp` avec une adresse de test et vérifiez la réception du lien magique.
2. `supabase.auth.getSession` pour confirmer la persistance de session dans le navigateur.
3. Un `select` sur une table publique (ex : `lobbies`) afin de s'assurer que la politique CORS autorise Lovable.
4. Un `insert` sur une table protégée par RLS via une Edge Function ou l'API REST pour valider les politiques.

La console du navigateur ne doit afficher aucune lecture de variables `import.meta.env` sans préfixe `VITE_`.

## Supabase migrations

The tournament Edge Functions expect the Supabase schema defined in `supabase/migrations`. The Express tournament service
automatically attempts to run these migrations at startup whenever a Supabase connection string is available. To apply them
manually (or from CI), run the new migration helper from the project root:

```sh
SUPABASE_DB_URL="postgresql://postgres:<your-db-password>@db.ucaqbhmyutlnitnedowk.supabase.co:6543/postgres?pgbouncer=true&sslmode=require" \
npm run supabase:migrate
```

The script reads every SQL file in `supabase/migrations`, applies pending migrations inside a transaction, and records the
applied versions in `supabase_migrations.schema_migrations`. Afterward it automatically triggers
`pg_notify('pgrst','reload schema')` so PostgREST refreshes the new tables/views. You can also provide the connection string
through the `SUPABASE_DB_CONNECTION_STRING` or `DATABASE_URL` environment variables when running the command.

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/1e794698-feca-4fca-ab3b-11990c0b270d) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
