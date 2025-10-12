# AI.Chess.Architects — Post-Game Coach Pack

## Quickstart
1) `pnpm i`
2) Remplis `.env` (voir `.env.example`)
3) Applique la migration : `supabase db reset` (ou `psql -f supabase/migrations/000_init.sql`)
4) Dev:
   - API: `pnpm --filter @apps/coach-api dev`
   - Worker: `pnpm --filter @apps/coach-worker dev`
   - (Optionnel) Intègre `@packages/ui-coach` dans ton front

## Flux
- POST /coach/games/ingest → crée game+moves
- POST /coach/analyses/:gameId/queue → job d'analyse
- Worker → Stockfish (depth 16-22, multiPV=3) → classifier EP → LLM → persist
- GET /coach/analyses/:gameId/report → rapport complet (résumé, key moments, move_evals)

## Notes
- Engine: `stockfish.wasm` (lib npm `stockfish`) en Node via worker thread
- LLM: abstrait (Lovable, Groq, Gemini), sortie JSON validée
- Cache de positions par hash FEN pour éviter les recalculs
