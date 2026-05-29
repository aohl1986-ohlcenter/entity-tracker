#!/usr/bin/env bash
# Pusht alle Env-Vars aus .env.local nach Vercel (production + preview + dev).
# Vorher ausführen:
#   vercel login
#   vercel link --yes
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

# Welche Vars wir setzen wollen (Reihenfolge = Doku-Reihenfolge)
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
  for ENV in production preview development; do
    # Vercel CLI fragt sonst nach Eingabe — Wert via stdin
    echo "==> $VAR ($ENV)"
    vercel env rm "$VAR" "$ENV" --yes 2>/dev/null || true
    printf '%s' "$VALUE" | vercel env add "$VAR" "$ENV"
  done
done

echo "Done. Verify with: vercel env ls"
