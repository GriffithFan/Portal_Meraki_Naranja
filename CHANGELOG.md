# CHANGELOG — Portal Meraki Naranja

---

## [2026-04-06] — Auditoría de accesos, Cable Test (desactivado)

### Auditoría de accesos (nuevo)
- **Modelo `RegistroAcceso`** — Tabla de auditoría: logins y consultas de predios por usuario.
- **Registro automático** — Se registran logins exitosos y cada consulta de detalle de predio/espacio.
- **Página `/dashboard/auditoria`** — Visible solo para ADMIN (configurable). Filtros por usuario, tipo de acción, rango de fechas.
- **Sidebar** — Nuevo enlace "Auditoría" en la sección Administración (solo ADMIN).

### Cable Test — DESACTIVADO (requiere API key con escritura)
- **Motivo**: La API key de Meraki actual es read-only. El endpoint `POST /devices/{serial}/liveTools/cableTest` requiere scope `dashboard:general:config:write`.
- **Componente**: `CableTestPanel` en `SwitchesSection.tsx` — comentado, no eliminado.
- **API Route**: `src/app/api/meraki/devices/[serial]/cable-test/route.ts` — conservada.
- **Para reactivar**:
  1. Generar una nueva API key con permisos full en Meraki Dashboard → Perfil → API keys
  2. Actualizar `MERAKI_API_KEY` en `/var/www/carrot/.env`
  3. Descomentar el bloque `CableTestPanel` en `SwitchesSection.tsx` (buscar "Cable Test Panel — DESACTIVADO")
  4. Restaurar los botones "Cable Test" en las vistas mobile y desktop (ver git diff de este commit)
  5. `pm2 restart carrot`

### Otros
- **Fix descarga de actas** — Corregido error "Ruta no permitida" al descargar actas (strip leading slash).
- **Restricciones columnas** — Drawer de columnas y drag-and-drop solo para admin/mod.
- **Permisos estados por usuario** — Nuevo modelo `PermisoEstadoUsuario`, tab "Por usuario" en permisos.

---

## [2026-03-28] — Stock: Reestructuración columnas, Asignado, Etiquetas, Carga total, Importación inteligente

### Stock — Reestructuración de columnas
- **Columnas eliminadas** — Removidas `cantidad`, `marca`, `categoría` de DEFAULT_COLUMNS y formulario de creación.
- **DEFAULT_COLUMNS (8)** — nombre, modelo, N/S, estado, asignado, ubicación, notas, descripción.

### Stock — Columna Asignado (Técnico)
- **Dropdown de técnicos** — Selector en celda de tabla que muestra usuarios activos (fetch `/api/usuarios`).
- **Cambio directo** — MOD/ADMIN pueden asignar técnico desde la tabla sin abrir modal.
- **Modelo Prisma** — Nuevo campo `asignadoId` (FK → User), relación `EquipoAsignado`.
- **API stock GET** — Incluye `asignado: { select: { id, nombre } }` en la respuesta.
- **API stock POST/PUT** — Aceptan `asignadoId` para asignar técnico.

### Stock — Sistema de Etiquetas con colores
- **Badge junto al nombre** — Etiqueta con color personalizable visible en la celda de nombre.
- **10 colores predefinidos** — Rojo, naranja, ámbar, verde, esmeralda, cyan, azul, violeta, rosa, gris.
- **Editor inline** — Clic en badge abre editor con input de texto + selector de color.
- **CRUD etiqueta** — Guardar, editar y eliminar etiqueta por equipo (PUT /api/stock/[id]).
- **Modelo Prisma** — Nuevos campos `etiqueta` (String?) y `etiquetaColor` (String?).

### Stock — Carga de todos los equipos
- **API stock** — Límite default cambiado de 100 a 5000, máximo de 500 a 10000.
- **Frontend** — `fetchEquipos()` ahora envía `limit=5000` para cargar la totalidad (830+ equipos).

