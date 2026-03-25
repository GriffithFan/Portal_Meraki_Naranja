# Portal Meraki Naranja

Panel de monitoreo y gestión para redes Cisco Meraki. Construido con Next.js 14, Prisma, PostgreSQL y Tailwind CSS.

> **Producción**: https://carrot.thnet.com.ar
> **VPS**: Ubuntu 24.04 — 72.61.32.146

## Stack

- **Frontend**: Next.js 14 (App Router), React 18, Tailwind CSS 3, shadcn/ui
- **Backend**: API Routes (Next.js), Prisma ORM
- **Base de datos**: PostgreSQL 16
- **Autenticación**: JWT con cookies httpOnly (jose + bcryptjs)
- **UI Components**: shadcn/ui (Radix primitives), Recharts, Leaflet, @dnd-kit
- **Animaciones**: Framer Motion, tailwindcss-animate
- **Data**: @tanstack/react-query, @tanstack/react-table, react-virtuoso
- **UX**: sonner (toasts), cmdk (command palette), vaul (drawers), nuqs (URL state)
- **Utilidades**: date-fns, zod, clsx, xlsx, jspdf, html2canvas, qrcode, web-push
- **Producción**: PM2, Nginx, Let's Encrypt, Fail2ban

## Inicio rápido

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con credenciales de DB y API key de Meraki

# Sincronizar base de datos
npx prisma db push

# Iniciar en desarrollo
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Estructura

```
src/
├── app/
│   ├── api/          # Endpoints REST
│   ├── dashboard/    # Páginas del panel
│   └── login/        # Autenticación
├── components/
│   ├── ui/           # shadcn/ui (button, card, chart, table, dialog, badge, etc.)
│   └── ...           # Componentes custom (TopBar, Sidebar, KPI, Meraki, etc.)
├── contexts/         # Providers (Session, Network, Theme)
├── hooks/            # Custom hooks
├── lib/              # Utilidades del servidor (Meraki, auth, cache)
├── types/            # Definiciones TypeScript
└── utils/            # Utilidades del cliente
```

## Roles

- **Admin**: Acceso total, gestión de usuarios y permisos
- **Moderador**: Gestión de tareas, stock, actas, facturas
- **Técnico**: Monitoreo, tareas asignadas, calendario

## Deploy a producción

Ver [DEPLOY_VPS_WORDPRESS.md](DEPLOY_VPS_WORDPRESS.md) para la guía completa.

```bash
ssh -i ~/.ssh/id_ed25519 deploy@72.61.32.146
cd /var/www/carrot
git pull && npm ci --omit=dev && npm run build && pm2 restart carrot
```

## Seguridad

Ver [SEGURIDAD_VPS.md](SEGURIDAD_VPS.md) para el checklist completo de seguridad aplicado.

- SSH hardening (solo key ed25519, sin root, sin password)
- Fail2ban (sshd + nginx-limit-req)
- Rate limiting Nginx (/api/ 30r/s)
- PostgreSQL con usuario CRUD-only (sin DDL)
- TLS con renovación automática (certbot)
- Backups automáticos de DB (cron 3 AM)

## Credenciales

Las credenciales de producción están en `CREDENCIALES.md` (excluido de git via `.gitignore`).
