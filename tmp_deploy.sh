#!/bin/bash
set -e

echo "=== PASO 1: PostgreSQL setup ==="
# Verificar si postgres está corriendo
systemctl start postgresql

# Crear usuario
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='carrot_user'" | grep -q 1; then
  echo "Usuario carrot_user ya existe"
else
  sudo -u postgres psql -c "CREATE USER carrot_user WITH PASSWORD 'nKdLgSzYDoBybRf03rIyEHK7n8ClJBK';"
  echo "Usuario carrot_user creado"
fi

# Crear base de datos
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='carrot_db'" | grep -q 1; then
  echo "Base de datos carrot_db ya existe"
else
  sudo -u postgres psql -c "CREATE DATABASE carrot_db OWNER carrot_user;"
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE carrot_db TO carrot_user;"
  echo "Base de datos carrot_db creada"
fi

echo "=== PASO 2: Clonar repositorio ==="
mkdir -p /var/www/carrot
cd /var/www/carrot
if [ -d .git ]; then
  echo "Repo ya existe, haciendo pull..."
  git pull --ff-only
else
  git clone https://github.com/GriffithFan/Portal_Meraki_Naranja.git .
  echo "Repo clonado"
fi

echo "=== PASO 3: Crear .env ==="
if [ -f .env ]; then
  echo ".env ya existe, no se sobreescribe"
else
  cat > .env <<'ENVEOF'
DATABASE_URL="postgresql://carrot_user:nKdLgSzYDoBybRf03rIyEHK7n8ClJBK@localhost:5432/carrot_db"
JWT_SECRET="PLACEHOLDER_JWT"
NEXTAUTH_URL="https://thnet.com/carrot"
NEXT_PUBLIC_BASE_PATH="/carrot"
NODE_ENV="production"
PORT=3001
MERAKI_API_KEY=""
ENVEOF
  # Generar JWT secret real
  JWT=$(openssl rand -base64 48 | tr -d '/+=' | head -c 64)
  sed -i "s/PLACEHOLDER_JWT/$JWT/" .env
  chmod 600 .env
  echo ".env creado"
fi

echo "=== PASO 4: npm ci ==="
npm ci --omit=dev 2>&1 | tail -3
echo "npm ci OK"

echo "=== PASO 5: Prisma ==="
npx prisma generate 2>&1 | tail -2
npx prisma db push --accept-data-loss 2>&1 | tail -3
echo "Prisma OK"

echo "=== PASO 6: Build ==="
npm run build 2>&1 | tail -5
echo "Build OK"

echo "=== PASO 7: PM2 ==="
mkdir -p /var/www/carrot/logs
pm2 delete carrot 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
echo "PM2 OK"

echo "=== PASO 8: Nginx ==="
NGINX_CONF="/etc/nginx/sites-available/carrot"
if [ -f "$NGINX_CONF" ]; then
  echo "Config Nginx ya existe"
else
  cat > "$NGINX_CONF" <<'NGEOF'
# Carrot - location blocks para incluir en server block principal
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

location /carrot/_next/static {
    proxy_pass http://127.0.0.1:3001;
    proxy_cache_valid 200 365d;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
NGEOF
  echo "Config Nginx creada en $NGINX_CONF"
fi

echo "=== PASO 9: Verificar ==="
sleep 3
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf http://localhost:3001/carrot >/dev/null 2>&1; then
    echo "Servidor respondiendo en puerto 3001!"
    break
  fi
  echo "Esperando... ($i)"
  sleep 2
done

curl -sf -o /dev/null -w "GET /carrot -> %{http_code}\n" http://localhost:3001/carrot || echo "No responde aun"
curl -sf -o /dev/null -w "GET /carrot/api/health -> %{http_code}\n" http://localhost:3001/carrot/api/health || echo "Health no responde"

echo ""
echo "=== DEPLOY COMPLETADO ==="
echo "PM2 status:"
pm2 status
echo ""
echo "Nginx config guardada en: $NGINX_CONF"
echo "IMPORTANTE: Agregá los location blocks al server block de Nginx"
