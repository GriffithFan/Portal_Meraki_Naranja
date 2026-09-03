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
  if [[ "${FORZAR_REBUILD:-}" == "1" ]]; then
    echo "  FORZAR_REBUILD=1: se reconstruye igual"
  elif [[ -t 0 ]]; then
    echo -e "${YELLOW}  ¿Forzar rebuild? (s/n):${NC}"
    read -r FORCE
    [[ "$FORCE" != "s" ]] && exit 0
  else
    # Sin terminal (deploy por ssh no interactivo) `read` lee EOF y el script cortaba
    # con error, sin llegar a los pasos siguientes. Salir limpio es lo correcto: no
    # hay nada nuevo que desplegar. Para reconstruir igual: FORZAR_REBUILD=1.
    echo "  Sin cambios y sin terminal interactiva: no se reconstruye."
    echo "  (para forzarlo:  FORZAR_REBUILD=1 bash scripts/update.sh)"
    exit 0
  fi
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

# ── Herramientas de Salesforce (actas y extractor) ───────────
# actas-gen/ y extractor/ estan en .gitignore (guardan credenciales, cache y venv),
# asi que el pull no los toca: la copia versionada no llegaba nunca a produccion y
# editarla no cambiaba nada. Se copian solo los .py; el venv, el .docx y todo lo que
# no este en git se deja como esta.
sincronizar_py() {
  local origen="$1" destino="$2" etiqueta="$3"
  [[ -d "$origen" && -d "$destino" ]] || return 0
  local cambiados=0
  for f in "$origen"/*.py; do
    [[ -e "$f" ]] || continue
    local base
    base=$(basename "$f")
    # Solo se pisa lo que ya existe en produccion: los .py sueltos de exploracion
    # que viven solo en el servidor no se tocan, y los de git que no estan alla
    # tampoco se copian sin querer.
    if [[ -f "$destino/$base" ]] && ! cmp -s "$f" "$destino/$base"; then
      cp "$f" "$destino/$base"
      cambiados=$((cambiados + 1))
    fi
  done
  [[ $cambiados -gt 0 ]] && ok "$etiqueta: $cambiados script(s) actualizados" \
                         || echo "  $etiqueta sin cambios"
}

sincronizar_py "herramientas/Generador de actas" actas-gen "Generador de actas"
sincronizar_py herramientas/extractor extractor "Extractor"

# ── Prisma ───────────────────────────────────────────────────
step "3/5  Sincronizando base de datos"
# --schema explícito: evita que un schema.prisma suelto en la raíz secuestre
# generate/db push (Prisma toma el de la raíz por defecto si existe).
PRISMA_SCHEMA="./prisma/schema.prisma"
if [[ -f ./schema.prisma ]]; then
  warn "Detectado ./schema.prisma en la raíz (no canónico) — se ignora; el válido es ${PRISMA_SCHEMA}"
fi
npx prisma generate --schema "$PRISMA_SCHEMA" 2>&1 | tail -1
npx prisma db push --schema "$PRISMA_SCHEMA" --accept-data-loss 2>&1 | tail -3
ok "Schema de BD actualizado"

# ── Build ────────────────────────────────────────────────────
step "4/5  Construyendo aplicación"
# Se construye en .next-build y recien al final se cambia por .next, con un mv que es
# atomico. Construir sobre .next en caliente deja al server viejo sirviendo un build a
# medio escribir: los chunks que ya mando al navegador desaparecen y el usuario ve la
# pantalla rota hasta que hace Ctrl+Shift+R. La ventana pasa de minutos a milisegundos.
rm -rf .next-build
NEXT_DIST_DIR=.next-build npm run build 2>&1 | tail -5
if [[ ! -f .next-build/BUILD_ID ]]; then
  echo "El build no genero .next-build/BUILD_ID — se aborta y queda corriendo la version anterior" >&2
  exit 1
fi
ok "Build completado"

# ── PM2 restart ──────────────────────────────────────────────
step "5/5  Reiniciando servidor"
rm -rf .next-anterior
[[ -d .next ]] && mv .next .next-anterior
mv .next-build .next
pm2 restart carrot
ok "PM2 reiniciado"

# ── Warm-up ──────────────────────────────────────────────────
echo -n "  Esperando arranque"
for i in $(seq 1 20); do
  # /api/health y no /carrot: no hay basePath configurado, asi que /carrot siempre
  # devolvio 404 y este loop esperaba los 40 segundos completos en cada deploy sin
  # llegar a confirmar nada.
  if curl -sf "http://localhost:${APP_PORT}/api/health" >/dev/null 2>&1; then
    echo ""
    ok "Servidor respondiendo"
    break
  fi
  echo -n "."
  sleep 2
done

# Pre-calentar rutas
for path in "/login" "/dashboard"; do
  curl -sf "http://localhost:${APP_PORT}${path}" >/dev/null 2>&1 || true
done

echo ""
echo -e "${GREEN}═══ 🥕 Actualización completada (${AFTER:0:7}) ═══${NC}"
echo -e "  pm2 logs carrot  — para ver logs"
echo ""

# El build anterior se conserva hasta despues del arranque, por si hay que volver.
rm -rf .next-anterior
