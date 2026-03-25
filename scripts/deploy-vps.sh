#!/bin/bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
#  Carrot — Deploy automático en VPS Ubuntu
#  Uso: curl -sL <raw-url> | bash
#    o: bash scripts/deploy-vps.sh
# ═══════════════════════════════════════════════════════════════

# ── Colores ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'

ok()   { echo -e "${GREEN}✔${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✖ $1${NC}"; exit 1; }
step() { echo -e "\n${CYAN}═══ $1 ═══${NC}"; }

# ── Configuración ────────────────────────────────────────────
REPO="${REPO_URL:?Error: Definí REPO_URL antes de ejecutar este script}"
DEPLOY_DIR="${DEPLOY_DIR:-/var/www/app}"
APP_PORT="${APP_PORT:-3001}"
DB_NAME="${DB_NAME:-app_db}"
DB_USER="${DB_USER:-app_user}"
NODE_MAJOR=20

# ── Verificar root / sudo ───────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  fail "Ejecutá este script con sudo: sudo bash scripts/deploy-vps.sh"
fi

REAL_USER="${SUDO_USER:-$USER}"

# ═══════════════════════════════════════════════════════════════
#  PASO 1 — Dependencias del sistema
# ═══════════════════════════════════════════════════════════════
step "1/8  Instalando dependencias del sistema"

apt-get update -qq

# Node.js 20
if ! command -v node &>/dev/null || [[ ! "$(node -v)" =~ ^v${NODE_MAJOR} ]]; then
  warn "Instalando Node.js ${NODE_MAJOR}..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null 2>&1
  apt-get install -y nodejs -qq
fi
ok "Node.js $(node -v)"

# PM2
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2 --silent
fi
ok "PM2 $(pm2 -v)"

# PostgreSQL
if ! command -v psql &>/dev/null; then
  apt-get install -y postgresql postgresql-contrib -qq
  systemctl enable postgresql
  systemctl start postgresql
fi
ok "PostgreSQL $(psql --version | awk '{print $3}')"

# Nginx
if ! command -v nginx &>/dev/null; then
  apt-get install -y nginx -qq
  systemctl enable nginx
fi
ok "Nginx $(nginx -v 2>&1 | awk -F/ '{print $2}')"

# Git
if ! command -v git &>/dev/null; then
  apt-get install -y git -qq
fi
ok "Git $(git --version | awk '{print $3}')"

# ═══════════════════════════════════════════════════════════════
#  PASO 2 — Base de datos PostgreSQL
# ═══════════════════════════════════════════════════════════════
step "2/8  Configurando PostgreSQL"

DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)

# Crear usuario si no existe
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  ok "Usuario ${DB_USER} ya existe"
  echo -e "${YELLOW}  → Ingresá la contraseña existente del usuario ${DB_USER}:${NC}"
  read -rs EXISTING_PASS
  if [[ -n "$EXISTING_PASS" ]]; then
    DB_PASS="$EXISTING_PASS"
  fi
else
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" >/dev/null 2>&1
  ok "Usuario ${DB_USER} creado"
fi

# Crear base de datos si no existe
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  ok "Base de datos ${DB_NAME} ya existe"
else
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" >/dev/null 2>&1
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" >/dev/null 2>&1
  ok "Base de datos ${DB_NAME} creada"
fi

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"

# ═══════════════════════════════════════════════════════════════
#  PASO 3 — Clonar / actualizar repositorio
# ═══════════════════════════════════════════════════════════════
step "3/8  Obteniendo código fuente"

mkdir -p "$DEPLOY_DIR"
chown "$REAL_USER":"$REAL_USER" "$DEPLOY_DIR"

if [[ -d "${DEPLOY_DIR}/.git" ]]; then
  ok "Repositorio ya existe — actualizando..."
  sudo -u "$REAL_USER" git -C "$DEPLOY_DIR" pull --ff-only
else
  sudo -u "$REAL_USER" git clone "$REPO" "$DEPLOY_DIR"
  ok "Repositorio clonado"
fi

cd "$DEPLOY_DIR"

# ═══════════════════════════════════════════════════════════════
#  PASO 4 — Variables de entorno (.env)
# ═══════════════════════════════════════════════════════════════
step "4/8  Configurando .env"

JWT_SECRET=$(openssl rand -base64 48 | tr -d '/+=' | head -c 64)

if [[ -f .env ]]; then
  warn ".env ya existe — no se sobreescribirá"
  ok "Revisá que contenga DATABASE_URL, JWT_SECRET, etc."
else
  # Pedir la API key de Meraki
  echo -e "${YELLOW}  → Ingresá tu Meraki API Key (o dejá vacío para configurar después):${NC}"
  read -rs MERAKI_KEY

  # Pedir URL del sitio (para NEXTAUTH_URL)
  echo -e "${YELLOW}  → URL del sitio (ej: https://thnet.com/carrot) [https://thnet.com/carrot]:${NC}"
  read -r SITE_URL
  SITE_URL="${SITE_URL:-https://thnet.com/carrot}"

  cat > .env <<EOF
# ─── Database ────────────────────────────────────
DATABASE_URL="${DATABASE_URL}"

# ─── Auth ────────────────────────────────────────
JWT_SECRET="${JWT_SECRET}"
NEXTAUTH_URL="${SITE_URL}"

# ─── Next.js ─────────────────────────────────────
NEXT_PUBLIC_BASE_PATH="/carrot"
NODE_ENV="production"
PORT=${APP_PORT}