### Importación — Auto-asignación de técnico
- **Nuevo campo "asignado"** — Agregado a `equipoAliases` con aliases: asignado, asignado_a, tecnico, técnico, technician, asignación.
- **EQUIPO_FIELDS** — Nuevo campo `Asignado (Técnico)` en dropdown de mapeo de columnas.
- **Matching inteligente** — Busca usuario por nombre parcial, case-insensitive y sin acentos (normalización NFD + strip diacríticos).
- **Ejemplos** — `th07` → TH07, `enzò` → Enzo, `josé` → Jose. Funciona en ambas direcciones.
- **Pre-carga** — Usuarios activos se cargan una sola vez antes del loop de importación.

---

## [2026-03-28] — Stock: Sistema de columnas, eliminación, importación mejorada, exportación html-to-image

### Stock — Sistema de columnas personalizable
- **StockColumn interface** — Columnas con id, label, field, visible, editable, type (text/select/number).
- **Drag & drop** — Reordenar columnas arrastrando cabeceras (HTML5 DragEvents).
- **Inline editing** — Doble clic en celda para editar cualquier campo. Enter para guardar, Escape para cancelar.
- **Sorting** — Clic en cabecera para ordenar asc/desc. Indicadores ▲▼.
- **Visibilidad** — Toggles de columnas en SectionSettings. Botón "Restablecer columnas".
- **Persistencia** — Configuración guardada en localStorage (`pmn-stock-col-config`): orden y visibilidad.
- **10 columnas** — nombre, modelo, marca, N/S, cantidad, estado, categoría, ubicación, notas, descripción.

### Stock — Eliminación de equipos
- **Eliminar equipo individual** — Botón de eliminar por fila (visible en hover, solo ADMIN). Confirmación con modal.
- **Limpiar campo** — Botón ✕ al editar inline para vaciar el valor del campo (excepto nombre). Optimistic update con rollback.
- **Eliminar todo el stock** — Botón en SectionSettings (solo ADMIN). Modal de confirmación con conteo de equipos.
- **API DELETE bulk** — `api/stock/route.ts` DELETE: elimina todos los equipos con registro en papelera y actividad.
- **Papelera** — Tanto eliminación individual como masiva guardan datos en papelera antes de borrar.

### Importación — Auto-detección de campos EQUIPO
- **equipoAliases** — Mapa de aliases para auto-detección de columnas en importar/page.tsx: nombre, descripcion, numeroSerie (n/s, serial, serie), modelo, marca, cantidad, estado, categoria, ubicacion (location), notas.
- **predioAliases** — Separado del mapa de equipos, mantiene aliases para predios.

### Importación — Límite ampliado
- **Parse limit** — Cambiado de 200 a 2000 filas en `api/importar/parse/route.ts`.

### Exportación — html-to-image (fix oklch)
- **html2canvas → html-to-image** — Reemplazado html2canvas por html-to-image (toCanvas) para soportar colores oklch() de Tailwind CSS v4.
- **jspdf** — Mantiene PDF generation con canvas de html-to-image.
- **Nombres personalizados** — Archivos exportados con nombre de sección y fecha.

---

## [2026-03-26] — Permisos Gestión/Recursos, Chat RBAC Mesa, Imágenes en Instructivos

### Permisos por rol (Gestión y Recursos)
- **Hospedajes** — Visible para todos los roles. Técnicos solo lectura (sin editar/eliminar/crear). Usa `usePermisos` con `puedeEditar("hospedajes")`.
- **Actas** — Visible para todos los roles. Técnicos solo lectura. Usa `usePermisos` con `puedeEditar("actas")`.
- **Instructivos** — Visible para todos. Técnicos solo lectura. Usa `usePermisos` con `puedeEditar("instructivo")`.
- **usePermisos.ts** — TECNICO `puedeVer` defaults ahora incluyen `hospedajes` y `actas`.

