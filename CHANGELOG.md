# CHANGELOG — Portal Meraki Naranja

---

## [2026-03-18] — Deploy a producción + Hardening de seguridad

### Deploy VPS
- App desplegada en `carrot.thnet.com.ar` (VPS Ubuntu 24.04, 72.61.32.146).
- PM2 "carrot" en puerto 3001, Nginx reverse proxy con TLS.
- PostgreSQL 16.13 con 48 predios importados.

### Seguridad aplicada
1. **Fail2ban** — sshd (3 intentos/ban 1h) + nginx-limit-req (10 intentos/ban 10min).
2. **SSH hardening** — Usuario `deploy` con key ed25519, root login desactivado, password auth desactivado.
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

## [Próximas mejoras pendientes]

### Rendimiento
- **usePermisos → PermisosProvider**: Centralizar la carga de permisos en un Provider (actualmente solo 1 consumidor: Sidebar).
- **ISR en rutas estáticas**: Configurar `revalidate` en las rutas de API que cambian poco (configuración de firewall, VLANs, etc.).
- **Bundle splitting avanzado**: Evaluar `next/dynamic` para páginas pesadas como Topología y Switches.

### Calidad de código
- **Tipado Meraki**: Crear interfaces TypeScript para los responses de la API de Meraki (Device, Network, Organization) y eliminar los `any`.
- **Tests unitarios**: Agregar tests para `meraki.ts`, `merakiCache.ts`, y middleware de auth.
- **Storybook**: Documentar componentes UI reutilizables (Sidebar, TopBar, ErrorBoundary).

### Infraestructura
- **Health check endpoint**: Crear `/api/health` que verifique conexión a DB y API de Meraki.
- **Logs estructurados (JSON)**: Migrar a logging JSON para facilitar integración con servicios de monitoreo.
- **Docker Compose**: Archivo para desarrollo local con PostgreSQL + app.

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
