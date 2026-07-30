#!/usr/bin/env bash
# Cron diario 6am (ART): enriquecimiento TOTAL (todo el pipeline menos CONFORME).
# Refresca LAC-R (norma activo + en fecha), fechas y datos faltantes. Fire-and-forget.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/carrot}"
BASE_URL="${BASE_URL:-http://127.0.0.1:3001}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"

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
  "$BASE_URL/api/cron/enriquecer-total"

echo
