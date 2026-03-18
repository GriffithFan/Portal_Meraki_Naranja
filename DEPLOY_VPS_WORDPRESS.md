# Deploy en VPS Ubuntu — carrot.thnet.com.ar

Guía de despliegue de **Carrot** en un VPS Ubuntu 24.04 con subdominio dedicado.

> **Estado actual**: Desplegado y corriendo en producción.
> **URL**: https://carrot.thnet.com.ar
> **VPS**: 72.61.32.146

---

## Arquitectura actual

```
                    ┌──────────────────────────┐
  Usuario ──────▶   │  carrot.thnet.com.ar     │
                    │  (A record → 72.61.32.146)│
                    └──────────┬───────────────┘
                               │ HTTPS :443
                               ▼
                    ┌──────────────────────────┐
                    │  VPS Ubuntu 24.04        │
                    │  Nginx :443 (TLS)        │──▶ Next.js :3001 (PM2 "carrot")
                    │                          │──▶ Portal Meraki :XXXX
                    │                          │──▶ PostgreSQL :5432 (carrot_db)
                    └──────────────────────────┘
```

- **Sin basePath** — El subdominio apunta directo a la app (no `/carrot`)
- **SSH**: solo usuario `deploy` con clave ed25519
- **DB**: usuario app `carrot_app` (solo CRUD, sin DDL)

---

## 1. Preparar el VPS

### 1.1 Requisitos

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 (gestor de procesos)
sudo npm install -g pm2

# PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Nginx
sudo apt-get install -y nginx

# Certbot (SSL)
sudo apt-get install -y certbot python3-certbot-nginx
```

### 1.2 Crear la base de datos

```bash
sudo -u postgres psql

CREATE DATABASE carrot_db;
-- Usuario app (solo CRUD, sin DDL)
CREATE USER carrot_app WITH PASSWORD 'PASSWORD_GENERADA_CON_OPENSSL';
GRANT CONNECT ON DATABASE carrot_db TO carrot_app;
\c carrot_db
GRANT USAGE ON SCHEMA public TO carrot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO carrot_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO carrot_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO carrot_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO carrot_app;
\q
```

> **Nota**: Para migraciones Prisma (ALTER TABLE, CREATE TABLE), usar el usuario `postgres` temporalmente.

### 1.3 Crear usuario deploy y directorio

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG sudo deploy
echo "deploy ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/deploy
sudo mkdir -p /var/www/carrot
sudo chown deploy:deploy /var/www/carrot
```

---

## 2. Subir y configurar el proyecto

### 2.1 Subir archivos

```bash
# Desde tu máquina local (PowerShell) — con SSH key
scp -i ~/.ssh/id_ed25519 -r .\portal-meraki-naranja\* deploy@72.61.32.146:/var/www/carrot/
```

O con Git:
```bash
ssh -i ~/.ssh/id_ed25519 deploy@72.61.32.146
cd /var/www/carrot
git clone https://github.com/GriffithFan/Portal_Meraki_Naranja.git .
```

### 2.2 Configurar variables de entorno

```bash
cd /var/www/carrot
nano .env
```

Contenido del `.env`:
```env
DATABASE_URL="postgresql://carrot_app:TU_PASSWORD@localhost:5432/carrot_db"
JWT_SECRET="genera_con_crypto_randomBytes_48"
MERAKI_API_KEY="tu_api_key"
NODE_ENV="production"
PORT=3001
NEXT_PUBLIC_VAPID_KEY="tu_vapid_public_key"
VAPID_PRIVATE_KEY="tu_vapid_private_key"
```

> **Puerto 3001** para no chocar con otros proyectos en el VPS.
> **Sin NEXT_PUBLIC_BASE_PATH** — el subdominio apunta directo a la raíz.

### 2.3 Instalar dependencias y buildear

```bash
cd /var/www/carrot
npm ci --omit=dev
npx prisma generate
npx prisma db push    # usar usuario postgres para migraciones
npm run build
```

---

## 3. PM2 — Proceso en background

### 3.1 Ecosystem file

El proyecto incluye `ecosystem.config.js` preconfigurado:

```js
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
```

### 3.2 Iniciar con PM2

```bash
cd /var/www/carrot
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Auto-arranque al reiniciar VPS
```

### 3.3 Verificar

```bash
pm2 status
pm2 logs carrot
curl http://localhost:3001  # Debería responder HTML
```

---

## 4. Nginx — Reverse Proxy con TLS

Config actual en `/etc/nginx/sites-available/carrot`:

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

