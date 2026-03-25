# Seguridad VPS — Informe de Configuracion de Produccion

> Servidor: `72.61.32.146` | Dominio: `carrot.thnet.com.ar`  
> Ultima revision: **2026-03-20**

---

## Resumen Ejecutivo

La infraestructura de produccion del Portal Meraki Naranja esta protegida mediante un modelo de defensa en profundidad que abarca las siguientes capas:

| Capa | Medida | Estado |
|------|--------|--------|
| Red | Firewall (UFW) — solo 22/80/443 | Aplicado |
| Acceso | SSH con clave ed25519, sin root, sin password | Aplicado |
| Proteccion contra fuerza bruta | Fail2ban (SSH + Nginx) | Aplicado |
| Transporte | TLS 1.2+ con Let's Encrypt, renovacion automatica | Aplicado |
| Aplicacion | Nginx reverse proxy con rate limiting, HSTS, CSP | Aplicado |
| Base de datos | PostgreSQL con usuario dedicado, permisos minimos | Aplicado |
| Secretos | JWT y credenciales rotados, almacenados fuera del repositorio | Aplicado |
| Respaldos | Backup automatico diario de PostgreSQL (30 dias retencion) | Aplicado |
| Parches | Actualizaciones de seguridad automaticas (unattended-upgrades) | Aplicado |
| Logs | PM2 logrotate (50 MB, 7 retenciones, compresion) | Aplicado |
| CDN / WAF | Cloudflare proxy (opcional) | Pendiente |

---

## 1. Firewall (UFW)

