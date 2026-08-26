#!/usr/bin/env bash
set -euo pipefail

# Borra el rastro de ubicación de los técnicos de más de 30 días.
# Una vez por día, de madrugada:
#   40 3 * * * cd /var/www/carrot; bash scripts/run-purgar-ubicaciones-cron.sh >> logs/ubicaciones-cron.log 2>&1
#
# Corre después del backup de las 03:15 para que lo borrado quede en el respaldo del día.

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

echo "[$(date -Is)] purgando ubicaciones"
curl -fsS \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$BASE_URL/api/cron/purgar-ubicaciones"

echo
