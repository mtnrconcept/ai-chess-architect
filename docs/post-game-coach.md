# Post-Game Coach Integration Guide

This document explains how to run the post-game coaching pipeline inside the workspace. The project is organised as a classic
`apps/` + `packages/` monorepo so that the worker, API, SDK, and UI can evolve independently.

## Project layout

```
apps/
  coach-api/          # REST facade, usable as Supabase Edge Function or Node microservice
  coach-worker/       # Analysis pipeline (queue worker)
packages/
  engine/             # Stockfish bridges (WASM controller + UCI wrapper)
  llm/                # Provider-agnostic LLM abstraction (Lovable, Groq, Gemini)
  sdk/                # TypeScript SDK for easy client integration
  ui-coach/           # React components to render a Chess.com-style review
supabase/
  migrations/000_post_game_coach.sql
docs/post-game-coach.md
```

## Installation

The repository now uses PNPM workspaces. Install dependencies from the project root:

```bash
pnpm install
```

Build all packages (ensures type checking across workspaces):

```bash
pnpm -r run build
```

## Environment variables

Copy `.env.example` to `.env` and configure the following secrets:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: required by the API layer to persist analyses.
- `LLM_PROVIDER` and provider-specific keys (`LOVABLE_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`). The LLM provider automatically falls back when a key is missing.

## Database migrations

Apply the migrations with the provided helper script (requires network access to Supabase):

```bash
pnpm run db:migrate
```

The `000_post_game_coach.sql` migration creates the `games`, `moves`, `analyses`, `move_evals`, `coach_reports`, and `provider_logs` tables, alongside the `move_quality` enum and RLS policies matching the ownership model.

## Running the worker locally

```bash
pnpm --filter coach-worker run dev
```

Provide PGNs or parsed moves to the worker via the REST API or by invoking the `AnalysisPipeline` directly.

## REST API

The API is exposed under the `/api/coach` prefix. Example workflow:

1. `POST /api/coach/games/ingest` – Upload a PGN or move list.
2. `POST /api/coach/analyses/:gameId/queue` – Queue the analysis job.
3. `GET /api/coach/analyses/:gameId/status` – Poll until the status is `done`.
4. `GET /api/coach/analyses/:gameId/report` – Fetch the aggregated move evaluations and executive summary.

The included SDK wraps these calls via `packages/sdk`.

## UI components

Import the React components from `packages/ui-coach` to display the post-game review:

```tsx
import { ReportViewer } from 'packages/ui-coach';
```

Populate the props with the data returned by the REST API or SDK.

## Testing

Vitest configurations live under `configs/quality/vitest.config.base.ts`. Each workspace can extend the base config to add suites for the classifier, PGN parser, and UI smoke tests.

## Sample PGN

The repository ships with a PGN used in unit tests (see the prompt in `docs/post-game-coach.md`). Use it to validate the end-to-end flow.