### Chat — RBAC con sub-rol Mesa
- **Admin/Mod sin esMesa** — Ven todas las conversaciones en modo solo lectura. No pueden responder ni tomar conversaciones. Ven nombres reales (no anonimizados).
- **esMesa** — Funcionalidad completa: tomar, responder, cerrar conversaciones.
- **Técnicos** — Solo ven su propio historial de consultas (filtro por `creadorId`).
- **API chat/route.ts** — GET incluye `esAdminOMod` para listar todas las conversaciones.
- **API chat/[id]/route.ts** — GET permite acceso a admin/mod. Anonymización desactivada para admin/mod.
- **API chat/sin-leer/route.ts** — Incluye admin/mod en conteo de mensajes sin leer.
- **chat/page.tsx** — Variable `soloLectura = isModOrAdmin && !isMesa`. Título contextual. Oculta input y botón "Tomar" en modo solo lectura.
- **usuarios/page.tsx** — Badge "Mesa" (azul) visible en tarjetas mobile y tabla desktop para usuarios con `esMesa: true`.

### Instructivos — Soporte de imágenes
- **Modelo Prisma** — Nuevos campos: `imagenNombre`, `imagenRuta`, `imagenTipo`, `imagenSize`.
- **API POST/PUT** — Acepta campo `imagen` (JPG, PNG, WebP, GIF, máx 25MB). Validación MIME y extensión. Almacenamiento en `uploads/instructivos/` con prefijo `img-`.
- **API DELETE** — Elimina tanto video como imagen del filesystem.
- **API video/[filename]** — MIME types ampliados para servir imágenes (.jpg, .png, .webp, .gif).
- **Frontend visor** — Visor de imagen con zoom fullscreen (click → `requestFullscreen`). Icono verde esmeralda para instructivos con imagen.
- **Frontend formulario** — Sección de upload de imagen independiente del video. Misma UX: seleccionar, quitar, eliminar existente. Progreso compartido con video.
- **Función `deleteVideoFile`** → renombrada a `deleteUploadFile` (genérica para video e imagen).

---

## [2026-03-20] — Animaciones, Responsive, Prisma fix, Lint fix

### Animaciones y Responsive (global)
- `tailwind.config.ts` — Nuevas animaciones: slide-in-left, slide-up, shimmer, count-up, card-enter. Fix: `require("tailwindcss-animate")` → ESM import (eliminó error de lint).
- `globals.css` — Nuevas utilidades CSS: `.skeleton-shimmer`, `.card-hover`, `.stagger-children`, `.row-animate`, `.mobile-card-table`.

### Páginas mejoradas (animaciones + responsive)
- **KPIs** — AnimatePresence, stagger-children, card-hover, count-up animado, grids responsive.
- **Stock** — mobile-card-table, AnimatePresence modal slide-up, filtros responsive, columnas ocultas en mobile.
- **Actividad** — stagger-children, row-animate, header/filtros/lista responsive.
- **Bandeja** — stagger-children, tamaños responsive, active:scale press effect.
- **Calendario** — AnimatePresence, botones touch-friendly (`px-4 py-2 sm:px-3`), filtro `w-full sm:w-auto`, semana con scroll horizontal (`min-w-[560px]`), modal slide-up desde bottom en mobile (`items-end sm:items-center`, `rounded-t-2xl sm:rounded-xl`), categorías `grid-cols-2 sm:grid-cols-4`.
- **Sidebar** — Backdrop con transición opacity (sin flash), drawer con slide `translate-x` + `duration-300 ease-out`, nav links con `hover:translate-x-0.5`.

### Fix crítico: /api/tareas 500
- **Problema**: `PrismaClientKnownRequestError: column 'existe' does not exist` — error engañoso de Prisma 5.x.
- **Causa real**: 7 columnas en `schema.prisma` (modelo Predio) no existían en la DB: `tipoRed`, `codigoPostal`, `caracteristicaTelefonica`, `telefono`, `lab`, `nombreInstitucion`, `correo`.
- **Fix**: `prisma db push` sincronizó schema → DB, agregando las 7 columnas faltantes.
- **Fix secundario**: BOM UTF-8 (bytes EF BB BF) removido de migración `20260311000000_sync_instructivo_and_indexes/migration.sql`.

---

## [2026-03-20] — shadcn/ui + Librerías utilitarias + Bug fix bulk-delete

