#!/usr/bin/env bash
set -euo pipefail

# Utility script to deploy every Edge Function defined in supabase/functions
# Usage: ./supabase/deploy-edge-functions.sh [--dry-run]

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI introuvable. Installez-le via https://supabase.com/docs/guides/cli avant de continuer." >&2
  exit 1
fi

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
if [[ -z "$PROJECT_REF" ]]; then
  if [[ -f "supabase/config.toml" ]]; then
    PROJECT_REF=$(sed -n 's/^project_id\s*=\s*"\(.*\)"/\1/p' supabase/config.toml | head -n1)
  fi
fi

if [[ -z "$PROJECT_REF" ]]; then
  cat <<'MSG' >&2
Impossible de déterminer l'identifiant du projet Supabase.
Définissez la variable d'environnement SUPABASE_PROJECT_REF ou complétez le champ project_id dans supabase/config.toml.
MSG
  exit 1
fi

FUNCTIONS=(
  "chess-insights"
  "generate-chess-rule"
  "load-user-games"
  "record-user-game"
  "report-tournament-match"
  "sync-tournaments"
  "tournament-matchmaking"
)

if [[ "$DRY_RUN" == true ]]; then
  echo "[dry-run] Les fonctions suivantes seraient déployées sur le projet '$PROJECT_REF':"
  printf '  - %s\n' "${FUNCTIONS[@]}"
  exit 0
fi

for fn in "${FUNCTIONS[@]}"; do
  echo "Déploiement de l'Edge Function '$fn' sur le projet '$PROJECT_REF'..."
  supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
done

echo "Toutes les Edge Functions ont été déployées. Pensez à définir SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY via 'supabase secrets set' si ce n'est pas déjà fait."
