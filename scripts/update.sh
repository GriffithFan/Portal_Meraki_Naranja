#!/bin/bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
#  Carrot — Actualización rápida desde GitHub
#  Uso: bash scripts/update.sh
# ═══════════════════════════════════════════════════════════════

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'

ok()   { echo -e "${GREEN}✔${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✖ $1${NC}"; exit 1; }
step() { echo -e "\n${CYAN}═══ $1 ═══${NC}"; }

DEPLOY_DIR="/var/www/carrot"
APP_PORT=3001

cd "$DEPLOY_DIR" || fail "No se encontró ${DEPLOY_DIR}"

# ── Verificar que es un repo git ─────────────────────────────
[[ -d .git ]] || fail "No es un repositorio git"

# ── Pull ─────────────────────────────────────────────────────
step "1/5  Descargando cambios"
BEFORE=$(git rev-parse HEAD)
git pull --ff-only
AFTER=$(git rev-parse HEAD)

if [[ "$BEFORE" == "$AFTER" ]]; then
  ok "Ya estás en la última versión (${AFTER:0:7})"
  echo -e "${YELLOW}  ¿Forzar rebuild? (s/n):${NC}"
  read -r FORCE
  [[ "$FORCE" != "s" ]] && exit 0
fi

COMMITS=$(git log --oneline "${BEFORE}..${AFTER}" 2>/dev/null | head -10)
if [[ -n "$COMMITS" ]]; then
  echo -e "  Commits nuevos:"
  echo "$COMMITS" | sed 's/^/    /'
fi

# ── Instalar dependencias ───────────────────────────────────
step "2/5  Instalando dependencias"
npm ci 2>&1 | tail -1
ok "Dependencias actualizadas"

# ── Prisma ───────────────────────────────────────────────────
step "3/5  Sincronizando base de datos"
npx prisma generate 2>&1 | tail -1
npx prisma db push --accept-data-loss 2>&1 | tail -3
ok "Schema de BD actualizado"

# ── Build ────────────────────────────────────────────────────
step "4/5  Construyendo aplicación"
npm run build 2>&1 | tail -5
ok "Build completado"

# ── PM2 restart ──────────────────────────────────────────────
step "5/5  Reiniciando servidor"
pm2 restart carrot
ok "PM2 reiniciado"

# ── Warm-up ──────────────────────────────────────────────────
echo -n "  Esperando arranque"
for i in $(seq 1 20); do
  if curl -sf "http://localhost:${APP_PORT}/carrot" >/dev/null 2>&1; then
    echo ""
    ok "Servidor respondiendo"
    break
  fi
  echo -n "."
  sleep 2
done

# Pre-calentar rutas
for path in "/carrot" "/carrot/login"; do
  curl -sf "http://localhost:${APP_PORT}${path}" >/dev/null 2>&1 || true
done

echo ""
echo -e "${GREEN}═══ 🥕 Actualización completada (${AFTER:0:7}) ═══${NC}"
echo -e "  pm2 logs carrot  — para ver logs"
echo ""