Politica restrictiva: todo el trafico entrante denegado salvo los puertos necesarios.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (redireccion a HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

Verificacion:

```bash
sudo ufw status verbose
```

---

## 2. SSH Hardening

Configuracion activa en `/etc/ssh/sshd_config`:

```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
AllowUsers deploy
```

| Parametro | Valor |
|-----------|-------|
| Usuario autorizado | `deploy` (unico) |
| Metodo de autenticacion | Clave SSH ed25519 |
| Login root | Deshabilitado |
| Autenticacion por password | Deshabilitada |
| Directorio de la aplicacion | `/var/www/carrot` (propietario: deploy) |

**Conexion:**

```bash
ssh -i ~/.ssh/id_ed25519 deploy@72.61.32.146
```

**Agregar acceso desde otra maquina:**

```bash
# En la maquina nueva, generar clave:
ssh-keygen -t ed25519 -C "deploy@carrot-nueva-pc"

# Desde una maquina con acceso existente:
ssh -i ~/.ssh/id_ed25519 deploy@72.61.32.146
echo "CONTENIDO_DE_id_ed25519.pub" >> ~/.ssh/authorized_keys
```

---

## 3. Fail2ban

Servicio activo con dos jails configuradas en `/etc/fail2ban/jail.local`:

```ini
[sshd]
enabled = true
port = 22
maxretry = 3
bantime = 3600
findtime = 600

[nginx-limit-req]
enabled = true
port = http,https
logpath = /var/log/nginx/carrot-error.log
maxretry = 10
bantime = 600
```

**Operaciones:**

```bash
# Ver estado de una jail
sudo fail2ban-client status sshd

# Desbanear una IP
sudo fail2ban-client set sshd unbanip <IP>
```

---

## 4. Nginx — Reverse Proxy y TLS

Configuracion activa en `/etc/nginx/sites-enabled/carrot`:

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

server {
    server_name carrot.thnet.com.ar;

    access_log /var/log/nginx/carrot-access.log;
    error_log /var/log/nginx/carrot-error.log;

    # Compresion
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript
               application/javascript application/json
               application/xml+rss image/svg+xml;

    # Bloqueo de acceso directo a uploads
    location /uploads/ {
        deny all;
        return 403;
    }

    # Rate limiting en API
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Assets estaticos con cache inmutable
    location /_next/static {
        proxy_pass http://127.0.0.1:3001;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Proxy general con soporte WebSocket
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

    # Headers de seguridad
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # TLS (gestionado por Certbot)
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

**Verificacion del certificado TLS:**

```bash
sudo certbot renew --dry-run
```

El timer de Certbot renueva el certificado automaticamente antes de su vencimiento.

---

## 5. PostgreSQL Hardening

Usuario dedicado `carrot_app` con permisos estrictamente limitados a operaciones CRUD (sin DDL):

```sql
GRANT CONNECT ON DATABASE carrot_db TO carrot_app;
GRANT USAGE ON SCHEMA public TO carrot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO carrot_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO carrot_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO carrot_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO carrot_app;
```

| Parametro | Valor |
|-----------|-------|
| `listen_addresses` | `localhost` (solo conexiones locales) |
| Password | Generada con `openssl rand -base64 32` |
| Acceso DDL | Solo usuario `postgres` (para migraciones de Prisma) |

> **Nota**: Las migraciones de schema (`ALTER TABLE`, `CREATE TABLE`) deben ejecutarse con el usuario `postgres`, no con `carrot_app`.

---

## 6. Rotacion de Secretos

| Secreto | Metodo de generacion |
|---------|---------------------|
| `JWT_SECRET` | `crypto.randomBytes(48)` — 64 caracteres aleatorios |
| `MERAKI_API_KEY` | Configurado en produccion |
| `NODE_ENV` | `production` |

Las credenciales de produccion se encuentran documentadas en `CREDENCIALES.md`, archivo excluido del repositorio via `.gitignore`.

---

## 7. Cloudflare (opcional — no aplicado)

Pasos para activar proteccion CDN/WAF:

1. Crear cuenta en [dash.cloudflare.com](https://dash.cloudflare.com) (plan Free).
2. Agregar dominio `thnet.com.ar`.
3. Cambiar nameservers en el registrador de dominio.
4. Activar proxy (nube naranja) en registro A de `carrot.thnet.com.ar`.
5. Configurar SSL/TLS en modo Full (Strict).
6. Opcional: activar "Under Attack Mode" ante ataques DDoS.

---

## 8. Actualizaciones Automaticas de Seguridad

```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

El sistema aplica automaticamente parches de seguridad del sistema operativo.

---

## 9. Monitoreo y Logs

```bash
# Logs de la aplicacion (PM2)
sudo pm2 logs carrot --lines 100

# Logs de Nginx
sudo tail -f /var/log/nginx/carrot-error.log
sudo tail -f /var/log/nginx/carrot-access.log

# Intentos de acceso SSH fallidos
sudo journalctl -u sshd | grep "Failed"

# IPs baneadas por Fail2ban
sudo fail2ban-client status sshd
```

---

## 10. Backups Automaticos de PostgreSQL

| Parametro | Valor |
|-----------|-------|
| Script | `/opt/backup-db.sh` |
| Programacion | Diaria a las 03:00 (cron) |
| Retencion | 30 dias |
| Destino | `/opt/backups/db_YYYYMMDD_HHMM.sql.gz` |

Verificacion:

```bash
ls -la /opt/backups/
```

---

## 11. PM2 Logrotate

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

---

## Checklist de Seguridad

| Control | Estado |
|---------|--------|
| UFW habilitado (puertos 22/80/443) | Aplicado |
| SSH sin root, sin password (solo deploy con ed25519) | Aplicado |
| Fail2ban activo (sshd + nginx-limit-req) | Aplicado |
| Nginx con TLS y rate limiting (/api/ 30r/s) | Aplicado |
| HSTS configurado (max-age 1 ano, includeSubDomains) | Aplicado |
| Nginx bloquea `/uploads/` directamente | Aplicado |
| PostgreSQL solo en localhost, usuario dedicado (carrot_app, solo CRUD) | Aplicado |
| Backup automatico de DB (cron 03:00, 30 dias retencion) | Aplicado |
| Secretos rotados (JWT_SECRET, CRON_SECRET) | Aplicado |
| MERAKI_API_KEY configurado | Aplicado |
| NODE_ENV=production en .env | Aplicado |
| Build de produccion verificado | Aplicado |
| Certificado TLS con renovacion automatica (certbot timer) | Aplicado |
| PM2 logrotate (50 MB, 7 retenciones, compresion) | Aplicado |
| Unattended-upgrades para parches de seguridad | Aplicado |
| Cloudflare proxy (ocultar IP, WAF, DDoS) | Pendiente |
