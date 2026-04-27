#!/usr/bin/env bash
set -euo pipefail

# Backup manual no destructivo para ejecutar en el VPS desde /var/www/carrot.
# Genera dump de PostgreSQL y copia comprimida de uploads sin modificar datos.

APP_DIR="${APP_DIR:-/var/www/carrot}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
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

echo "Creando backup DB..."
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/db-$TS.sql.gz"

if [ -d "uploads" ]; then
  echo "Creando backup uploads..."
  tar -czf "$BACKUP_DIR/uploads-$TS.tar.gz" uploads
else
  echo "No existe carpeta uploads; se omite backup de archivos."
fi

echo "Limpiando backups con mas de $KEEP_DAYS dias..."
find "$BACKUP_DIR" -type f \( -name 'db-*.sql.gz' -o -name 'uploads-*.tar.gz' \) -mtime "+$KEEP_DAYS" -delete

echo "Backups creados en $BACKUP_DIR"
ls -lh "$BACKUP_DIR"/*"$TS"* || true