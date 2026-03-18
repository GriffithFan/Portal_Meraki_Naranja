# Deploy en VPS Ubuntu + Integración WordPress (thnet.com/carrot)

Guía para desplegar **Carrot** en un VPS Ubuntu que ya tiene otro proyecto corriendo, e integrarlo con el sitio WordPress en `thnet.com` bajo la ruta `/carrot`.

> **Deploy automático**: Podés usar `scripts/deploy-vps.sh` para automatizar la mayoría de estos pasos. Ver sección 11.

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
# Node.js 20 LTS
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

CREATE USER carrot_user WITH PASSWORD 'TU_PASSWORD_SEGURO';
CREATE DATABASE carrot_db OWNER carrot_user;
GRANT ALL PRIVILEGES ON DATABASE carrot_db TO carrot_user;
\q
```

### 1.3 Crear directorio del proyecto

```bash
sudo mkdir -p /var/www/carrot
sudo chown $USER:$USER /var/www/carrot
```

---

## 2. Subir y configurar el proyecto

### 2.1 Subir archivos

Opción A — Git (recomendado):
```bash
cd /var/www/carrot
git clone https://github.com/GriffithFan/Portal_Meraki_Naranja.git .
```

Opción B — SCP:
```bash
# Desde tu máquina local (PowerShell)
scp -r .\portal-meraki-naranja\* usuario@TU_VPS_IP:/var/www/carrot/
```

### 2.2 Configurar variables de entorno

```bash
cd /var/www/carrot
nano .env
```

Contenido del `.env`:
```env
DATABASE_URL="postgresql://carrot_user:TU_PASSWORD_SEGURO@localhost:5432/carrot_db"
JWT_SECRET="genera_un_string_aleatorio_largo_aqui"
NEXTAUTH_URL="https://thnet.com/carrot"
NEXT_PUBLIC_BASE_PATH="/carrot"
MERAKI_API_KEY="tu_api_key_de_meraki"
NODE_ENV="production"
PORT=3001
```

> **Importante**: Usamos puerto **3001** para no chocar con tu otro proyecto. Ajustá si 3001 ya está en uso.
>
> **basePath**: Se configura automáticamente via la variable `NEXT_PUBLIC_BASE_PATH`. No es necesario editar `next.config.mjs`.

### 2.3 Instalar dependencias y buildear

```bash
cd /var/www/carrot
npm ci --omit=dev
npx prisma generate
npx prisma db push
npm run build
```

---

## 3. PM2 — Proceso en background

### 3.1 Ecosystem file

El proyecto incluye `ecosystem.config.js` preconfigurado. Si necesitás ajustarlo:

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
pm2 startup  # Sigue las instrucciones que imprime para auto-arranque
```

### 3.3 Verificar

```bash
pm2 status
pm2 logs carrot
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
# ── Carrot bajo /carrot ─────────────────────────────
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

Si querés acceder directo al VPS (ej: `vps.tudominio.com/carrot`), la config anterior ya lo cubre. Si querés un subdominio dedicado (ej: `carrot.tudominio.com`), creá un nuevo server block:

```nginx
server {
    listen 80;
    server_name carrot.tudominio.com;

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
# Proxy a Carrot en el VPS
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
2. En ese caso, no necesitás `NEXT_PUBLIC_BASE_PATH` — dejá la variable vacía o no la definas

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
sudo certbot --nginx -d carrot.tudominio.com
```

### Para thnet.com/carrot:
El SSL lo maneja el servidor de WordPress. Si thnet.com ya tiene HTTPS (Let's Encrypt, Cloudflare, etc.), el tráfico hacia `/carrot` se encripta automáticamente en el tramo usuario→WordPress. El tramo WordPress→VPS va por la red interna. Si querés encriptar también ese tramo, usá un túnel SSH o WireGuard.

---

## 8. Acceso desde WordPress

Para agregar un botón/icono de acceso desde el sitio WordPress:

### Opción 1: Widget HTML en WordPress

En el dashboard de WordPress → Apariencia → Widgets, agregá un widget **HTML personalizado**:

```html
<a href="https://thnet.com/carrot" 
   style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;font-size:14px;"
   title="Carrot">
  🥕 Carrot
</a>
```

### Opción 2: Menú de navegación

En WordPress → Apariencia → Menús:
1. Agregar un **enlace personalizado**
2. URL: `https://thnet.com/carrot`
3. Texto del enlace: `🥕 Carrot`

### Opción 3: En el header con código PHP

Si usás un tema child, en `header.php`:
```php
<a href="/carrot" class="carrot-login-btn" title="Carrot">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"/>
  </svg>
</a>
```

---

## 9. Comandos útiles post-deploy

```bash
# Ver logs
pm2 logs carrot

# Reiniciar
pm2 restart carrot

# Actualizar código (o usar scripts/update.sh)
cd /var/www/carrot
git pull
npm ci --omit=dev
npx prisma generate
npx prisma db push
npm run build
pm2 restart carrot

# Monitorear
pm2 monit

# Ver estado de todos los procesos
pm2 status
```

---

## 10. Checklist de Deploy

- [ ] Node.js 20+ instalado
- [ ] PostgreSQL corriendo con usuario y base creados
- [ ] Proyecto clonado en `/var/www/carrot`
- [ ] `.env` configurado con DATABASE_URL, JWT_SECRET, MERAKI_API_KEY, NEXT_PUBLIC_BASE_PATH
- [ ] `npm ci && npx prisma db push && npm run build` exitoso
- [ ] PM2 corriendo (`pm2 status` muestra "online")
- [ ] `curl http://localhost:3001/carrot` responde
- [ ] Nginx en VPS configurado con `location /carrot`
- [ ] Nginx en servidor WordPress configurado con proxy a VPS
- [ ] Firewall permite tráfico entre servidores
- [ ] SSL funcionando
- [ ] Enlace agregado en WordPress
- [ ] Probado desde navegador: `https://thnet.com/carrot` → login
- [ ] Primer usuario admin creado: `npx prisma db seed`

---

## 11. Deploy automático

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
