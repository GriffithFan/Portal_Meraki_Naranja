#!/usr/bin/env bash
# Cron de los viernes 17:30 (ART): indicador semanal de técnicos activos en
# incidencias de mantenimiento. Corre apenas cierra la semana operativa
# (sábado 06:00 → viernes 17:00) y deja el Excel + el texto del correo listos.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/carrot}"
BASE_URL="${BASE_URL:-http://127.0.0.1:3001}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
SEMANAS="${SEMANAS:-3}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No existe ENV_FILE: $ENV_FILE" >&2
  exit 1
fi

CRON_SECRET="$(grep -m1 '^CRON_SECRET=' "$ENV_FILE" | cut -d= -f2- | sed 's/^"//; s/"$//; s/^'\''//; s/'\''$//')"

if [[ -z "$CRON_SECRET" ]]; then
  echo "CRON_SECRET no configurado" >&2
  exit 1
fi

echo "[$(date '+%F %T')] generando indicador semanal (${SEMANAS} semanas)..."
curl -fsS \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$BASE_URL/api/cron/kpi-mantenimiento?semanas=${SEMANAS}"

echo
