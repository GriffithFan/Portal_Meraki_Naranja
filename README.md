# Portal Meraki Naranja

Panel de monitoreo y gestión para redes Cisco Meraki. Construido con Next.js 14, Prisma, PostgreSQL y Tailwind CSS.

## Stack

- **Frontend**: Next.js 14 (App Router), React, Tailwind CSS
- **Backend**: API Routes (Next.js), Prisma ORM
- **Base de datos**: PostgreSQL
- **Autenticación**: JWT con cookies httpOnly
- **Producción**: PM2, Nginx

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
├── components/       # Componentes reutilizables
├── hooks/            # Custom hooks
├── lib/              # Utilidades del servidor
├── types/            # Definiciones TypeScript
└── utils/            # Utilidades del cliente
```

## Roles

- **Admin**: Acceso total, gestión de usuarios y permisos
- **Moderador**: Gestión de tareas, stock, actas, facturas
- **Técnico**: Monitoreo, tareas asignadas, calendario
