# Seguridad VPS — Estado actual de producción

> Servidor: `72.61.32.146` | Dominio: `carrot.thnet.com.ar`
> Última actualización: **2026-03-18**

---

## 1. Firewall (UFW) ✅ APLICADO

```bash
# Estado actual:
# Status: active
# 22/tcp  ALLOW  Anywhere
# 80/tcp  ALLOW  Anywhere
# 443/tcp ALLOW  Anywhere
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (redirige a HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

## 2. SSH Hardening ✅ APLICADO (2026-03-18)

Configuración actual en `/etc/ssh/sshd_config`:

```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
AllowUsers deploy
```

- **Usuario**: `deploy` (único autorizado)
- **Auth**: SSH key ed25519 (sin password)
- **Root login**: DESACTIVADO
- **Sudo**: NOPASSWD para deploy
- **Home**: `/home/deploy`
- **App dir**: `/var/www/carrot` (owner: deploy)

**Conexión:**
```bash
ssh -i ~/.ssh/id_ed25519 deploy@72.61.32.146
```

**Para agregar acceso desde otra PC:**
```bash
# En la otra PC, generar key:
ssh-keygen -t ed25519 -C "deploy@carrot-pc2"
# Luego desde una PC con acceso, agregar la nueva key pública:
ssh -i ~/.ssh/id_ed25519 deploy@72.61.32.146
echo "CONTENIDO_DE_id_ed25519.pub" >> ~/.ssh/authorized_keys
```

## 3. Fail2ban ✅ APLICADO (2026-03-18)

Instalado y activo. Config en `/etc/fail2ban/jail.local`:

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

**Desbanear IP:**
```bash
sudo fail2ban-client set sshd unbanip <IP>
```

## 4. Nginx Reverse Proxy + TLS ✅ APLICADO

Config actual en `/etc/nginx/sites-enabled/carrot`:

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

    listen 443 ssl; # managed by Certbot
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

### Certificado TLS (Let's Encrypt) ✅
- Certbot timer activo (renovación automática)
- Verificar: `sudo certbot renew --dry-run`

## 5. PostgreSQL Hardening ✅ APLICADO (2026-03-18)

```sql
-- Usuario dedicado con permisos mínimos (sin DDL)
-- Usuario: carrot_app
-- Permisos: SELECT, INSERT, UPDATE, DELETE (sin CREATE/DROP/ALTER)
GRANT CONNECT ON DATABASE carrot_db TO carrot_app;
GRANT USAGE ON SCHEMA public TO carrot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO carrot_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO carrot_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO carrot_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO carrot_app;
```

- `listen_addresses = 'localhost'` (solo conexiones locales)
- Password segura generada con `openssl rand -base64 32`
- DATABASE_URL actualizado en `/var/www/carrot/.env`

> **Nota**: Para migraciones de Prisma (ALTER TABLE, CREATE TABLE), usar el usuario `postgres`.

## 6. Rotación de Secretos ✅ APLICADO

- JWT_SECRET: generado con `crypto.randomBytes(48)` — 64 caracteres aleatorios
- MERAKI_API_KEY: configurado en producción
- NODE_ENV=production

> Credenciales guardadas en `CREDENCIALES.md` (excluido de git).

## 7. Cloudflare (opcional)

No aplicado aún. Pasos para activar:

1. Crear cuenta en [dash.cloudflare.com](https://dash.cloudflare.com) (plan Free)
2. Agregar dominio `thnet.com.ar`
3. Cambiar nameservers en el registrador de dominio
4. Activar proxy (nube naranja) en registro A de `carrot.thnet.com.ar`
5. SSL/TLS → Full (Strict)
6. Opcional: activar "Under Attack Mode" si hay DDoS

## 8. Actualizaciones automáticas de seguridad ✅ APLICADO

```bash
# unattended-upgrades instalado y activo
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

## 9. Monitoreo y logs

```bash
# Logs de la aplicación
sudo pm2 logs carrot --lines 100

# Logs de Nginx
sudo tail -f /var/log/nginx/carrot-error.log
sudo tail -f /var/log/nginx/carrot-access.log

# Intentos de acceso SSH fallidos
sudo journalctl -u sshd | grep "Failed"

# IPs baneadas por Fail2ban
sudo fail2ban-client status sshd
```

## 10. Proteger carpeta uploads en Nginx ✅ APLICADO

```nginx
location /uploads/ {
    deny all;
    return 403;
}
```

## 11. Backups automáticos de PostgreSQL ✅ APLICADO (2026-03-18)

```bash
# Script: /opt/backup-db.sh
# Cron: diario a las 3 AM
# Retención: 30 días
# Destino: /opt/backups/db_YYYYMMDD_HHMM.sql.gz
# Primer backup creado: 2026-03-18 (20K)
```

Verificar: `ls -la /opt/backups/`

## 12. PM2 logrotate ✅ APLICADO (2026-03-18)

```bash
# Instalado y configurado:
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

---

## Checklist pre-despliegue

- [x] UFW habilitado con puertos 22/80/443
- [x] SSH sin root y sin password auth (solo deploy con key ed25519)
- [x] Fail2ban activo (sshd + nginx-limit-req)
- [x] Nginx con TLS y rate limiting (/api/ 30r/s)
- [x] HSTS header configurado
- [x] Nginx bloquea `/uploads/` directamente
- [x] PostgreSQL solo en localhost con usuario dedicado (carrot_app, solo CRUD)
- [x] Backup automático de DB configurado (cron 3 AM, 30 días retención)
- [x] Secretos generados nuevos (JWT_SECRET)
- [x] MERAKI_API_KEY configurado
- [x] NODE_ENV=production en .env
- [x] `npm run build` exitoso en el VPS
- [x] Certificado TLS renovación automática verificada (certbot timer)
- [x] PM2 con logrotate configurado (50M, 7 retenciones)
- [x] Unattended-upgrades para patches de seguridad
- [ ] Cloudflare proxy (opcional — ocultar IP, WAF, DDoS)