server {
    server_name carrot.thnet.com.ar;

    access_log /var/log/nginx/carrot-access.log;
    error_log /var/log/nginx/carrot-error.log;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml+rss image/svg+xml;

    location /uploads/ {
        deny all;
        return 403;
    }

    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /_next/static {
        proxy_pass http://127.0.0.1:3001;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/carrot.thnet.com.ar/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/carrot.thnet.com.ar/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = carrot.thnet.com.ar) {
        return 301 https://$host$request_uri;
    }
    listen 80;
    server_name carrot.thnet.com.ar;
    return 404;
}
```

### 4.1 Habilitar y testear

```bash
sudo ln -s /etc/nginx/sites-available/carrot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. DNS — Configuración del subdominio

En el panel DNS del dominio `thnet.com.ar`:

| Tipo | Nombre | Valor | TTL |
|------|--------|-------|-----|
| A | carrot | 72.61.32.146 | 3600 |

> Si se usa Cloudflare: activar proxy (nube naranja) y SSL/TLS → Full (Strict).

---

## 6. SSL / HTTPS

```bash
sudo certbot --nginx -d carrot.thnet.com.ar
sudo certbot renew --dry-run  # verificar renovación automática
```

Certbot configura automáticamente el server block de Nginx y programa la renovación.

---

## 7. Firewall

```bash
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP (redirige a HTTPS)
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

> El puerto 3001 NO se expone — Nginx actúa como proxy.

---

## 8. Comandos útiles post-deploy

```bash
# Conexión SSH
ssh -i ~/.ssh/id_ed25519 deploy@72.61.32.146

# Ver logs
pm2 logs carrot --lines 100

# Reiniciar app
pm2 restart carrot

# Actualizar código
cd /var/www/carrot
git pull
npm ci --omit=dev
npx prisma generate
npx prisma db push
npm run build
pm2 restart carrot

# Monitorear
pm2 monit

# Estado de todos los procesos
pm2 status

# Backup manual de DB
sudo -u postgres pg_dump carrot_db | gzip > /opt/backups/db_manual_$(date +%Y%m%d).sql.gz
```

---

## 9. Checklist de Deploy

- [x] Node.js 20+ instalado
- [x] PostgreSQL corriendo con usuario `carrot_app` (solo CRUD)
- [x] Proyecto clonado en `/var/www/carrot`
- [x] `.env` configurado (DATABASE_URL, JWT_SECRET, MERAKI_API_KEY)
- [x] `npm ci && npx prisma db push && npm run build` exitoso
- [x] PM2 corriendo (`pm2 status` muestra "online")
- [x] `curl http://localhost:3001` responde
- [x] Nginx configurado con server block para `carrot.thnet.com.ar`
- [x] DNS registro A apuntando al VPS
- [x] SSL/TLS con Let's Encrypt (certbot)
- [x] Firewall UFW habilitado (22/80/443)
- [x] SSH hardening (solo deploy con key, sin root, sin password)
- [x] Fail2ban activo (sshd + nginx-limit-req)
- [x] PM2 logrotate configurado
- [x] Backup automático de DB (cron 3 AM)
- [x] Primer usuario admin creado: `npx prisma db seed`
- [x] Probado desde navegador: `https://carrot.thnet.com.ar`
- [ ] Cloudflare proxy (opcional)

---

## 10. Deploy automático

El proyecto incluye scripts para automatizar el proceso:

### Primera instalación
```bash
# En el VPS:
git clone https://github.com/GriffithFan/Portal_Meraki_Naranja.git /var/www/carrot
cd /var/www/carrot
sudo bash scripts/deploy-vps.sh
```

### Actualizaciones
```bash
cd /var/www/carrot
bash scripts/update.sh
```

---

## Troubleshooting

| Problema | Solución |
|----------|----------|
| 502 Bad Gateway | Verificar que PM2 está corriendo: `pm2 status`. Revisar logs: `pm2 logs carrot` |
| 404 en /carrot | Verificar `NEXT_PUBLIC_BASE_PATH="/carrot"` en `.env`. Rebuild: `npm run build` |
| Assets no cargan | Verificar location `/carrot/_next/static` en Nginx |
| CORS errors | Verificar `NEXTAUTH_URL` en .env coincide con la URL real |
| DB connection refused | Verificar `DATABASE_URL` en .env, y que PostgreSQL acepta conexiones locales |
| Conflicto de puertos | Cambiar PORT en .env y ecosystem.config.js a otro puerto libre |
