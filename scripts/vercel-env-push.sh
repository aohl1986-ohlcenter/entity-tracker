#!/usr/bin/env bash
# Pusht alle Env-Vars aus .env.local nach Vercel (production + preview + dev).
# Vorher ausführen:
#   vercel login
#   vercel link --yes --project entity-tracker --scope <team>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

VARS=(
  DATABASE_URL
  SERPER_API_KEY
  GEMINI_API_KEY
  GEMINI_MODEL
  CRON_SECRET
  DEFAULT_ENTITY_SLUG
)

for VAR in "${VARS[@]}"; do
  VALUE=$(grep -E "^${VAR}=" "$ENV_FILE" | head -1 | cut -d= -f2-)
  if [[ -z "$VALUE" ]]; then
    echo "WARN: $VAR not set in .env.local — skipping"
    continue
  fi
  echo "==> $VAR (production)"
  vercel env rm "$VAR" production --yes 2>/dev/null || true
  vercel env add "$VAR" production --value "$VALUE" --yes
done

echo
echo "Done. Verify with: vercel env ls"
