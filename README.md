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

The only requirement is having Node.js & pnpm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating) and [pnpm](https://pnpm.io/installation).

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
pnpm install

# Step 4: Start the development server with auto-reloading and an instant preview.
pnpm run dev
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

## Workspace layout

The repository follows a lightweight monorepo layout so that the API, worker, SDK, and UI can iterate at their own pace. The two
top-level folders you will interact with are:

- `apps/` â€“ runtime entry points. `coach-api` exposes the REST facade while `coach-worker` hosts the Stockfish + LLM analysis
  pipeline.
- `packages/` â€“ shared libraries. `engine` ships the WASM and UCI bridges to Stockfish, `llm` orchestrates providers, `sdk`
  wraps the REST endpoints, and `ui-coach` exposes composable React widgets.

Each package can be built and tested independently with `pnpm -r run build` / `pnpm -r run test` from the repository root.

## FX runtime (GSAP + Pixi.js)

The repository includes a modular FX system located under `src/fx`. It exposes:

- `FxProvider` & `useFxTrigger` (wrap your chess board and trigger intents at runtime),
- a Pixi.js based renderer with GSAP timelines (`registry.ts`),
- a small NLP lexicon `FxLexicon` capable of mapping textual rule descriptions to normalised FX intents,
- `runFxIntents()` helper used by the rules engine to connect generated rule metadata with visual effects.

Effects are defined declaratively via JSON `fxIntents` descriptors (generated together with your chess rules). The resolver automatically picks the proper GSAP / Pixi routines: mines spawning, area hazards, holograms, warps, trails, explosionsâ€¦ All the heavy lifting (glow filters, particle pools, easing & clean-up) lives inside `fx/registry.ts`, which you can extend with additional shaders, spritesheets or Rive/Lottie assets.

To wire it to the board, wrap your board container inside `<FxProvider>` and call `triggerFx(intents, payload)` whenever an engine event fires (piece move, capture, trap activation, etc.). The provider takes care of mounting a transparent Pixi canvas above the board, resizing it, and orchestrating the timelines.

## Local configuration

Some serverless features depend on an external AI provider. The edge functions under `supabase/functions` will automatically use the first configured secret among `LOVABLE_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY`. At least one of these secrets must be present in the Supabase project so that the rule generator and the coach can authenticate against the selected API.

> â„¹ï¸ **Provider selection & fallbacks** â€“ By default the functions try to route traffic through Lovable. If `LOVABLE_API_KEY` is not defined, they fall back to any other provider that has a key set; otherwise they return a `503` with a descriptive error. When running locally, either set `LOVABLE_API_KEY` or point `AI_PROVIDER` to `openai`, `groq`, or `gemini` and provide the corresponding key.

> â„¹ï¸ **ModÃ¨le local** â€“ Le compilateur de rÃ¨gles (`supabase/functions/generate-chess-rule`) cible d'abord l'instance d'infÃ©rence locale (`LOCAL_RULE_MODEL_URL`). Il n'exige pas de clÃ© `OPENAI_API_KEY` ou `OPENROUTER_API_KEY`Â : si aucune n'est fournie, la fonction envoie simplement la requÃªte sans en-tÃªte `Authorization`.

### Modèle local (LAN)

Utilisez un endpoint OpenAI‑compatible sur votre réseau local et configurez:

- `LOCAL_RULE_MODEL_URL` ou `OPENAI_BASE_URL` → `http://192.168.0.33:1234`
- `OPENAI_MODEL` → `openai/gpt-oss-20b`

Toutes les fonctionnalités IA (Coach, Insights, Générateur) ciblent désormais
prioritairement cet endpoint local, sans clé API requise.
### Supabase & Lovable AI integration

This repository already ships with the Supabase configuration generated by Lovable AI. All database tables, types, and edge
functions live under the `supabase/` directory and are wired to the same Lovable AI gateway that powers the in-app chatbot.

- **Projet Supabase verrouillÃ©** â€“ Toutes les configurations (clients web, scripts Node et edge functions) ciblent le projet Supabase
  **Youaregood** (`pfcaolibtgvynnwaxvol`). Si tu modifies les variables d'environnement, vÃ©rifie qu'elles continuent de pointer
  vers cet identifiant et ce jeu de tables.
- **Reuse the provided project** â€“ keep using the Supabase project ID and anon key from the existing `.env` file so the web
  client and serverless functions continue to point to the Lovable-managed instance.
- **Deploy edge functions from this folder** â€“ when you push updates to `supabase/functions/*`, redeploy them with the
  Supabase CLI to ensure the Lovable AI gateway secret is picked up.
- **Migrations are tracked here** â€“ any schema change should be captured with `npx supabase migration new` so the Lovable AI
  workspace and this repo stay in sync.

By keeping the same Supabase folder and Lovable API configuration, the chatbot and tournament features stay connected to the
shared Lovable AI services without additional setup.

#### Base de donnÃ©es & migrations

Le fichier `.env` (ainsi que ses variantes `preview` et `production`) inclut maintenant la variable `SUPABASE_DB_URL` qui pointe vers la base de donnÃ©es Supabase fournie (`postgresql://postgres:[YOUR_PASSWORD]@db.pfcaolibtgvynnwaxvol.supabase.co:5432/postgres`).

Pour crÃ©er les tables manquantes et appliquer les migrations SQL prÃ©sentes dans `supabase/migrations`, tu peux maintenant t'appuyer sur la commande officielle Supabase (ce qui garantit le bon fonctionnement du coach IA, du gÃ©nÃ©rateur de rÃ¨gles et des tournois connectÃ©s au projet Lovable)Â :

```bash
pnpm run db:push
```

La commande encapsule `npx supabase db push` en ciblant automatiquement la base Lovable (`SUPABASE_DB_URL`) et le projet `pfcaolibtgvynnwaxvol`. Elle peut Ãªtre utilisÃ©e telle quelle dans GitHub Actions ou sur ta machine locale.

Si tu travailles dans un environnement dÃ©pourvu du CLI Supabase, l'ancien script reste disponibleÂ :

```bash
pnpm run db:migrate
```

Ce dernier constitue une alternative directe qui n'a besoin que de Node.js.

Le script `scripts/run-supabase-migrations.mjs` applique chaque fichier `.sql` dans l'ordre en veillant Ã  activer TLS (`sslmode=require`). Assure-toi simplement que la machine qui exÃ©cute ce script peut Ã©tablir une connexion rÃ©seau vers l'hÃ´te Supabase (IPv4 ou IPv6).

Une fois les nouvelles tables et vues crÃ©Ã©es, force un rafraÃ®chissement du cache PostgREST afin que `/rest/v1/tournaments` et les vues associÃ©es soient visibles immÃ©diatementÂ :

```bash
pnpm run postgrest:reload
```

La commande exÃ©cute `select pg_notify('pgrst','reload schema');` via la mÃªme connexion SSL, ce qui Ã©vite d'avoir Ã  redÃ©marrer manuellement l'API depuis le tableau de bord Supabase.

Set one of the supported secrets with the Supabase CLI from the root of the repository (replace the placeholder with your real key). Examples:

```sh
npx supabase secrets set LOVABLE_API_KEY=sk_live_xxx
npx supabase secrets set GROQ_API_KEY=gsk_xxx
npx supabase secrets set OPENAI_API_KEY=sk-proj-xxx
npx supabase secrets set GEMINI_API_KEY=ya29.xxx
```

You can optionally define `AI_PROVIDER` to force a specific provider when multiple keys are present (`lovable`, `groq`, `openai`, or `gemini`). Each provider also accepts an optional model override via `LOVABLE_MODEL`, `GROQ_MODEL`, `OPENAI_MODEL`, or `GEMINI_MODEL`.

If you do not use the CLI, the secrets can also be configured from the Supabase dashboard by navigating to **Project Settings â†’ API â†’ Secrets** and adding new entries with the appropriate names.

Whenever the secret is updated, redeploy the edge functions so they pick up the latest value:

```sh
npx supabase functions deploy \
  generate-chess-rule \
  chess-insights \
  sync-tournaments \
  tournament-matchmaking \
  report-tournament-match
```

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/1e794698-feca-4fca-ab3b-11990c0b270d) and click on Share -> Publish.

