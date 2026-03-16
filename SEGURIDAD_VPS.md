# Seguridad VPS — Tareas pendientes para producción

> Estas tareas **NO se pueden aplicar en código** y deben configurarse directamente en el servidor VPS al momento del despliegue.

---

## 1. Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (redirige a HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

## 2. SSH Hardening

Editar `/etc/ssh/sshd_config`:

```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
AllowUsers tu_usuario
```

```bash
sudo systemctl restart sshd
```

## 3. Fail2ban

```bash
sudo apt install fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
```

Editar `/etc/fail2ban/jail.local`:

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
maxretry = 10
bantime = 600
```

```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## 4. Nginx Reverse Proxy + TLS

```nginx
server {
    listen 80;
    server_name tu-dominio.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tu-dominio.com;

    ssl_certificate /etc/letsencrypt/live/tu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tu-dominio.com/privkey.pem;

    # Seguridad TLS
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Headers de seguridad
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;

    # Rate limiting a nivel Nginx (complementa el rate limit del middleware)
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Certificado TLS (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com
sudo certbot renew --dry-run  # verificar renovación automática
```

## 5. PostgreSQL Hardening

```bash
# Crear usuario dedicado con permisos mínimos
sudo -u postgres psql
CREATE USER pmn_app WITH PASSWORD 'contraseña_segura_generada';
GRANT CONNECT ON DATABASE portal_meraki_naranja TO pmn_app;
GRANT USAGE ON SCHEMA public TO pmn_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pmn_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pmn_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pmn_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO pmn_app;
```

Editar `postgresql.conf`:

```
listen_addresses = 'localhost'   # solo conexiones locales
```

Actualizar `DATABASE_URL` en `.env`:

```
DATABASE_URL="postgresql://pmn_app:contraseña_segura@localhost:5432/portal_meraki_naranja"
```

## 6. Rotación de Secretos

Al desplegar a producción, **OBLIGATORIO** generar secretos nuevos:

```bash
# JWT_SECRET — mínimo 32 caracteres aleatorios
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# CRON_SECRET — token para endpoints CRON
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Actualizar `.env` con los valores generados. **NO reutilizar** los de desarrollo.

## 7. Cloudflare (opcional pero recomendado)

- Activar proxy para ocultar IP real del VPS
- Activar "Under Attack Mode" si recibe ataques DDoS
- Configurar reglas WAF básicas
- Forzar HTTPS en Cloudflare

## 8. Actualizaciones automáticas de seguridad

```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

## 9. Monitoreo y logs

```bash
# Logs de la aplicación
pm2 logs portal-meraki --lines 100

# Logs de Nginx
tail -f /var/log/nginx/error.log

# Intentos de acceso SSH fallidos
journalctl -u sshd | grep "Failed"
```

## 10. Proteger carpeta uploads en Nginx

La carpeta `/uploads` ya está bloqueada por el middleware de Next.js, pero conviene bloquearla también en Nginx como defensa en profundidad:

```nginx
# Dentro del bloque server {}
location /uploads/ {
    deny all;
    return 403;
}
```

## 11. Backups automáticos de PostgreSQL

```bash
# Crear script de backup
cat > /opt/backup-db.sh << 'EOF'
#!/bin/bash
FECHA=$(date +%Y%m%d_%H%M)
pg_dump -U pmn_app portal_meraki_naranja | gzip > /opt/backups/db_$FECHA.sql.gz
# Eliminar backups de más de 30 días
find /opt/backups -name "db_*.sql.gz" -mtime +30 -delete
EOF

chmod +x /opt/backup-db.sh
mkdir -p /opt/backups

# Programar backup diario a las 3 AM
echo "0 3 * * * /opt/backup-db.sh" | crontab -
```

## 12. Limitar acceso a PM2

```bash
# No exponer PM2 web dashboard al exterior
# Si usas pm2-logrotate para rotación de logs:
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

---

## Checklist pre-despliegue

- [ ] UFW habilitado con puertos 22/80/443
- [ ] SSH sin root y sin password auth
- [ ] Fail2ban activo
- [ ] Nginx con TLS y rate limiting
- [ ] Nginx bloquea `/uploads/` directamente
- [ ] PostgreSQL solo en localhost con usuario dedicado
- [ ] Backup automático de DB configurado
- [ ] Secretos generados nuevos (JWT_SECRET, CRON_SECRET)
- [ ] MERAKI_API_KEY configurado
- [ ] NODE_ENV=production en .env
- [ ] `npm run build` exitoso en el VPS
- [ ] Certificado TLS renovación automática verificada
- [ ] PM2 con logrotate configurado
