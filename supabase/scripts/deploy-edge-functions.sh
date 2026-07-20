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
  SUPABASE_PROJECT_REF_CONFIRMATION  Must exactly match SUPABASE_PROJECT_ID

Examples:
  $SCRIPT_NAME
  $SCRIPT_NAME chess-insights generate-chess-rule
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

ACCESS_TOKEN=${SUPABASE_ACCESS_TOKEN:-}
PROJECT_ID=${SUPABASE_PROJECT_ID:-${SUPABASE_PROJECT_REF:-}}
PROJECT_CONFIRMATION=${SUPABASE_PROJECT_REF_CONFIRMATION:-}
SUPABASE_CLI_VERSION=2.109.1

if [[ -z "$ACCESS_TOKEN" || -z "$PROJECT_ID" || -z "$PROJECT_CONFIRMATION" ]]; then
  echo "SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_ID and SUPABASE_PROJECT_REF_CONFIRMATION are required." >&2
  exit 1
fi

if [[ ! "$PROJECT_ID" =~ ^[a-z0-9]{15,40}$ || "$PROJECT_CONFIRMATION" != "$PROJECT_ID" ]]; then
  echo "The confirmed project reference is invalid or does not match SUPABASE_PROJECT_ID." >&2
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

protected_functions=(
  compile-chess-rule
  compile-rule-presentation
  publish-rule-version
  create-rule-lobby-v2
  join-rule-lobby-v2
  process-chess-move
)

if [[ $# -eq 0 ]]; then
  legacy_functions=()
  for fn in "${selected_functions[@]}"; do
    is_v2=false
    for protected_fn in "${protected_functions[@]}"; do
      if [[ "$fn" == "$protected_fn" ]]; then
        is_v2=true
        break
      fi
    done
    if [[ "$is_v2" == false ]]; then
      legacy_functions+=("$fn")
    fi
  done
  selected_functions=("${legacy_functions[@]}")
fi

for fn in "${selected_functions[@]}"; do
  for protected_fn in "${protected_functions[@]}"; do
    if [[ "$fn" == "$protected_fn" ]]; then
      echo "Protected Edge function '$fn' must be deployed through the protected GitHub workflow." >&2
      exit 1
    fi
  done
done

# Install/resolve the immutable npm version before exposing the token to the
# child process. The authenticated deployment then runs from the local cache.
env -u SUPABASE_ACCESS_TOKEN \
  npx --yes "supabase@${SUPABASE_CLI_VERSION}" --version >/dev/null
export SUPABASE_ACCESS_TOKEN="$ACCESS_TOKEN"

for fn in "${selected_functions[@]}"; do
  echo "Deploying $fn"
  npx --offline --yes "supabase@${SUPABASE_CLI_VERSION}" functions deploy "$fn" \
    --project-ref "$PROJECT_ID" \
    --import-map "$IMPORT_MAP"
done

echo "Deployment complete for ${#selected_functions[@]} function(s)."
