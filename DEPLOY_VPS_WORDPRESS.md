# Deploy en VPS Ubuntu

Guía de despliegue del proyecto en un VPS Ubuntu 24.04 con subdominio dedicado.

> Los valores reales de host, dominio y credenciales se documentan de forma privada en `CREDENCIALES.md` (excluido del repositorio).

---

## Arquitectura

```
                    ┌──────────────────────────┐
  Usuario ──────▶   │  <DOMINIO>               │
                    │  (A record → <IP>)       │
                    └──────────┬───────────────┘
                               │ HTTPS :443
                               ▼
                    ┌──────────────────────────┐
                    │  VPS Ubuntu 24.04        │
                    │  Nginx :443 (TLS)        │──▶ Next.js :3001 (PM2)
                    │                          │──▶ PostgreSQL :5432
                    └──────────────────────────┘
```

- **Sin basePath** — El subdominio apunta directo a la app
- **SSH**: solo usuario dedicado con clave ed25519
- **DB**: usuario app con permisos CRUD-only (sin DDL)

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

CREATE DATABASE <DB_NAME>;
CREATE USER <DB_USER> WITH PASSWORD '<PASSWORD_GENERADA>';
GRANT CONNECT ON DATABASE <DB_NAME> TO <DB_USER>;
\c <DB_NAME>
GRANT USAGE ON SCHEMA public TO <DB_USER>;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO <DB_USER>;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO <DB_USER>;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO <DB_USER>;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO <DB_USER>;
\q
```

> **Nota**: Para migraciones Prisma (ALTER TABLE, CREATE TABLE), usar el usuario `postgres` temporalmente.

### 1.3 Crear usuario deploy y directorio

```bash
sudo adduser --disabled-password --gecos "" <DEPLOY_USER>
sudo usermod -aG sudo <DEPLOY_USER>
echo "<DEPLOY_USER> ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/<DEPLOY_USER>
sudo mkdir -p /var/www/<APP_DIR>
sudo chown <DEPLOY_USER>:<DEPLOY_USER> /var/www/<APP_DIR>
```

---

## 2. Subir y configurar el proyecto

### 2.1 Subir archivos

```bash
# Desde la máquina local — con SSH key
scp -i <RUTA_CLAVE_SSH> -r ./* <DEPLOY_USER>@<IP>:/var/www/<APP_DIR>/
```

O con Git:
```bash
ssh -i <RUTA_CLAVE_SSH> <DEPLOY_USER>@<IP>
cd /var/www/<APP_DIR>
git clone <REPO_URL> .
```

### 2.2 Configurar variables de entorno

```bash
cd /var/www/<APP_DIR>
nano .env
```

Contenido del `.env`:
```env
DATABASE_URL="postgresql://<DB_USER>:<PASSWORD>@localhost:5432/<DB_NAME>"
JWT_SECRET="<GENERAR_CON_OPENSSL_RAND>"
MERAKI_API_KEY="<TU_API_KEY>"
NODE_ENV="production"
PORT=3001
NEXT_PUBLIC_VAPID_KEY="<VAPID_PUBLIC>"
VAPID_PRIVATE_KEY="<VAPID_PRIVATE>"
```

> **Puerto 3001** para no chocar con otros proyectos en el VPS.
> **Sin NEXT_PUBLIC_BASE_PATH** — el subdominio apunta directo a la raíz.

### 2.3 Instalar dependencias y buildear

```bash
cd /var/www/<APP_DIR>
npm ci
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
    name: '<APP_NAME>',
    script: 'node_modules/.bin/next',
    args: 'start',
    cwd: '/var/www/<APP_DIR>',
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
cd /var/www/<APP_DIR>
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Auto-arranque al reiniciar VPS
```

### 3.3 Verificar

```bash
pm2 status
pm2 logs <APP_NAME>
curl http://localhost:3001  # Debería responder HTML
```

---

## 4. Nginx — Reverse Proxy con TLS

Ejemplo de configuración en `/etc/nginx/sites-available/<APP_NAME>`:

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

server {
    server_name <DOMINIO>;

    access_log /var/log/nginx/<APP_NAME>-access.log;
    error_log /var/log/nginx/<APP_NAME>-error.log;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript
               application/javascript application/json
               application/xml+rss image/svg+xml;

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

    # TLS (gestionado por Certbot)
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/<DOMINIO>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<DOMINIO>/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = <DOMINIO>) {
        return 301 https://$host$request_uri;
    }
    listen 80;
    server_name <DOMINIO>;
    return 404;
}
```

### 4.1 Habilitar y testear

```bash
sudo ln -s /etc/nginx/sites-available/<APP_NAME> /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. DNS — Configuración del subdominio

En el panel DNS del dominio:

| Tipo | Nombre | Valor | TTL |
|------|--------|-------|-----|
| A | `<SUBDOMINIO>` | `<IP>` | 3600 |

> Si se usa Cloudflare: activar proxy (nube naranja) y SSL/TLS en modo Full (Strict).

---

## 6. SSL / HTTPS

```bash
sudo certbot --nginx -d <DOMINIO>
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

> El puerto de la app NO se expone directamente — Nginx actúa como proxy.

---

## 8. Comandos útiles post-deploy

```bash
# Conexión SSH
ssh -i <RUTA_CLAVE_SSH> <DEPLOY_USER>@<IP>

# Ver logs
pm2 logs <APP_NAME> --lines 100

# Reiniciar app
pm2 restart <APP_NAME>

# Actualizar código
cd /var/www/<APP_DIR>
git pull
npm ci
npx prisma generate
npm run build
pm2 restart <APP_NAME>

# Monitorear
pm2 monit

# Estado de todos los procesos
pm2 status

# Backup manual de DB
sudo -u postgres pg_dump <DB_NAME> | gzip > /opt/backups/db_manual_$(date +%Y%m%d).sql.gz
```

---

## 9. Checklist de Deploy

- [ ] Node.js 20+ instalado
- [ ] PostgreSQL corriendo con usuario CRUD-only
- [ ] Proyecto clonado en el directorio de deploy
- [ ] `.env` configurado con todas las variables requeridas
- [ ] `npm ci && npx prisma db push && npm run build` exitoso
- [ ] PM2 corriendo (`pm2 status` muestra "online")
- [ ] `curl http://localhost:3001` responde
- [ ] Nginx configurado con server block para el dominio
- [ ] DNS registro A apuntando al VPS
- [ ] SSL/TLS con Let's Encrypt (certbot)
- [ ] Firewall UFW habilitado (22/80/443)
- [ ] SSH hardening (solo key auth, sin root, sin password)
- [ ] Fail2ban activo (sshd + nginx-limit-req)
- [ ] PM2 logrotate configurado
- [ ] Backup automático de DB configurado
- [ ] Primer usuario admin creado: `npx prisma db seed`
- [ ] Probado desde navegador
- [ ] Cloudflare proxy (opcional)

---

## 10. Deploy automático

El proyecto incluye scripts para automatizar el proceso:

### Primera instalación
```bash
# En el VPS:
git clone <REPO_URL> /var/www/<APP_DIR>
cd /var/www/<APP_DIR>
sudo bash scripts/deploy-vps.sh
```

### Actualizaciones
```bash
cd /var/www/<APP_DIR>
bash scripts/update.sh
```

---

## Troubleshooting

| Problema | Solución |
|----------|----------|
| 502 Bad Gateway | Verificar que PM2 está corriendo: `pm2 status`. Revisar logs: `pm2 logs <APP_NAME>` |
| Assets no cargan | Verificar location `/_next/static` en Nginx |
| CORS errors | Verificar que la URL en .env coincide con la URL real |
| DB connection refused | Verificar `DATABASE_URL` en .env, y que PostgreSQL acepta conexiones locales |
| Conflicto de puertos | Cambiar PORT en .env y ecosystem.config.js a otro puerto libre |
