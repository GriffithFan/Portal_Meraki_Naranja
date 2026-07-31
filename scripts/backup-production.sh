#!/usr/bin/env bash
set -euo pipefail

# Backup manual no destructivo para ejecutar en el VPS desde /var/www/carrot.
# Genera dump de PostgreSQL y copia comprimida de uploads sin modificar datos.

APP_DIR="${APP_DIR:-/var/www/carrot}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
# Retención separada: la base (crítica y liviana, ~8MB) se conserva muchos días;
# el tar de uploads es enorme (GBs) y casi no cambia, así que se conserva pocos.
# Esto evita que los backups de uploads llenen el disco (eran ~38GB con 14 copias).
KEEP_DAYS_DB="${KEEP_DAYS_DB:-${KEEP_DAYS:-21}}"
KEEP_DAYS_UPLOADS="${KEEP_DAYS_UPLOADS:-3}"
DB_ONLY="${DB_ONLY:-0}"   # 1 = solo dump de la base (rápido), sin tar de uploads
TS="$(date +%Y%m%d-%H%M%S)"

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"

if [ ! -f ".env" ]; then
  echo "No existe .env en $APP_DIR" >&2
  exit 1
fi

DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL no encontrado en .env" >&2
  exit 1
fi

# pg_dump/libpq no acepta parámetros propios de Prisma en la query string
# (connection_limit, pool_timeout, etc.): los quitamos antes de conectar.
DUMP_URL="${DATABASE_URL%%\?*}"

echo "Creando backup DB..."
pg_dump "$DUMP_URL" | gzip > "$BACKUP_DIR/db-$TS.sql.gz"

if [ "$DB_ONLY" = "1" ]; then
  echo "DB_ONLY=1: se omite el backup de uploads."
elif [ -d "uploads" ]; then
  echo "Creando backup uploads..."
  tar -czf "$BACKUP_DIR/uploads-$TS.tar.gz" uploads
else
  echo "No existe carpeta uploads; se omite backup de archivos."
fi

echo "Limpiando backups DB (>$KEEP_DAYS_DB dias) y uploads (>$KEEP_DAYS_UPLOADS dias)..."
find "$BACKUP_DIR" -type f -name 'db-*.sql.gz' -mtime "+$KEEP_DAYS_DB" -delete
find "$BACKUP_DIR" -type f -name 'uploads-*.tar.gz' -mtime "+$KEEP_DAYS_UPLOADS" -delete

echo "Backups creados en $BACKUP_DIR"
ls -lh "$BACKUP_DIR"/*"$TS"* || true

# Aviso si el disco quedó por encima del 80% (para no repetir el llenado silencioso).
USO_DISCO="$(df -P "$BACKUP_DIR" | awk 'NR==2 {gsub("%","",$5); print $5}')"
if [ -n "${USO_DISCO:-}" ] && [ "$USO_DISCO" -ge 80 ]; then
  echo "AVISO: el disco está al ${USO_DISCO}% después del backup. Revisar espacio." >&2
fi