### Bug fix
- **Eliminación masiva "SIN ASIGNAR"**: Corregido bug por el cual al borrar un grupo de tareas solo se eliminaban los IDs del batch visible (100). Ahora el endpoint DELETE `/api/tareas?estadoId=xxx` borra TODOS los registros del estado directamente en BD y re-fetch después de la operación.

### shadcn/ui (adaptado a Tailwind CSS 3)
- Inicializado shadcn@4.1.0 con adaptaciones para TW3 (removidos imports TW4: `shadcn/tailwind.css`, `tw-animate-css`, `outline-ring/50`).
- Instalado `tailwindcss-animate` como plugin TW3.
- CSS variables oklch personalizadas para paleta Cerulean Blue + Grenadier.
- Componentes instalados: avatar, badge, button, calendar, card, chart, command, dialog, dropdown-menu, input, label, popover, select, separator, sheet, skeleton, table, tabs, tooltip.

### Librerías utilitarias
- `framer-motion` — animaciones declarativas
- `sonner` — toasts/notificaciones
- `cmdk` — command palette (⌘K)
- `@tanstack/react-table` — tablas headless
- `@tanstack/react-query` — data fetching/cache
- `nuqs` — estado en query params
- `vaul` — drawers móviles
- `date-fns` — utilidades de fechas
- `react-virtuoso` — listas virtualizadas
- `next-themes` — soporte de temas

### Configuración
- `.npmrc` con `legacy-peer-deps=true` (react-leaflet@5 requiere React 19, proyecto usa React 18).
- `components.json` — configuración shadcn/ui.
- `src/lib/utils.ts` — función `cn()` (clsx + tailwind-merge).
- `tailwind.config.ts` — colores CSS-variable para shadcn, borderRadius, plugin tailwindcss-animate.

