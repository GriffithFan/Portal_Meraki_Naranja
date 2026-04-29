#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/carrot}"
BASE_URL="${BASE_URL:-http://127.0.0.1:3001}"
TIPO="${1:-diario}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
DRY_RUN="${DRY_RUN:-false}"

if [[ "$TIPO" != "diario" && "$TIPO" != "semanal" ]]; then
  echo "Uso: $0 [diario|semanal]" >&2
  exit 2
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No existe ENV_FILE: $ENV_FILE" >&2
  exit 1
fi

CRON_SECRET="$(grep -m1 '^CRON_SECRET=' "$ENV_FILE" | cut -d= -f2- | sed 's/^"//; s/"$//; s/^'\''//; s/'\''$//')"

if [[ -z "$CRON_SECRET" ]]; then
  echo "CRON_SECRET no configurado" >&2
  exit 1
fi

curl -fsS \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$BASE_URL/api/cron/reportes?tipo=$TIPO&dryRun=$DRY_RUN"

echo