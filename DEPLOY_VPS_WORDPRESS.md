# Deploy en VPS Ubuntu + Integración WordPress (thnet.com/carrot)

Guía para desplegar **Portal Meraki Naranja** en un VPS Ubuntu que ya tiene otro proyecto corriendo, e integrarlo con el sitio WordPress en `thnet.com` bajo la ruta `/carrot`.

---

## Arquitectura

```
                    ┌──────────────┐
  Usuario ──────▶   │   thnet.com  │  (WordPress - host separado)
                    │   Nginx/WP   │
                    └──────┬───────┘
                           │
                   /carrot │  reverse proxy
                           ▼
                    ┌──────────────┐
                    │  TU VPS      │
                    │  Ubuntu      │
                    │  Nginx :80   │──▶ Next.js :3001 (PM2)
                    │              │──▶ Otro proyecto :XXXX
                    │              │──▶ PostgreSQL :5432
                    └──────────────┘
```

---

## 1. Preparar el VPS

### 1.1 Requisitos

```bash
# Node.js 18+ (recomendado v20 LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 (gestor de procesos)
sudo npm install -g pm2

# PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Nginx (probablemente ya lo tengas)
sudo apt-get install -y nginx
```

### 1.2 Crear la base de datos

```bash
sudo -u postgres psql

CREATE USER meraki_user WITH PASSWORD 'TU_PASSWORD_SEGURO';
CREATE DATABASE portal_meraki OWNER meraki_user;
GRANT ALL PRIVILEGES ON DATABASE portal_meraki TO meraki_user;
\q
```

### 1.3 Crear directorio del proyecto

```bash
sudo mkdir -p /var/www/portal-meraki
sudo chown $USER:$USER /var/www/portal-meraki
```

---

## 2. Subir y configurar el proyecto

### 2.1 Subir archivos

Opción A — Git (recomendado):
```bash
cd /var/www/portal-meraki
git clone TU_REPO_URL .
```

Opción B — SCP:
```bash
# Desde tu máquina local (PowerShell)
scp -r .\portal-meraki-naranja\* usuario@TU_VPS_IP:/var/www/portal-meraki/
```

### 2.2 Configurar variables de entorno

```bash
cd /var/www/portal-meraki
nano .env
```

Contenido del `.env`:
```env
DATABASE_URL="postgresql://meraki_user:TU_PASSWORD_SEGURO@localhost:5432/portal_meraki"
JWT_SECRET="genera_un_string_aleatorio_largo_aqui"
NEXTAUTH_URL="https://thnet.com/carrot"
NEXT_PUBLIC_BASE_PATH="/carrot"
NODE_ENV="production"
PORT=3001
```

> **Importante**: Usamos puerto **3001** para no chocar con tu otro proyecto. Ajustá si 3001 ya está en uso.

### 2.3 Instalar dependencias y buildear

```bash
cd /var/www/portal-meraki
npm install
npx prisma generate
npx prisma db push
npm run build
```

### 2.4 Configurar BASE_PATH en Next.js

En `next.config.js`, agregá el basePath para que funcione bajo `/carrot`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/carrot',
  // ... otras configuraciones existentes
};