### Dark mode v3 (sesión previa)
- Cobertura completa: AccessPointComponents, ApplianceHistoricalCharts, archivos CSS legacy.
- Paleta Cerulean Blue (#006CB7) + Grenadier (#D34600) + superficie blue-tinted.
- Jerarquía tonal dark: page `#0f172a` → container `#131c2e` → card `#1a2332` → elevated `#1e293b` → active `#263549`.

---

## [2026-03-18] — Deploy a producción + Hardening de seguridad

### Deploy VPS
- App desplegada en VPS Ubuntu 24.04 con subdominio dedicado.
- PM2 con Nginx reverse proxy y TLS.
- PostgreSQL 16.13 con 48 predios importados.

### Seguridad aplicada
1. **Fail2ban** — sshd (3 intentos/ban 1h) + nginx-limit-req (10 intentos/ban 10min).
2. **SSH hardening** — Usuario dedicado con key ed25519, root login desactivado, password auth desactivado.
3. **PostgreSQL hardening** — Usuario `carrot_app` con permisos CRUD-only (sin DDL).
4. **Nginx rate limiting** — `/api/` limitado a 30r/s burst=20.
5. **Nginx HSTS** — max-age=31536000; includeSubDomains.
6. **Nginx /uploads/** — Bloqueado con 403.
7. **PM2 logrotate** — 50M, 7 retenciones, compresión.
8. **Backups PostgreSQL** — Cron diario 3 AM, retención 30 días.
9. **Secretos regenerados** — JWT_SECRET y credenciales de producción nuevos.
10. **CREDENCIALES.md** — Archivo con todas las credenciales, excluido de git.

---

## [2026-03-18] — ClickUp Integration + Estados + Workspaces

### Gestión de predios
1. **Importación ClickUp** — 48 predios importados con mapeo completo de campos.
2. **12 estados configurables** — Importados desde ClickUp con colores y orden.
3. **StatusIcon component** — Iconos SVG por clave de estado con colores dinámicos.
4. **Espacios de trabajo** — Jerarquía de carpetas con estadísticas agregadas.
5. **Fix workspace creation** — Corrección de bug en cascade de permisos.

---

## [2025-07-11] — Lote 4: Optimización de rendimiento (navegación entre secciones)

### Problema
Lentitud al navegar entre secciones (Switches, APs, Topología, Appliance). Cada selección de red disparaba 4 API sections en paralelo (~40-120 llamadas a Meraki), independientemente de qué sección visitara el usuario.

### Mejoras aplicadas

1. **Eliminar prefetch de todas las secciones** — `src/contexts/NetworkContext.tsx`
   - **Antes**: Al seleccionar red, se cargaban las 4 secciones (`topology`, `switches`, `access_points`, `appliance_status`) automáticamente.
   - **Ahora**: Cada sección solo se carga cuando el usuario navega a ella. Las páginas ya tenían `loadSection()` en su propio `useEffect`.
   - **Impacto**: ~80% menos llamadas API en la selección de red.

2. **Paralelizar datos base en section route** — `src/app/api/meraki/networks/[networkId]/section/[sectionKey]/route.ts`
   - **Antes**: `network info` → `devices` → `statuses` se cargaban secuencialmente (3 llamadas en cascada).
   - **Ahora**: `devices` y `statuses` se cargan en paralelo con `Promise.all()` tras obtener `network info`.
   - **Impacto**: ~30-40% menos latencia en la carga inicial de cada sección.

3. **TTLs diferenciados en caché** — `src/lib/merakiCache.ts`, `section/[sectionKey]/route.ts`
   - **Antes**: TTL único de 5 min para todo.
   - **Ahora**: TTL.SLOW (10 min) para datos que cambian rara vez (topología, dispositivos, config); TTL.FAST (3 min) para datos de estado (statuses, ports, availability).
   - **Impacto**: Menos refetches innecesarios, datos de estado siguen frescos.

4. **Stale-while-revalidate en frontend** — `src/contexts/NetworkContext.tsx`
   - **Antes**: Al expirar el cache de una sección, se mostraba spinner mientras se recargaba.
   - **Ahora**: Patrón stale-while-revalidate — muestra datos anteriores inmediatamente, refresca en background sin spinner.
   - **Impacto**: Navegación instantánea entre secciones ya visitadas.

5. **Cache-Control HTTP en section API** — `section/[sectionKey]/route.ts`, `next.config.mjs`
   - **Antes**: `no-store` en todas las rutas API.
   - **Ahora**: Rutas Meraki section devuelven `Cache-Control: private, max-age=60, stale-while-revalidate=240`. Rutas API no-Meraki mantienen `no-store`.
   - **Impacto**: El browser cachea respuestas, evitando roundtrips al server en navegación rápida.

---

### Mejoras aplicadas

1. **safeGet: logging de errores** — `src/lib/meraki.ts`
   - **Antes**: `catch { return fallback; }` — silenciaba todos los errores, haciendo imposible diagnosticar fallos.
   - **Ahora**: Loggea errores con path y status HTTP. Los 404 se ignoran (esperados en endpoints opcionales).
   - **Impacto**: 20+ funciones que usan `safeGet` ahora reportan fallos reales al log.

2. **fetchAllPages: timeout total de 60s** — `src/lib/meraki.ts`
   - **Antes**: Solo límite de `maxPages=100`, sin protección contra paginación infinita o API lenta.
   - **Ahora**: `AbortController` con timeout de 60s (configurable via `timeoutMs`). Se limpia automáticamente con `finally`.
   - **Impacto**: Previene que una llamada paginada bloquee el servidor indefinidamente.

3. **getOrganizationDevicesStatuses: paginación real** — `src/lib/meraki.ts`
   - **Antes**: `client.get(...)` simple, limitado a la primera página (~1000 devices).
   - **Ahora**: Usa `fetchAllPages()` para obtener todos los dispositivos en organizaciones grandes.
   - **Impacto**: Organizaciones con >1000 dispositivos ahora reportan datos completos.

---

## [2025-07-10] — Lote 2: Optimizaciones de rendimiento y DX

### Mejoras aplicadas

4. **NetworkContext useMemo + useEffect** — `src/contexts/NetworkContext.tsx`
   - Provider value envuelto en `useMemo` para evitar re-renders innecesarios.
   - Prefetch movido de side-effect en render a `useEffect` correcto.

5. **SessionProvider (eliminar N+1 fetches)** — `src/contexts/SessionContext.tsx` (nuevo)
   - Creado Context centralizado: un solo fetch a `/api/auth/me` por sesión.
   - `useSession()` ahora re-exporta del Provider en vez de hacer fetch independiente.
   - Layout envuelto con `<SessionProvider>` en `src/app/dashboard/layout.tsx`.

6. **Lazy load html2canvas/jspdf** — `src/components/ui/ExportableSection.tsx`
   - Cambiado de import estático (~800KB) a `await import()` dinámico dentro de handlers.
   - Solo se descarga cuando el usuario realmente exporta.

7. **Eliminar código muerto** — `src/hooks/useDashboardData.ts` (eliminado)
   - 120 líneas sin importadores. Archivo eliminado.

8. **Extraer iconos SVG compartidos** — `src/components/ui/Icons.tsx` (nuevo)
   - 7 iconos reutilizables: IconX, IconChevron, IconCheck, IconClock, IconSort, IconSettings, IconPlus.
   - Reemplazados ~75 líneas de SVG inline en `tareas/page.tsx` y `TareaDetalleModal.tsx`.

9. **Prisma onDelete en FKs** — `prisma/schema.prisma`
   - 8 relaciones con `onDelete` explícito: Cascade para datos dependientes, SetNull para opcionales.
   - Previene errores de FK constraint al eliminar usuarios/predios.

10. **Paginación real en tareas y actas** — `src/app/api/tareas/route.ts`, `src/app/api/actas/route.ts`
    - Parámetros `page` y `limit` con `skip` de Prisma.
    - Response incluye `{ total, page, limit }` para paginación frontend.

11. **Axios retry interceptor para 429** — `src/lib/meraki.ts`
    - Auto-retry hasta 3 intentos cuando Meraki devuelve rate limit (429).
    - Respeta header `Retry-After` para el delay.

12. **Scripts DX en package.json** — `package.json`
    - Agregados: `lint:fix`, `db:migrate`, `db:push`, `db:seed`, `db:studio`, `db:reset`, `postinstall`.

13. **Dashboard overview usa caché** — `src/app/api/dashboard/overview/route.ts`
    - `getOrganizationDevicesStatuses` y `getNetworks` envueltos en `getOrFetch` con TTL de 5 min.
    - Reduce llamadas a la API de Meraki en endpoints frecuentes.

14. **Cron monitoreo: procesamiento paralelo** — `src/app/api/cron/monitoreo/route.ts`
    - Loop secuencial `for` convertido a `Promise.allSettled` para redes.
    - Checks internos (AP speed + CRC) también en paralelo.

---

## [2025-07-09] — Lote 1: Hardening de seguridad

### Mejoras aplicadas

15. **Auth timing-safe** — `src/lib/auth.ts`
    - Comparación de contraseñas resistente a timing attacks usando `timingSafeEqual`.

16. **Validación Zod en 22 rutas API** — `src/app/api/**/route.ts`
    - Todos los endpoints que reciben JSON body validados con esquemas Zod.
    - Errores devuelven 400 con mensajes descriptivos.

17. **Headers CSP + HSTS** — `next.config.mjs`
    - Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options.

18. **Validación de variables de entorno** — `src/lib/env.ts`
    - Validación al arranque con Zod: falla rápido si faltan vars requeridas.

19. **Auth hardening** — `src/middleware.ts`, `src/lib/auth.ts`
    - Cookie httpOnly + sameSite=strict + secure en producción.
    - Expiración JWT 8 horas.

20. **Rate limiting** — `src/middleware.ts`
    - 120 requests/minuto/IP en rutas API.
    - Headers `X-RateLimit-*` informativos.

21. **Body size limit** — `next.config.mjs`
    - Límite de 1MB en body de requests API.

22. **Validación MIME** — `src/middleware.ts`
    - Rechaza requests con Content-Type no esperado en rutas JSON.

23. **Documentación de seguridad VPS** — `SEGURIDAD_VPS.md`
    - Guía completa: firewall, SSH, fail2ban, certificados, backups, monitoreo.
