#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME=$(basename "$0")
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FUNCTIONS_DIR="$ROOT_DIR/functions"
IMPORT_MAP="$FUNCTIONS_DIR/import_map.json"

usage() {
  cat <<USAGE
Usage: $SCRIPT_NAME [function-name ...]

Deploy all Supabase Edge Functions in the repository (or a subset when names
are provided) using the Supabase CLI.

Required environment variables:
  SUPABASE_ACCESS_TOKEN  Personal access token or service role token
  SUPABASE_PROJECT_ID    Project reference (e.g. abcdefghijklmnop)

Examples:
  $SCRIPT_NAME
  $SCRIPT_NAME chess-insights generate-chess-rule
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI is not installed. Install it from https://supabase.com/docs/guides/cli" >&2
  exit 1
fi

ACCESS_TOKEN=${SUPABASE_ACCESS_TOKEN:-}
PROJECT_ID=${SUPABASE_PROJECT_ID:-${SUPABASE_PROJECT_REF:-}}

if [[ -z "$ACCESS_TOKEN" || -z "$PROJECT_ID" ]]; then
  echo "Both SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID must be set in the environment." >&2
  exit 1
fi

if [[ ! -f "$IMPORT_MAP" ]]; then
  echo "Import map not found at $IMPORT_MAP" >&2
  exit 1
fi

mapfile -t all_functions < <(find "$FUNCTIONS_DIR" -mindepth 1 -maxdepth 1 -type d \
  ! -name '_*' \
  -printf '%f\n' | sort)

if [[ ${#all_functions[@]} -eq 0 ]]; then
  echo "No edge function directories found under $FUNCTIONS_DIR" >&2
  exit 1
fi

if [[ $# -gt 0 ]]; then
  declare -A valid_functions
  for fn in "${all_functions[@]}"; do
    valid_functions[$fn]=1
  done

  selected_functions=()
  for requested in "$@"; do
    if [[ -z ${valid_functions[$requested]+x} ]]; then
      echo "Unknown function: $requested" >&2
      echo "Available functions: ${all_functions[*]}" >&2
      exit 1
    fi
    selected_functions+=("$requested")
  done
else
  selected_functions=("${all_functions[@]}")
fi

export SUPABASE_ACCESS_TOKEN="$ACCESS_TOKEN"

for fn in "${selected_functions[@]}"; do
  echo "Deploying $fn"
  supabase functions deploy "$fn" \
    --project-ref "$PROJECT_ID" \
    --import-map "$IMPORT_MAP"
done

echo "Deployment complete for ${#selected_functions[@]} function(s)."