module.exports = nextConfig;
```

Después de este cambio, rebuild:
```bash
npm run build
```

---

## 3. PM2 — Proceso en background

### 3.1 Crear ecosystem file

```bash
nano ecosystem.config.js
```

```js
module.exports = {
  apps: [{
    name: 'portal-meraki',
    script: 'npm',
    args: 'start',
    cwd: '/var/www/portal-meraki',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '512M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
```

### 3.2 Iniciar con PM2

```bash
cd /var/www/portal-meraki
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Sigue las instrucciones que imprime para auto-arranque
```

### 3.3 Verificar

```bash
pm2 status
pm2 logs portal-meraki
curl http://localhost:3001/carrot  # Debería responder
```

---

## 4. Nginx en el VPS

Configurá Nginx para servir tu proyecto bajo un subdominio o path. Como ya tenés otro proyecto, **agregás un nuevo `location` block** sin tocar el existente.

### 4.1 Editar configuración de Nginx

```bash
sudo nano /etc/nginx/sites-available/default
# O el archivo de config que uses
```

Agregá dentro del bloque `server` existente:

```nginx
# ── Portal Meraki bajo /carrot ──────────────────────
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
```

### 4.2 Testear y recargar

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 4.3 Si el VPS tiene su propio dominio

Si querés acceder también directo al VPS (ej: `vps.tudominio.com/carrot`), la config anterior ya lo cubre. Si querés un subdominio dedicado (ej: `meraki.tudominio.com`), creá un nuevo server block:

```nginx
server {
    listen 80;
    server_name meraki.tudominio.com;

    location / {
        proxy_pass http://127.0.0.1:3001/carrot;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 5. Integración con WordPress (thnet.com/carrot)

El sitio WordPress está en **otro servidor**. Para que `thnet.com/carrot` apunte a tu VPS:

### Opción A: Reverse proxy desde WordPress server (Recomendada)

En el servidor donde corre WordPress, editá la config de Nginx:

```bash
# En el servidor de thnet.com
sudo nano /etc/nginx/sites-available/thnet.com
```

Agregá este location block **ANTES** del bloque `location /` de WordPress:

```nginx
# Proxy al Portal Meraki en el VPS
location /carrot {
    proxy_pass http://IP_DE_TU_VPS:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}

location /carrot/_next/static {
    proxy_pass http://IP_DE_TU_VPS:3001;
    proxy_cache_valid 200 365d;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Opción B: Si WordPress usa Apache

Agregá al `.htaccess` o config del virtualhost:

```apache
# En el virtualhost de thnet.com
ProxyPreserveHost On

ProxyPass /carrot http://IP_DE_TU_VPS:3001/carrot
ProxyPassReverse /carrot http://IP_DE_TU_VPS:3001/carrot
```

Habilitá los módulos necesarios:
```bash
sudo a2enmod proxy proxy_http proxy_wstunnel
sudo systemctl restart apache2
```

### Opción C: Cloudflare / DNS (si no podés tocar el server de WordPress)

Si no tenés acceso al servidor de WordPress, podés usar **Cloudflare Workers** o un subdominio:

1. Crear subdominio `carrot.thnet.com` apuntando al VPS
2. En ese caso, no necesitás basePath `/carrot` — configurá basePath como `/`

---

## 6. Firewall del VPS

```bash
# Permitir tráfico en el puerto del proxy (si el WordPress server necesita llegar)
sudo ufw allow from IP_SERVIDOR_WORDPRESS to any port 3001

# O si ya tenés el 80/443 abierto y usás Nginx local:
sudo ufw allow 80
sudo ufw allow 443
```

---

## 7. SSL / HTTPS

### Si el VPS tiene su propio dominio:
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d meraki.tudominio.com
```

### Para thnet.com/carrot:
El SSL lo maneja el servidor de WordPress. Si thnet.com ya tiene HTTPS (Let's Encrypt, Cloudflare, etc.), el tráfico hacia `/carrot` se encripta automáticamente en el tramo usuario→WordPress. El tramo WordPress→VPS va por la red interna. Si querés encriptar también ese tramo, usá un túnel SSH o WireGuard.

---

## 8. Icono de Login desde WordPress

Para agregar un botón/icono de acceso desde el sitio WordPress:

### Opción 1: Widget HTML en WordPress

En el dashboard de WordPress → Apariencia → Widgets, agregá un widget **HTML personalizado** donde quieras el ícono:

```html
<a href="https://thnet.com/carrot" 
   style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-size:14px;"
   title="Portal Meraki">
  🥕 Portal Meraki
</a>
```

### Opción 2: Menú de navegación

En WordPress → Apariencia → Menús:
1. Agregar un **enlace personalizado**
2. URL: `https://thnet.com/carrot`
3. Texto del enlace: `Portal Meraki` (o poné un emoji 🥕)

### Opción 3: En el header con código PHP

Si usás un tema child, en `header.php`:
```php
<a href="/carrot" class="meraki-login-btn" title="Portal Meraki">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"/>
  </svg>
</a>
```

---

## 9. Comandos útiles post-deploy

```bash
# Ver logs
pm2 logs portal-meraki

# Reiniciar
pm2 restart portal-meraki

# Actualizar código
cd /var/www/portal-meraki
git pull
npm install
npx prisma generate
npx prisma db push
npm run build
pm2 restart portal-meraki

# Monitorear
pm2 monit

# Ver estado de todos los procesos
pm2 status
```

---

## 10. Checklist de Deploy

- [ ] Node.js 18+ instalado
- [ ] PostgreSQL corriendo con usuario y base creados
- [ ] Proyecto clonado en `/var/www/portal-meraki`
- [ ] `.env` configurado con DATABASE_URL, JWT_SECRET, basePath
- [ ] `next.config.js` tiene `basePath: '/carrot'`
- [ ] `npm install && npx prisma db push && npm run build` exitoso
- [ ] PM2 corriendo (`pm2 status` muestra "online")
- [ ] `curl http://localhost:3001/carrot` responde
- [ ] Nginx en VPS configurado con `location /carrot`
- [ ] Nginx en servidor WordPress configurado con proxy a VPS
- [ ] Firewall permite tráfico entre servidores
- [ ] SSL funcionando
- [ ] Icono/enlace agregado en WordPress
- [ ] Probado desde navegador: `https://thnet.com/carrot` → login del portal

---

## Troubleshooting

| Problema | Solución |
|----------|----------|
| 502 Bad Gateway | Verificar que PM2 está corriendo: `pm2 status`. Revisar logs: `pm2 logs portal-meraki` |
| 404 en /carrot | Verificar `basePath` en next.config.js. Rebuild: `npm run build` |
| Assets no cargan | Verificar location `/carrot/_next/static` en Nginx |
| CORS errors | Verificar `NEXTAUTH_URL` en .env coincide con la URL real |
| DB connection refused | Verificar `DATABASE_URL` en .env, y que PostgreSQL acepta conexiones locales |
| Conflicto de puertos | Cambiar PORT en .env y ecosystem.config.js a otro puerto libre |
