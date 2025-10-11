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

This project now targets the Supabase instance available at `https://ucaqbhmyutlnitnedowk.supabase.co`. Update your local `.env` file with the corresponding project reference, REST URL, and anon publishable key from **Project Settings → API** before starting the Vite dev server. The Supabase CLI also needs the same project reference to deploy edge functions and run migrations.

Some serverless features depend on the Lovable AI gateway. Both edge functions under `supabase/functions` require the `LOVABLE_API_KEY` secret to be present in the Supabase project so that they can authenticate against the gateway.

Set the secret with the Supabase CLI from the root of the repository (replace `sk_live_xxx` with your real key):

```sh
npx supabase secrets set LOVABLE_API_KEY=sk_live_xxx
```

If you do not use the CLI, the secret can also be configured from the Supabase dashboard by navigating to **Project Settings → API → Secrets** and adding a new entry named `LOVABLE_API_KEY`.

Whenever the secret is updated, redeploy the edge functions so they pick up the latest value:

```sh
npx supabase functions deploy generate-chess-rule chess-insights
```

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
