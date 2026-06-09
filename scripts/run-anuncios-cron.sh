#!/usr/bin/env bash
set -euo pipefail

# Re-notifica los anuncios activos del tablero a los técnicos que aún no los
# leyeron. Pensado para correr cada ~15 min vía crontab.
#   */15 * * * * cd /var/www/carrot; bash scripts/run-anuncios-cron.sh >> logs/anuncios-cron.log 2>&1

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
  "$BASE_URL/api/cron/anuncios"

echo