### Synchroniser le build Lovable depuis la CLI

Le script `pnpm run build` dÃ©clenche dÃ©sormais automatiquement un webhook Lovable si l'une des variables suivantes est dÃ©finieÂ :

- `LOVABLE_DEPLOY_HOOK`
- `LOVABLE_DEPLOY_URL`
- `LOVABLE_DEPLOY_ENDPOINT`

Configure ce hook (gÃ©nÃ©ralement disponible dans l'onglet **Settings â†’ Deploy hooks** de Lovable) dans ton environnement CI/CD afin qu'un `pnpm run build` local ou sur GitHub Actions rafraÃ®chisse instantanÃ©ment le build Lovable. Des options supplÃ©mentaires sont disponiblesÂ :

- `LOVABLE_DEPLOY_METHOD` (par dÃ©faut `POST`)
- `LOVABLE_DEPLOY_HEADERS` (objet JSON sÃ©rialisÃ© pour ajouter des en-tÃªtes personnalisÃ©s)
- `LOVABLE_DEPLOY_SECRET` (ajout automatique d'un header `Authorization: Bearer ...`)
- `LOVABLE_DEPLOY_BODY` (payload envoyÃ© pour les mÃ©thodes autres que `GET/HEAD`)
- `LOVABLE_DEPLOY_TIMEOUT_MS` (dÃ©lai avant expiration, par dÃ©faut `15000`)

En cas d'absence de configuration, le build local se poursuit normalement sans provoquer d'erreur.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Deploying Supabase Edge Functions

To publish the serverless functions located in `supabase/functions/`, configure
GitHub repository secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_ID` and
run the "Deploy Supabase Edge Functions" workflow from the Actions tab. For
step-by-step instructions and a local CLI alternative, see
[docs/supabase-edge-deployment.md](docs/supabase-edge-deployment.md).
