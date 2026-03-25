# Portal Meraki Naranja

Panel de monitoreo y gestión para redes Cisco Meraki.
Construido con Next.js 14, Prisma, PostgreSQL y Tailwind CSS.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS 3, shadcn/ui |
| Backend | API Routes (Next.js), Prisma ORM |
| Base de datos | PostgreSQL 16 |
| Autenticación | JWT con cookies httpOnly (jose + bcryptjs) |
| UI | shadcn/ui, Recharts, Leaflet, @dnd-kit, Framer Motion |
| Data layer | @tanstack/react-query, @tanstack/react-table, react-virtuoso |
| UX | sonner, cmdk, vaul, nuqs |
| Utilidades | date-fns, zod, xlsx, jspdf, html2canvas, qrcode, web-push |
| Infraestructura | PM2, Nginx, Let's Encrypt, Fail2ban |

## Requisitos previos

- Node.js >= 18
- PostgreSQL >= 15
- Acceso a una API key de Cisco Meraki (Dashboard API)

## Inicio rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Completar las variables requeridas (ver .env.example para referencia)

# 3. Sincronizar esquema de base de datos
npx prisma db push

# 4. (Opcional) Cargar datos iniciales
npx prisma db seed

# 5. Iniciar servidor de desarrollo
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`.

## Estructura del proyecto

```
src/
├── app/
│   ├── api/            # Endpoints REST (auth, tareas, predios, meraki, etc.)
│   ├── dashboard/      # Páginas del panel (15+ módulos)
│   └── login/          # Autenticación
├── components/
│   ├── ui/             # Componentes base (shadcn/ui)
│   └── layout/         # TopBar, Sidebar, navegación
├── contexts/           # Providers (Session, Network, Theme)
├── hooks/              # Custom hooks (useSession, useDashboardData, etc.)
├── lib/                # Server utils (Meraki API client, auth, cache)
├── types/              # Definiciones TypeScript
└── utils/              # Client utils (formatters, validators)
```

## Módulos

| Módulo | Descripción |
|--------|------------|
| Dashboard | KPIs, gráficos de actividad, mapa de cobertura |
| Meraki | Monitoreo de appliances, switches, APs, topología |
| Tareas | Tablero Kanban con drag-and-drop, espacios de trabajo |
| Predios | Gestión de ubicaciones con importación masiva (CSV/XLSX) |
| Calendario | Planificación visual con vista mensual/semanal |
| Facturación | Control de facturación por predio |
| Stock | Inventario de equipamiento con trazabilidad |
| Actas | Generación de documentos formales (PDF) |
| Usuarios | RBAC con tres niveles (Admin, Moderador, Técnico) |
| Hospedajes | Gestión de hospedajes y asignaciones |

## Roles y permisos

| Rol | Alcance |
|-----|---------|
| Admin | Acceso total, gestión de usuarios, permisos y configuración |
| Moderador | Gestión de tareas, stock, actas, facturación |
| Técnico | Monitoreo de red, tareas asignadas, calendario |

## Deploy a producción

Ver [DEPLOY_VPS_WORDPRESS.md](DEPLOY_VPS_WORDPRESS.md) para la guía completa de despliegue.

Los parámetros de conexión al servidor (host, usuario, rutas) se encuentran documentados de forma privada y no se incluyen en este repositorio.

## Seguridad

Ver [SEGURIDAD_VPS.md](SEGURIDAD_VPS.md) para el checklist completo.

- Acceso SSH restringido (solo clave pública, sin root, sin password)
- Protección contra fuerza bruta (Fail2ban)
- Rate limiting en endpoints de API
- Base de datos con usuario de privilegios mínimos
- TLS con renovación automática
- Backups automáticos de base de datos

## Variables de entorno

La aplicación requiere las siguientes variables (ver `.env.example`):

| Variable | Descripción |
|----------|------------|
| `DATABASE_URL` | Cadena de conexión PostgreSQL |
| `JWT_SECRET` | Secreto para firma de tokens |
| `MERAKI_API_KEY` | API key del Dashboard Meraki |
| `NEXT_PUBLIC_APP_URL` | URL base de la aplicación |

Las credenciales de producción se gestionan de forma privada y están excluidas del repositorio via `.gitignore`.

## Licencia

Proyecto privado. Todos los derechos reservados.