# ─── Meraki API ──────────────────────────────────
MERAKI_API_KEY="${MERAKI_KEY}"
EOF

  chmod 600 .env
  chown "$REAL_USER":"$REAL_USER" .env
  ok ".env creado (permisos 600)"
fi

# ═══════════════════════════════════════════════════════════════
#  PASO 5 — Instalar, generar Prisma y construir
# ═══════════════════════════════════════════════════════════════
step "5/8  Instalando dependencias y construyendo"

sudo -u "$REAL_USER" npm ci --omit=dev 2>&1 | tail -1
ok "npm ci completado"

sudo -u "$REAL_USER" npx prisma generate 2>&1 | tail -1
ok "Prisma client generado"

sudo -u "$REAL_USER" npx prisma db push --accept-data-loss 2>&1 | tail -3
ok "Schema sincronizado con PostgreSQL"

sudo -u "$REAL_USER" npm run build 2>&1 | tail -5
ok "Next.js build completado"

# Crear directorio de logs
mkdir -p "${DEPLOY_DIR}/logs"
chown "$REAL_USER":"$REAL_USER" "${DEPLOY_DIR}/logs"

# ═══════════════════════════════════════════════════════════════
#  PASO 6 — PM2
# ═══════════════════════════════════════════════════════════════
step "6/8  Configurando PM2"

# Actualizar ecosystem.config.js con puerto correcto
cat > ecosystem.config.js <<'PMEOF'
module.exports = {
  apps: [{
    name: 'carrot',
    script: 'node_modules/.bin/next',
    args: 'start',
    cwd: '/var/www/carrot',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    max_restarts: 10,
    restart_delay: 5000,
    max_memory_restart: '512M',
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
PMEOF
chown "$REAL_USER":"$REAL_USER" ecosystem.config.js

# Detener instancia anterior si existe
pm2 delete carrot 2>/dev/null || true

# Iniciar
sudo -u "$REAL_USER" pm2 start ecosystem.config.js
sudo -u "$REAL_USER" pm2 save

# Auto-arranque en boot
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$REAL_USER" --hp "/home/$REAL_USER" 2>/dev/null || true

ok "PM2 corriendo"

# ═══════════════════════════════════════════════════════════════
#  PASO 7 — Nginx (VPS local)
# ═══════════════════════════════════════════════════════════════
step "7/8  Configurando Nginx"

NGINX_CONF="/etc/nginx/sites-available/carrot"

if [[ -f "$NGINX_CONF" ]]; then
  warn "Config Nginx ya existe — no se sobreescribirá"
else
  cat > "$NGINX_CONF" <<'NGEOF'
# Carrot — Nginx config
# Agregá este location block dentro de tu server block principal,
# o usá este archivo como include.

# Si usás esto como server block independiente, descomentá:
# server {
#     listen 80;
#     server_name TU_DOMINIO_O_IP;

    # ── Carrot bajo /carrot ─────────────────────────
    location /carrot {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # Cachear assets estáticos de Next.js
    location /carrot/_next/static {
        proxy_pass http://127.0.0.1:3001;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

# }
NGEOF

  # Habilitar si sites-enabled existe
  if [[ -d /etc/nginx/sites-enabled ]]; then
    ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/carrot
  fi

  ok "Config Nginx creada en ${NGINX_CONF}"
  warn "Revisá la config y ajustá a tu server block existente"
fi

# Validar y recargar
if nginx -t 2>/dev/null; then
  systemctl reload nginx
  ok "Nginx recargado correctamente"
else
  warn "Nginx tiene errores de configuración — revisá manualmente"
  nginx -t
fi

# ═══════════════════════════════════════════════════════════════
#  PASO 8 — Verificación y warm-up
# ═══════════════════════════════════════════════════════════════
step "8/8  Verificación y calentamiento de caché"

# Esperar a que Next.js arranque  
echo -n "  Esperando que el servidor inicie"
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${APP_PORT}/carrot" >/dev/null 2>&1; then
    echo ""
    ok "Servidor respondiendo en puerto ${APP_PORT}"
    break
  fi
  echo -n "."
  sleep 2
done

# Warm-up: pre-cargar páginas para compilar y cachear
echo "  Calentando caché de rutas..."
for path in "/carrot" "/carrot/login" "/carrot/api/health"; do
  HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "http://localhost:${APP_PORT}${path}" 2>/dev/null || echo "000")
  if [[ "$HTTP_CODE" =~ ^[23] ]]; then
    ok "  ${path} → ${HTTP_CODE}"
  else
    warn "  ${path} → ${HTTP_CODE} (verificar)"
  fi
done

# ═══════════════════════════════════════════════════════════════
#  Resumen final
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  🥕 Carrot desplegado exitosamente!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  URL local:  http://localhost:${APP_PORT}/carrot"
echo -e "  Directorio: ${DEPLOY_DIR}"
echo -e "  PM2:        pm2 status / pm2 logs carrot"
echo ""
echo -e "${YELLOW}  Próximos pasos:${NC}"
echo -e "  1. Verificá que .env tenga tu MERAKI_API_KEY"
echo -e "  2. Ajustá el server block de Nginx a tu config existente"
echo -e "  3. Configurá el proxy en el servidor de WordPress (thnet.com)"
echo -e "  4. Creá el primer usuario admin:"
echo -e "     cd ${DEPLOY_DIR} && npx prisma db seed"
echo ""
