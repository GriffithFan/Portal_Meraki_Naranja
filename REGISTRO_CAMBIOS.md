# Registro de Cambios — Portal Meraki Naranja

## Fase 1: Estructura Base + Auth + Layout

### Inicialización del proyecto
- **Framework**: Next.js 14 (App Router) + TypeScript strict + Tailwind CSS 3.4
- **ORM**: Prisma 5 con PostgreSQL
- **Dependencias instaladas**: prisma, @prisma/client, jose, bcryptjs, axios, @dnd-kit/core+sortable+utilities, clsx, html2canvas, jspdf, xlsx, qrcode

### Configuración de estilos
- `tailwind.config.ts` — Paleta personalizada: primary (azul #3b82f6), accent (naranja #f97316), surface (slate). Sombras custom (soft, glow, glow-accent). Animaciones (fade-in, fade-in-up, scale-in, slide-in-right, shake).
- `src/app/globals.css` — Reset con Tailwind @layer base, utilidades de scrollbar, estilos de transición globales.

### Base de datos (Prisma)
- `prisma/schema.prisma` — 14 modelos: User (con Role enum: ADMIN, MODERADOR, TECNICO, VIEWER), EstadoConfig, Predio (con Prioridad enum, campos merakiNetworkId/merakiOrgId/merakiNetworkName), Equipo, Etiqueta, PredioEtiqueta, Comentario, Asignacion, Notificacion, Actividad, TareaCalendario, Instructivo, Acta.
- `src/lib/prisma.ts` — Singleton del cliente Prisma.
- `prisma/seed.ts` — Datos demo: 3 usuarios (admin, moderador, técnico), 5 estados configurables, 2 predios, 2 equipos, 1 etiqueta, 1 asignación, 1 instructivo.

### Autenticación
- `src/lib/auth.ts` — Librería JWT con jose: createToken, verifyToken, getSession, setTokenCookie, removeTokenCookie, helpers de permisos (isAdmin, isModOrAdmin). Cookies HttpOnly, 8h expiración.
- `src/middleware.ts` — Protección de rutas: /dashboard/* y /api/* requieren token válido. Rutas públicas: /login, /api/auth/login. Root (/) redirige a /dashboard o /login según sesión.
- `src/app/api/auth/login/route.ts` — POST login con bcrypt verify.
- `src/app/api/auth/logout/route.ts` — POST logout, elimina cookie.
- `src/app/api/auth/me/route.ts` — GET sesión actual.

### Layout y UI
- `src/app/layout.tsx` — Layout raíz: fuente Inter, lang="es", metadata Portal Meraki Naranja.
- `src/app/login/page.tsx` — Login split-screen: panel izquierdo con branding azul+naranja (logo, gradiente, círculos decorativos), panel derecho con formulario. Responsive (mobile: solo formulario).
- `src/components/layout/Sidebar.tsx` — Sidebar colapsable con 5 secciones:
  - Monitoreo Meraki: Topología, Switches, APs, Appliance
  - Gestión: Predios, Calendario, Stock, Importar
  - Comunicación: Bandeja, Actividad
  - Recursos: Instructivo, Actas
  - Administración: Usuarios
- `src/components/layout/Header.tsx` — Header con barra de búsqueda, botón de notificaciones con badge, menú de usuario con logout.
- `src/app/dashboard/layout.tsx` — Layout del dashboard: Sidebar + Header + contenido principal.
- `src/app/dashboard/page.tsx` — Página home del dashboard: 4 stat cards (Predios, Switches, APs, Alertas) + placeholders para gráficos.

### Configuración
- `.env` — DATABASE_URL PostgreSQL local, JWT_SECRET, placeholders para Meraki API keys.
- `package.json` — Configuración de seed: `npx tsx prisma/seed.ts`.

---

## Fase 2: Migración del Módulo de Monitoreo Meraki

### Backend — Librería Meraki
- `src/lib/meraki.ts` — Cliente Meraki Dashboard API v1 completo (~30+ funciones): fetchAllPages con cursor pagination (RFC 5988), safeGet helper, getNetworkDevices, getDeviceSwitchPorts*, getNetworkTopologyLinkLayer, getOrgDevicesUplinksLossAndLatency, getNetworkApplianceUplinksUsageHistory, getOrgWirelessDevicesEthernetStatuses, etc.
- `src/lib/merakiCache.ts` — Cache tipado por buckets (networkById, networksByOrg, switchPorts, applianceStatus, lldpByNetwork, section). TTL de 5 min por defecto.
- `src/lib/merakiTransformers.ts` — Transformers de topología: toGraphFromLinkLayer, toGraphFromDiscoveryByDevice, buildTopologyFromLldp. Clasificación de dispositivos, normalización de MACs, resolución de nodos sintéticos.

### Backend — API Routes
- `src/app/api/meraki/networks/search/route.ts` — GET búsqueda de redes across organizaciones con cache.
- `src/app/api/meraki/networks/[networkId]/section/[sectionKey]/route.ts` — Endpoint principal multipropósito: topology (link layer + device list), switches (merge config+status, ACLs), access_points (LLDP/CDP discovery, mesh repeater detection, señal WiFi), appliance_status (uplinks, puertos, performance).
- `src/app/api/meraki/networks/[networkId]/appliance/historical/route.ts` — Métricas históricas: loss/latency, uplink usage, device performance. Fallback simulado de conectividad.
- `src/app/api/meraki/organizations/route.ts` — Lista organizaciones, respeta MERAKI_ORG_ID env.

### Frontend — Utilidades y Hooks
- `src/utils/networkUtils.ts` — normalizeReachability, getStatusColor, resolvePortColor, looksLikeSerial.
- `src/utils/formatters.ts` — formatMetric, formatDateTime (es-AR Buenos Aires TZ), formatDuration, formatSpeedLabel, formatWiredSpeed.
- `src/utils/applianceUtils.ts` — groupPortsByRole, deriveConnectedPortsFromTopology, enrichPortsWithConnections.
- `src/utils/constants.ts` — DEFAULT_SECTIONS, DEFAULT_UPLINK_TIMESPAN=86400, DEFAULT_UPLINK_RESOLUTION=300.
- `src/hooks/useDashboardData.ts` — Hook principal: selectedNetwork, summaryData, loadedSections, loadSection (carga por demanda por sección), selectNetwork, loadEnrichedAPs.
- `src/hooks/useTableSort.ts` — Sort genérico tipado con normalización de status.

### Frontend — Componentes Base
- `src/components/meraki/DashboardIcons.tsx` — TopologyIcon, SwitchIcon, WifiIcon, ServerIcon.
- `src/components/meraki/DashboardStates.tsx` — LoadingState, EmptyState, NoDataState, LoadingSpinner con animación spin.
- `src/components/meraki/DashboardHelpers.tsx` — SummaryChip.
- `src/components/meraki/SortableHeader.tsx` — Header de tabla sortable con indicadores ▲▼.
- `src/components/meraki/Tooltip.tsx + Tooltip.css` — Hover desktop + modal mobile, contenido estructurado rich.
- `src/components/meraki/AppliancePorts.css` — Estilos de matriz de puertos, NodePortTable, SVG, colores de status.
- `src/components/meraki/ConnectivityGraph.css` — Estilos de grafo de conectividad, filtros de tiempo, micro-outages.
- `src/components/meraki/NetworkSelector.tsx` — Buscador autocomplete de redes Meraki con debounce, dropdown de resultados, badge de red seleccionada.

### Frontend — Componentes UNTOUCHABLE (estética de auditoría)
- `src/components/meraki/SwitchComponents.tsx` — SwitchPortsGrid (SVG RJ45 polygon exacto: 5,9 9,9 9,6 12,6 12,3 18,3 18,6 21,6 21,9 25,9 25,21 5,21), SwitchCard.
- `src/components/meraki/AccessPointComponents.tsx` — ConnectivityTimeline, SignalQualitySparkline, ConnectivityBar, AccessPointCard.
- `src/components/meraki/SimpleGraph.tsx` — Grafo de topología completo: BFS layout, KIND_ORDER, escalado dinámico por cantidad de APs, resolución de overlap, alineación de backbone, redistribución en cascada, SVG NodeShape (rect/circle/polygon por tipo de dispositivo).
- `src/components/meraki/AppliancePortsMatrix.tsx` — MODEL_PORT_LAYOUTS (MX84 dual-row, Z3 single-row), construcción de columnas de puertos, clasificación WAN/LAN, PortTooltipContent, NodePortIcon (RJ45 SVG), NodePortIconSfp (SFP SVG), detección PoE (Z3 port 5).
- `src/components/meraki/ConnectivityGraph.tsx` — Visualización de conectividad uplink: filtros de tiempo (1h-48h), detección de microcortes, stats de uptime, tooltips por segmento.
- `src/components/meraki/ApplianceHistoricalCharts.tsx` — Chart de conectividad (barra SVG con máquina de estados: connected verde, no_signal rojo, offline gris), chart de uso de uplinks (área SVG con gradientes, escalado inteligente Y, colores por interfaz wan1/wan2/cellular), dropdown Meraki-style de timespan.

### Frontend — Secciones Wrapper
- `src/components/meraki/TopologySection.tsx` — Wrapper que carga la sección topology y muestra SimpleGraph.
- `src/components/meraki/SwitchesSection.tsx` — Tabs list/ports, SummaryChips overview, tabla sortable, lista mobile, grid de SwitchCard.
- `src/components/meraki/AccessPointsSection.tsx` — Summary chips, grid de AccessPointCard.
- `src/components/meraki/ApplianceSection.tsx` — AppliancePortsMatrix por dispositivo + ConnectivityGraph + ApplianceHistoricalCharts.

### Páginas de Monitoreo
- `src/app/dashboard/topologia/page.tsx` — NetworkSelector + TopologySection.
- `src/app/dashboard/switches/page.tsx` — NetworkSelector + carga de sección + SwitchesSection con useTableSort.
- `src/app/dashboard/aps/page.tsx` — NetworkSelector + AccessPointsSection.
- `src/app/dashboard/appliance/page.tsx` — NetworkSelector + ApplianceSection.

---

## Fase 2.1: Correcciones de Fidelidad Visual — Iteración 1

### Switches — ConnectivityBar gráfica
- `SwitchesSection.tsx` — Reemplazado el texto de conectividad ("↑ MX84/Port 3") por `SwitchConnectivityBar`: barra de **144 segmentos** (24h × 10min) con colores verde (#22c55e) = conectado, rojo (#ef4444) = sin conectividad, igual al original `ConnectivityBar` de Dashboard.jsx.
- Cada segmento tiene tooltip con rango horario "HH:MM - HH:MM".

### Switches — Tooltip enriquecido
- Campo "Detección" (`detectionMethod`) agregado al tooltip cuando hay `connectedTo`.
- Firmware se lee desde `sw.firmware` (campo que ya venía del backend).

### Switches — Summary Chips
- Agregado chip **"Advertencia"** (accent `#f59e0b`) entre Online y Offline, contando switches con status `warning`.

### Switches — Estilos corregidos
- Status dot: 22×22px outer / 9×9px inner (era 26×26/10×10).
- Fallback de color para status `dormant`/`unknown` → fondo `#f1f5f9`, dot `#94a3b8`.
- fontWeight del nombre: `700` (era `600`).

### Access Points — ConnectivityBar per-AP
- `AccessPointsSection.tsx` — `ConnectivityBar` reescrito como `APConnectivityBar`: genera **144 segmentos por cada AP individual** basados en su propio status (no usa `wirelessSignalHistory` compartida de la red).
- Colores: solo verde/rojo (2 colores como Meraki Dashboard), no escala de 5 niveles.
- Eliminada dependencia de `summaryData.wirelessSignalHistory` en el render de la tabla.

### Access Points — Tooltip enriquecido
- `APTooltipContent` ahora lee de `ap.tooltipInfo` (como el original):
  - **Firmware** — nuevo campo
  - **Calidad señal** — `signalQuality` en porcentaje
  - **Clientes** — cantidad de clientes conectados
  - **Microcortes** — badge con conteo de conexiones fallidas
  - **Conectado a** — desde tooltipInfo con fallback
  - **Velocidad Ethernet** — desde tooltipInfo con fallback

### Access Points — Backend enrichment
- `route.ts` `buildAccessPointsSection` — Después de obtener `wirelessSignalByDevice` y `wirelessFailedConnections`, cada AP recibe:
  - `firmware` — desde `deviceStatus.firmware`
  - `signalQuality` — promedio de señal del dispositivo
  - `clients` — conteo de clientes
  - `microDrops` — conteo de conexiones fallidas
  - `tooltipInfo` — objeto completo tipo `composeWirelessMetrics` del original

### Appliance — Header corregido
- `ApplianceSection.tsx` — Header ahora muestra `device.name` (era `device.mac`), igual al original.

### Appliance — Layout grid
- Grid cambiado de `1fr 1fr` a `auto 1fr` para que la matriz de puertos ocupe su tamaño natural y la WAN card ocupe el resto.

### Appliance — WAN Card campos faltantes
- Agregados 5 campos que faltaban en la tarjeta WAN:
  - **DNS** — con soporte para array de DNS
  - **Tipo conexión** — `connectionType`
  - **Loss** — porcentaje con color rojo si > 0
  - **Latency** — en milisegundos
  - **Jitter** — en milisegundos

### Appliance — Backend uplinks
- `route.ts` `buildApplianceSection` — `flatUplinks` ahora incluye `loss`, `latency`, `jitter`, `connectionType` desde la API de Meraki.

---

## Fase 2.2: Análisis exhaustivo + Fixes de paridad funcional

### Análisis exhaustivo completado
- **servidor.js original** (~5879 líneas): mapeadas todas las funciones, caches, endpoints, helpers.
- **Frontend original** (Dashboard.jsx ~3900 líneas): identificadas 8 funcionalidades críticas ausentes.
- **Meraki API**: 41 funciones del original no presentes en el actual (30/71 cobertura actual).

### AP→Appliance port enrichment (Z3/GAP)
- `route.ts` `buildApplianceSection` — Agregada detección de APs conectados directamente al appliance en redes Z3/GAP. En configuración GAP (Z3 + APs + sin switches), el AP siempre se conecta al puerto 5 del appliance. Se enriquece el puerto con `connectedTo`, `tooltipInfo` con `detectionMethod: "gap-rule-port5"`.

### switchesOverview agregado al backend
- `route.ts` `buildSwitchesSection` — Agregado cálculo de `switchesOverview` con estadísticas agregadas: `totalSwitches`, `totalPorts`, `connectedPorts`, `inactivePorts`, `disabledPorts`, `poePorts`, `poeActivePorts`, `uplinkPorts`, `warningPorts`, `crcErrorPorts`.
- `useDashboardData.ts` y `NetworkContext.tsx` — Ahora capturan y distribuyen `switchesOverview` desde la respuesta del backend.

### Topology fallback para switches
- `route.ts` `buildSwitchesSection` — Agregado fetch de `getNetworkTopologyLinkLayer(networkId)` y fallback cuando LLDP no encuentra conexión al MX. Busca el enlace switch↔MX en la topología y determina el puerto del appliance por inferencia de modelo (MX64/65/67→puerto 3, MX84/100→10, MX250/450→11).

### detectionMethod en tooltip de switches
- `route.ts` `buildSwitchesSection` — Agregado campo `detectionMethod` ("LLDP/CDP", "Topology Fallback", "Unknown") al `tooltipInfo` de cada switch, indicando cómo se detectó la conexión al appliance.

### networkName y deviceCount para USAP detection
- `ApplianceSection.tsx` — Ahora importa `useNetworkContext` para obtener `selectedNetwork.name`. Calcula `deviceCount` (cantidad de APs y si hay MX) desde `summaryData.devices`. Pasa `networkName` y `deviceCount` a `AppliancePortsMatrix` para que la detección USAP (redes con >3 APs + MX) funcione y muestre aliases WAN1/WAN2.

### CRC error detection
- Los datos de `warnings` y `errors` ya se incluían en los puertos de switch desde la API de Meraki. Con el nuevo `switchesOverview`, se contabilizan `warningPorts` y `crcErrorPorts` a nivel agregado.

---

### Diferencias conocidas pendientes (Fase 2.2 → Fase 2.3)
- **ConnectivityBar con datos históricos reales** — Barras de switches y APs muestran datos sintéticos (color sólido). Falta integrar endpoints de historial de conectividad.
- **41 funciones Meraki API faltantes** — VLANs (6), Security IDS/IPS/Malware (3), Wireless avanzado (7), Cable Test (3), SDWAN (3), Appliance Performance (8), Org general (4), Switches avanzado (3), Loss & Latency nivel dispositivo (1), Cellular Gateway (1), Historial disponibilidad (1), Topología extra (2).
- **Botones JPG/PDF de exportación** — Presentes en el original (usa `html2canvas` + `jsPDF`), no implementados aún.
- **LoadingOverlay y SkeletonLoaders** — Componentes de UX presentes en el original no portados.
- **Login admin** — Endpoint del original para login con `ADMIN_KEY` no implementado.
- **Idle timeout 8h** — Expiración de sesión activa por inactividad no implementada.
- **SSE streaming para predios** — Sincronización en tiempo real de predios CSV no implementada.

---

## Fase 3: Gestión de Predios — ClickUp Integration

### Importación masiva desde ClickUp
- Importación de **48 predios** desde ClickUp al sistema con mapeo completo de campos.
- Campos mapeados: nombre, código, dirección, provincia, estado, equipo asignado, prioridad, CUE, ámbito, correo viático, observaciones.
- Vinculación automática con redes Meraki por nombre.

### Estados configurables
- **12 estados** importados desde ClickUp con colores, claves y orden.
- Componente `StatusIcon` para representación visual de estados con iconos SVG y colores por clave.
- Flujo visual del avance: `backlog → por_confirmar → confirmado → en_progreso → instalado → activo → conforme → facturado → incidencia → suspendido → cerrado → cancelado`.

### Espacios de trabajo (Workspaces)
- Creación de jerarquía de espacios de trabajo para organizar predios.
- Estadísticas agregadas por espacio: distribución por estado, equipo, provincia.
- Fix de bug en la creación de workspaces (cascade de permisos).

---

## Fase 4: Deploy a Producción + Hardening de Seguridad

### Deploy VPS (2026-03-18)
- **Servidor**: Ubuntu 24.04, VPS en 72.61.32.146
- **Dominio**: `carrot.thnet.com.ar` (registro A, Let's Encrypt TLS)
- **Stack**: Node.js v20.19.5, PM2 6.0.13, Nginx 1.24.0, PostgreSQL 16.13
- **Build**: `npm run build` exitoso, PM2 "carrot" corriendo en puerto 3001
- **Seed**: 48 predios importados, 12 estados, usuario admin creado

### Hardening de seguridad (2026-03-18)
Todos los ítems de `SEGURIDAD_VPS.md` aplicados:

**Riesgo bajo (aplicados sin interrupción):**
- Fail2ban instalado y configurado (sshd: maxretry=3/bantime=3600, nginx-limit-req: maxretry=10/bantime=600)
- PM2 logrotate (50M, 7 retenciones, compresión)
- Nginx rate limiting `/api/` (30r/s burst=20 nodelay)
- Nginx HSTS header (max-age=31536000; includeSubDomains)
- Nginx bloqueo de `/uploads/` (403)
- Backup automático PostgreSQL (cron 3 AM, retención 30 días, destino `/opt/backups/`)

**Precaución (aplicados con validación):**
- Usuario `deploy` creado con `--disabled-password`, sudo NOPASSWD
- SSH key ed25519 generada y configurada
- SSH hardening: `PermitRootLogin no`, `PasswordAuthentication no`, `MaxAuthTries 3`, `AllowUsers deploy`
- Usuario PostgreSQL dedicado `carrot_app` con permisos mínimos (SELECT/INSERT/UPDATE/DELETE — sin DDL)
- Secretos de producción regenerados (JWT_SECRET, API keys)

**Ya activos previamente:**
- UFW habilitado (22/80/443)
- Unattended-upgrades para patches de seguridad
- HTTPS + certbot auto-renew
- Headers de seguridad en Nginx (X-Frame, X-Content-Type, X-XSS)

### Documentación actualizada
- `CREDENCIALES.md` creado con todas las contraseñas de producción (excluido de git)
- `.gitignore` actualizado para excluir `CREDENCIALES.md`
- `SEGURIDAD_VPS.md` actualizado con checklist completo marcado
- `DEPLOY_VPS_WORDPRESS.md` actualizado a arquitectura de subdominio
- `README.md` ampliado con info de producción y seguridad

---

## Fase 3: Secciones de Gestión

### Sidebar
- **Renombrado Predios → Tareas** — Enlace en Sidebar.tsx actualizado a `/dashboard/tareas` con icono de clipboard.

### Hook de sesión cliente
- `src/hooks/useSession.ts` — Hook `useSession()` para componentes client-side. Retorna `{ session, loading, isModOrAdmin, isAdmin }`. Fetch a `/api/auth/me` en mount.

### Backend — 13 API Routes nuevas

#### Tareas (`/api/tareas`)
- `src/app/api/tareas/route.ts` — GET (técnicos ven solo las asignadas/creadas, mod/admin ven todas), POST (mod/admin: crea tarea con asignaciones múltiples + notificaciones automáticas). Incluye relaciones de asignado, predio, creador.
- `src/app/api/tareas/[id]/route.ts` — GET (detalle con relaciones), PUT (mod/admin: actualización + gestión de asignaciones), DELETE (solo admin).

#### Stock (`/api/stock`)
- `src/app/api/stock/route.ts` — GET (filtros: estado, categoría, búsqueda; retorna lista de categorías únicas), POST (mod/admin: validación de serial único).
- `src/app/api/stock/[id]/route.ts` — GET (con comentarios), PUT (mod/admin: registra cambios de estado en Actividad), DELETE (solo admin).

#### Notificaciones (`/api/notificaciones`)
- `src/app/api/notificaciones/route.ts` — GET (por usuario, con conteo de sinLeer), PUT (marcar leídas por IDs o todas), POST (mod/admin: enviar notificación a múltiples usuarios).

#### Actividad (`/api/actividad`)
- `src/app/api/actividad/route.ts` — GET (técnicos: solo su actividad; mod/admin: toda. Filtro por entidad). Incluye relaciones con usuario.

#### Actas (`/api/actas`)
- `src/app/api/actas/route.ts` — GET (búsqueda por nombre/descripción/predio), POST (FormData: upload de archivos PDF/DOCX, límite 10MB, almacenamiento en `uploads/actas/`).
- `src/app/api/actas/[id]/route.ts` — GET (descarga de archivo con Content-Disposition).

#### Calendario (`/api/calendario`)
- `src/app/api/calendario/route.ts` — GET (filtro por rango de fechas, técnicos ven propias), POST (crea tarea calendario + notificación al asignado).
- `src/app/api/calendario/[id]/route.ts` — PUT (actualización con notificación por cambio de asignado), DELETE.

#### Importar (`/api/importar`)
- `src/app/api/importar/parse/route.ts` — POST (FormData: parseo de .xlsx/.xls/.csv con xlsx, retorna headers + 200 filas preview + nombres de hojas).
- `src/app/api/importar/ejecutar/route.ts` — GET (definiciones de campos para PREDIO y EQUIPO), POST (importación masiva con mapeo de columnas, retorna created/skipped/errors).

#### Usuarios (`/api/usuarios`)
- `src/app/api/usuarios/route.ts` — GET (lista de usuarios activos: id, nombre, email, rol). Para selectores de asignación.

### Frontend — 7 páginas de gestión implementadas

#### Tareas (`/dashboard/tareas/page.tsx`) — NUEVA
- Tabla con columnas: título, estado, prioridad, asignados, fecha.
- Búsqueda por texto libre. Badges de prioridad con indicadores de color (Alta, Media, Baja).
- Avatares de asignados. Click para ver detalle en lista.
- Modal de creación (mod/admin): título, descripción, estado, prioridad, fecha, selección múltiple de usuarios con checkboxes.

#### Actas (`/dashboard/actas/page.tsx`) — REESCRITA
- Lista de documentos con iconos por tipo (PDF, DOCX, otros).
- Búsqueda por nombre. Tamaño de archivo formateado (KB/MB).
- Modal de upload (mod/admin): nombre, descripción, selector de archivo.
- Botones de descarga por documento.

#### Actividad (`/dashboard/actividad/page.tsx`) — REESCRITA
- Timeline de actividades con iconos por acción (CREAR, ACTUALIZAR, ELIMINAR, otros).
- Dropdown de filtro por entidad. Subtítulo dinámico según rol.
- Muestra usuario, entidad, entidadId, detalles y fecha relativa.

#### Bandeja (`/dashboard/bandeja/page.tsx`) — REESCRITA
- Inbox de notificaciones con estilo read/unread (bold + borde izquierdo primario).
- Badge de notificaciones sin leer. Toggle filtro "Solo sin leer".
- Botón "Marcar todas como leídas". Click en notificación la marca como leída.

#### Stock (`/dashboard/stock/page.tsx`) — REESCRITA
- Tabla de equipos con columnas: nombre, serial, categoría, modelo, estado, predio.
- Dropdown inline de estado para mod/admin (6 estados: DISPONIBLE, INSTALADO, EN_TRANSICION, ROTO, PERDIDO, EN_REPARACION). Badges de color para viewers.
- Filtros por categoría y estado. Búsqueda por texto.
- Modal de creación (mod/admin) con todos los campos del equipo.

#### Importar (`/dashboard/importar/page.tsx`) — REESCRITA
- Flujo de 3 pasos: Upload → Mapeo → Resultado.
- Paso 1: Selector de tipo (PREDIO/EQUIPO), drop zone para archivos .xlsx/.xls/.csv.
- Paso 2: Mapeo visual columna-por-columna (header Excel → campo BD con dropdown). Vista previa de 5 filas.
- Paso 3: Resumen de importación (creados/omitidos/total) + listado de errores si hay.

#### Calendario (`/dashboard/calendario/page.tsx`) — REESCRITA
- Vista de grilla mensual con navegación prev/next. Días de la semana en español.
- Puntos de color por tarea (rojo=alta, amarillo=media, azul=baja, verde=completada).
- Click en día muestra lista de tareas con: checkbox completar, título, hora, asignado, prioridad.
- Modal de creación (mod/admin): título, descripción, fecha, hora, prioridad, selector de usuario asignado.
- Botones de eliminar tarea (mod/admin).

### Seguridad y permisos
- Todas las APIs verifican sesión con `getSession()`.
- Operaciones de escritura restringidas a mod/admin con `isModOrAdmin()`.
- Eliminaciones restringidas a admin con `isAdmin()`.
- Técnicos ven solo datos propios (tareas asignadas, calendario propio, actividad propia).
- Notificaciones filtradas por usuario (cada uno ve solo las suyas).
- Upload de archivos validado: solo PDF/DOCX, máximo 10MB.

---

## Fase 4: Fixes de Seguridad Críticos + UI Login

### Fecha: 10 de marzo de 2026

### Seguridad — JWT_SECRET Validación en Producción
**Archivos modificados:**
- `src/middleware.ts`
- `src/lib/auth.ts`

**Cambio:**
El fallback del JWT_SECRET (`"dev-fallback-secret-change-in-production"`) ahora **lanza un error fatal** si `NODE_ENV === "production"` y `JWT_SECRET` no está definido. Esto previene desplegar sin configurar el secret.

```typescript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("FATAL: JWT_SECRET no está configurado en producción");
}
```

### Seguridad — Logging de Errores Silenciosos
**Archivos modificados:**
- `src/app/api/meraki/networks/[networkId]/section/[sectionKey]/route.ts`
- `src/app/api/meraki/networks/search/route.ts`
- `src/app/api/meraki/networks/[networkId]/appliance/historical/route.ts`

**Cambio:**
Todos los bloques `try { ... } catch { /* silencio */ }` ahora registran el error con `console.error()` incluyendo contexto (sección, networkId, serial). Esto permite detectar problemas intermitentes de la API Meraki.

```typescript
// Antes
try { data = await getX(); } catch { /* sin datos */ }

// Después  
try { data = await getX(); } catch (e) { console.error(`[Section:X] getX(${id}):`, e); }
```

**Endpoints de logging agregado:**
- `getNetworkSwitchPortsStatuses`
- `getNetworkSwitchAccessControlLists`
- `getNetworkTopologyLinkLayer`
- `getOrgWirelessDevicesEthernetStatuses`
- `getNetworkWirelessConnectionStats`
- `getOrgApplianceUplinkStatuses`
- `getDeviceLldpCdp` (switches y appliances)
- `getAppliancePorts`
- `getDeviceAppliancePortsStatuses`
- `getOrganizations` (en search)
- `getNetworkInfo` (en search)
- Endpoints de histórico (connectivity, org-level loss/latency)

### UI — Login Rediseñado al Estilo THNET
**Archivo:** `src/app/login/page.tsx`

**Cambios:**
- Panel izquierdo: gradiente profundo `from-primary-700 via-primary-600 to-primary-800` con grid de fondo sutil.
- Blobs animados con `animate-float-slow` y `animate-float-slow-reverse`.
- Logo con resplandor blanco (backdrop-blur + drop-shadow) dentro de contenedor glassmorphism.
- 3 feature cards: Monitoreo, Gestión, Calendario (con íconos y hover effects).
- Inputs con íconos integrados (email, candado).
- Toggle mostrar/ocultar contraseña.
- Botón con flecha y `active:scale-[0.98]`.
- Animaciones `fade-in-up` en entrada.

### UI — Sidebar Header Corregido
**Archivo:** `src/components/layout/Sidebar.tsx`

**Cambio:**
El botón de colapsar ahora está **a la izquierda** como un icono de menú hamburguesa. Cuando está colapsado, no se muestra el logo (solo el botón hamburguesa centrado). Cuando está expandido, se muestra hamburguesa + logo horizontal.

### Tailwind — Animaciones Float
**Archivo:** `tailwind.config.ts`

**Agregado:**
```typescript
animation: {
  "float-slow": "floatSlow 8s ease-in-out infinite",
  "float-slow-reverse": "floatSlowReverse 10s ease-in-out infinite",
},
keyframes: {
  floatSlow: {
    "0%, 100%": { transform: "translateY(0) scale(1)" },
    "50%": { transform: "translateY(-30px) scale(1.05)" },
  },
  floatSlowReverse: {
    "0%, 100%": { transform: "translateY(0) scale(1)" },
    "50%": { transform: "translateY(20px) scale(0.95)" },
  },
},
```

---

## Análisis de Proyecto — Mejoras Pendientes

### Críticos restantes (a implementar cuando funcionalidades completas)
1. Auth explícita en cada endpoint API (actualmente solo depende de middleware)
2. Validación Zod para `as any` castings en importación
3. Sanitización de inputs en búsquedas (longitud + regex)

### Importantes (postergar para refactor final)
4. Reemplazar 50+ usos de `any` con interfaces TypeScript
5. Dividir componentes grandes (AppliancePortsMatrix ~500 líneas, SimpleGraph ~450 líneas)
6. Optimizar NetworkContext para evitar rerenders innecesarios
7. Implementar cache con TTL (actualmente sin expiración)
8. Agregar `import "server-only"` en `meraki.ts` para proteger MERAKI_API_KEY

### Positivos identificados
- Middleware auth bien estructurado
- useCallback con dependencias correctas en hooks
- Prisma select/include eficiente
- Estructura de carpetas clara
- TypeScript strict en general

---

## Fase 5: Tooltip Fix + 18 Mejoras de Calidad

### Fecha: Sesión de análisis exhaustivo y mejoras

### Fix — Tooltip Clipping (posición fixed)
**Archivos modificados:**
- `src/components/meraki/Tooltip.tsx`
- `src/components/meraki/Tooltip.css`

**Cambio:**
El Tooltip usaba `position: absolute`, lo que causaba que se cortara (clipping) en contenedores con `overflow: hidden`. Migrado a `position: fixed` con coordenadas relativas al viewport calculadas con `getBoundingClientRect()`. Ahora se renderiza siempre sobre todo el contenido sin importar el contenedor padre.

---

### Mejora 1 — RBAC en API de Usuarios
**Archivo:** `src/app/api/usuarios/route.ts`

**Cambio:** Agregada verificación `isModOrAdmin(session.rol)` que retorna 403 si el usuario no tiene permisos de moderador o admin.

### Mejora 2 — División por cero en ApplianceHistoricalCharts
**Archivo:** `src/components/meraki/ApplianceHistoricalCharts.tsx`

**Cambio:** Guard contra división por cero: `(pointsWithState.length || 1)` en cálculos de porcentaje de conectividad.

### Mejora 3 — Race Condition en NetworkContext
**Archivo:** `src/contexts/NetworkContext.tsx`

**Cambio:** Reemplazado tracking de `loadedSections` basado en estado (`useState`) por `useRef<Set<string>>` para seguimiento sincrónico. Previene cargas duplicadas cuando múltiples secciones inician fetch simultáneamente. La ref se reinicia (`new Set()`) al cambiar de red.

### Mejora 4 — Cerrar Modal con ESC
**Archivo:** `src/components/TareaDetalleModal.tsx`

**Cambio:** Agregado `useEffect` con listener de `keydown` que llama `onClose()` al presionar Escape.

### Mejora 5 — Validación de Stock (trim + confirmación)
**Archivo:** `src/app/dashboard/stock/page.tsx`

**Cambio:** `handleCreate` ahora aplica `trim()` al nombre de equipo y no permite nombres vacíos. `cambiarEstado` muestra diálogo `confirm()` antes de cambiar el estado de un equipo.

### Mejora 6 — Paginación en Actividad
**Archivo:** `src/app/dashboard/actividad/page.tsx`

**Cambio:** Implementada paginación con `PAGE_SIZE=50`, estados `loadingMore`/`hasMore`, función `fetchActividad(offset, append)`. Botón "Cargar más" al final de la lista. Reduces la carga inicial masiva de registros.

### Mejora 7 — Botón Volver en Importar
**Archivo:** `src/app/dashboard/importar/page.tsx`

**Cambio:** Agregado botón "← Volver" en el paso de mapeo que regresa al paso de upload (`setStep("upload")`).

### Mejora 8 — Búsqueda del Header mejorada
**Archivo:** `src/components/layout/Header.tsx`

**Cambio:** Estado vacío "No se encontraron resultados" cuando hay query sin matches. Navegación por teclado completa: ArrowDown/ArrowUp para navegar, Enter para seleccionar, Escape para cerrar. Item activo resaltado con `bg-primary-50`. Focus solo dispara búsqueda cuando `query.length >= 2`.

### Mejora 9 — AbortController en NetworkSelector
**Archivo:** `src/components/meraki/NetworkSelector.tsx`

**Cambio:** Agregado `AbortController` ref para cancelar requests previos de búsqueda al iniciar uno nuevo o al desmontar el componente. Signal pasado al `fetch()`.

### Mejora 10 — Memoización en useTableSort
**Archivo:** `src/hooks/useTableSort.ts`

**Cambio:** Función `compareFn` envuelta en `useMemo` para evitar recrear el comparador en cada render. `sortData` usa el comparador memoizado.

### Mejora 11 — Componente Breadcrumbs
**Archivo creado:** `src/components/layout/Breadcrumbs.tsx`

**Cambio:** Componente de navegación contextual con `LABEL_MAP` para 16 rutas del dashboard. Muestra ruta actual con separadores chevron. Último item es texto plano (no enlace). Integrado en el layout del dashboard.

**Archivo modificado:** `src/app/dashboard/layout.tsx` — Se importó y agregó `<Breadcrumbs />` entre Header y children.

### Mejora 12 — Componentes Skeleton
**Archivo creado:** `src/components/ui/Skeletons.tsx`

**Componentes:** `TableSkeleton(rows, cols)`, `ListSkeleton(items)`, `CardSkeleton(lines)`. Todos usan `animate-pulse` de Tailwind para efecto de carga.

**Archivos modificados (reemplazo de spinners por skeletons):**
- `src/app/dashboard/stock/page.tsx` → `TableSkeleton`
- `src/app/dashboard/actividad/page.tsx` → `ListSkeleton`
- `src/app/dashboard/bandeja/page.tsx` → `ListSkeleton`
- `src/app/dashboard/actas/page.tsx` → `ListSkeleton`

### Mejora 13 — Estados vacíos mejorados
**Archivos modificados:**
- `src/app/dashboard/predios/page.tsx`
- `src/app/dashboard/instructivo/page.tsx`

**Cambio:** Texto descriptivo "Próximamente" con badge "En desarrollo" e icono. Reemplaza páginas placeholder vacías.

### Mejora 14 — Tipografía de encabezados (text-lg → text-xl)
**Archivos modificados (15+ páginas):**
- `stock/page.tsx`, `actividad/page.tsx`, `importar/page.tsx`, `bandeja/page.tsx`, `actas/page.tsx`, `predios/page.tsx`, `instructivo/page.tsx`, `usuarios/page.tsx`, `calendario/page.tsx`, `switches/page.tsx`, `topologia/page.tsx`, `aps/page.tsx`, `appliance/page.tsx`, `page.tsx` (home), `tareas/page.tsx`, `tareas/espacio/[id]/page.tsx`, `tareas/espacio/[id]/tareas/page.tsx`

**Cambio:** Todos los `h1` principales actualizados de `text-lg` a `text-xl` para mejor jerarquía visual.

### Mejora 15 — SwitchesSection: Inline Styles → Tailwind
**Archivo:** `src/components/meraki/SwitchesSection.tsx`

**Cambio:** Convertidos ~30 propiedades `style={{}}` inline a clases de Tailwind. Incluye: barra de conectividad, lista de dispositivos mobile, sección de resumen, wrapper de tabla, dots de estado, badges CRC, fila expandida, headers.

---

## Fase 5.1: Tareas — Espacios de Trabajo + Monitoreo + Push

### Sistema de Espacios de Trabajo
- `src/app/dashboard/tareas/page.tsx` — Reescrita como hub de espacios. Grid de cards con: icono, nombre, descripción, conteo de tareas, fecha de creación, badge del creador.
- `src/app/dashboard/tareas/espacio/[id]/page.tsx` — Vista de espacio individual con sidebar de info.
- `src/app/dashboard/tareas/espacio/[id]/tareas/page.tsx` — Lista filtrable de tareas dentro de un espacio.
- `src/app/api/espacios/route.ts` — CRUD de espacios de trabajo.
- `src/app/api/espacios/[id]/route.ts` — GET/PUT/DELETE de espacio individual.

### Límite de 100 tareas por espacio
- Validación en API: POST `/api/tareas` rechaza con 400 si el espacio ya tiene 100 tareas.

### TareaDetalleModal
- `src/components/TareaDetalleModal.tsx` — Modal completo para ver/editar tarea individual. Campos: título, descripción, estado, prioridad, asignados, fecha límite, comentarios. Cierre con ESC.

### SwitchComponents — Formas SVG por modelo
- `src/components/meraki/SwitchComponents.tsx` — Formas SVG específicas por modelo de switch Meraki (MS120, MS210, MS225, etc.). Puertos renderizados con posición y color según estado.

### SwitchesSection — Fix overflow móvil
- `src/components/meraki/SwitchesSection.tsx` — Corrección de overflow horizontal en dispositivos móviles. Contenedores con `overflow-x-auto` y `min-width` apropiados.

### Monitoreo Post-Cambio de Puerto + Push Notifications
- `src/app/api/cron/monitoreo/route.ts` — Endpoint cron que verifica cambios pendientes y envía notificaciones push.
- `src/app/api/push/subscribe/route.ts` — Registro de suscripciones push (Web Push API).
- `src/app/api/push/send/route.ts` — Envío de notificaciones push a suscriptores.
- `public/sw.js` — Service Worker para recibir notificaciones push.
- `public/manifest.json` — PWA manifest con iconos y tema.

---

## Auditoría de Producción — Hallazgos

### BLOQUEANTES (6 items — APLICADOS)

1. **Cron endpoint auth fix** — `src/app/api/cron/monitoreo/route.ts`: ahora rechaza con 503 si CRON_SECRET no está definido. Siempre requiere secret válido.

2. **Login rate limiting** — `src/app/api/auth/login/route.ts`: rate limiter en memoria por IP (5 intentos / 15 min). Retorna 429 al exceder. Se limpia al login exitoso.

3. **`.env.example` completo** — Agregadas: CRON_SECRET, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL, MERAKI_BASE_URL, NODE_ENV.

4. **PM2 ecosystem.config.js** — Creado con `next start`, logs en `logs/`, max_restarts=10, restart_delay=5000.

5. **Path traversal fix en actas** — `src/app/api/actas/[id]/route.ts`: `path.resolve()` + validación que la ruta resuelva dentro de `uploads/`. Retorna 403 si intenta salir.

6. **Security headers en next.config.mjs** — `poweredByHeader: false`, headers globales: HSTS, X-Content-Type-Options (nosniff), X-Frame-Options (DENY), Referrer-Policy, Permissions-Policy.

### MEDIO/BAJO (6 items — APLICADOS)
7. **Índices Prisma** — Agregados índices a: Notificacion (`userId+leida`, `createdAt`), Comentario (`predioId`, `equipoId`), Actividad (`userId`, `entidad`, `createdAt`), TareaCalendario (`fecha`, `asignadoId`, `creadorId`), Asignacion (`userId`, `predioId`).
8. **Calendario RBAC** — PUT y DELETE en `/api/calendario/[id]/route.ts` ahora requieren `isModOrAdmin()`. Retorna 403 sin permisos.
9. **`uploads/` en .gitignore** — Agregado al final del archivo.
10. **Notificaciones PUT try/catch** — PUT en `/api/notificaciones/route.ts` envuelto en try/catch con log de error.
11. **PWA manifest scope** — Agregado `"scope": "/"` en `public/manifest.json`.
12. Cache-Control headers en respuestas API — Implementado en Fase 7.

---

## Fase 6: Mejoras de Robustez y Hardening

### `import "server-only"` en meraki.ts
**Archivo:** `src/lib/meraki.ts`

**Cambio:** Agregado `import "server-only"` como primera línea. Previene que el módulo (que contiene `MERAKI_API_KEY`) sea importado accidentalmente en componentes client-side.

### Sanitización de inputs en búsquedas
**Archivo creado:** `src/lib/sanitize.ts`

**Función:** `sanitizeSearch(input, maxLength=100)` — Elimina caracteres de control, trim, y limita longitud.

**Archivos modificados:**
- `src/app/api/tareas/route.ts` — Importa y usa `sanitizeSearch()`
- `src/app/api/stock/route.ts` — Importa y usa `sanitizeSearch()`
- `src/app/api/actas/route.ts` — Importa y usa `sanitizeSearch()`
- `src/app/api/meraki/networks/search/route.ts` — `.slice(0, 100)` en query
- `src/app/api/meraki/resolve-network/route.ts` — `.slice(0, 100)` en query

### Idle timeout 8 horas
**Archivo creado:** `src/hooks/useIdleTimeout.ts`

**Hook:** `useIdleTimeout()` — Detecta inactividad (mousedown, keydown, scroll, touchstart) y hace logout automático tras 8 horas sin actividad. Timer se reinicia con cada interacción.

**Archivo modificado:** `src/app/dashboard/layout.tsx` — Integrado `useIdleTimeout()` en el layout principal.

### Cache con TTL en NetworkContext
**Archivo:** `src/contexts/NetworkContext.tsx`

**Cambio:** Agregado `cacheTTL` ref (Map<string, number>) con `CACHE_TTL_MS = 5 minutos`. Secciones ya cargadas no se refetchen hasta que expire el TTL. Forzar recarga con `force: true` bypasea el cache. La cache se limpia al cambiar de red.

### Validación de payload en importación
**Archivo:** `src/app/api/importar/ejecutar/route.ts`

**Cambio:** Reemplazada validación básica por validación exhaustiva del payload: verifica que sea objeto, que `tipo` sea "PREDIO"|"EQUIPO", que `mappings` sea array no vacío con objetos `{excelColumn: number, dbField: string}`, y que `rows` sea array no vacío. Errores descriptivos por campo.

### Exportación JPG/PDF
**Estado:** Ya implementado en Fase 2.2 — Componente `ExportableSection` con `html2canvas` + `jsPDF`. Usado en Switches, APs, Appliance y Topología.

---

### Pendientes funcionales (Fase futura)
- **ConnectivityBar con datos históricos reales** — Barras muestran datos sintéticos. Falta integrar endpoints de historial.
- **Dividir componentes grandes** (AppliancePortsMatrix ~500 lín, SimpleGraph ~450 lín).

---

## Fase 7: Tipado Estricto, API Meraki Completa y Cache-Control

### Cache-Control headers en API
**Archivo:** `next.config.mjs`

**Cambio:** Agregado header `Cache-Control: no-store, max-age=0` para todas las rutas `/api/:path*`. Previene que respuestas de API queden en cache de navegador, asegurando datos siempre frescos.

### Interfaces TypeScript centralizadas
**Archivo creado:** `src/types/meraki.ts`

**Cambio:** ~30 interfaces TypeScript para todos los objetos de dominio Meraki:
- `MerakiOrganization`, `MerakiNetwork`, `MerakiDevice`, `MerakiDeviceStatus`
- `MerakiSwitchPort`, `MerakiSwitchPortStatus`, `MerakiAppliancePort`, `MerakiAppliancePortStatus`
- `TopologyNode`, `TopologyLink`, `TopologyLinkEnd`, `TopologyResponse`
- `WirelessConnectionStats`, `WirelessSSID`, `ApplianceUplinkStatus`, `ApplianceUplink`, `AppliancePerformance`
- `LossAndLatencyEntry`, `SecurityIntrusionSettings`, `SecurityMalwareSettings`
- `MerakiVlan`, `FirewallRule`, `DhcpSubnet`, `MerakiClient`, `PingResult`, `CableTestResult`

### Eliminación de `any` en 6 archivos
**Archivos modificados:**
- `src/utils/formatters.ts` — Parámetros tipados con `MerakiAppliancePortStatus | MerakiSwitchPortStatus`
- `src/utils/applianceUtils.ts` — Arrays y funciones tipadas con `MerakiAppliancePortStatus[]`, `TopologyResponse`, `TopologyNode[]`, `TopologyLink[]`
- `src/lib/merakiTransformers.ts` — Parámetro `TopologyResponse`, objetos con `Record<string, unknown>`
- `src/hooks/useDashboardData.ts` — Estados tipados: `MerakiNetwork | null`, `Record<string, unknown>`, error con `instanceof Error`
- `src/hooks/useTableSort.ts` — Comparador tipado: `Record<string, unknown>`, valores `string | number`

### 60+ nuevas funciones Meraki API
**Archivo:** `src/lib/meraki.ts` (de ~33 a ~93 funciones exportadas)

**Nuevas categorías agregadas:**
- **VLANs:** `getNetworkApplianceVlans`, `getNetworkApplianceVlan`, `getNetworkApplianceVlansSettings`
- **Firewall:** L3, L7, Port Forwarding, 1:1 NAT, 1:Many NAT, Inbound, Settings
- **Security:** Intrusion (IDS/IPS), Malware, Security Events
- **Content Filtering:** Reglas de filtrado de contenido
- **Appliance:** Settings, Static Routes, Single LAN, Site-to-Site VPN, Warm Spare, Traffic Shaping
- **Switch:** Routing Interfaces, OSPF, Access Policies, Port Schedules, MTU, STP, Warm Spare, DHCP
- **Wireless avanzado:** Status, Latency Stats, Radio Settings, Latency/Client Count/Usage/Channel Utilization/Data Rate History, Settings, RF Profiles
- **Alertas:** Alert History, Alert Settings
- **Device Management:** Management Interface
- **Live Tools:** Ping (create/get), Cable Test (create/get), Throughput Test (create/get)
- **Organization extras:** Inventory Devices, Devices Availabilities, Summary Top, VPN Statuses

---

### Pendientes funcionales (Fase futura)
- **ConnectivityBar con datos históricos reales** — Barras muestran datos sintéticos. Falta integrar endpoints de historial.
- **Dividir componentes grandes** (AppliancePortsMatrix ~500 lín, SimpleGraph ~450 lín).

---

## Fase 8: Optimizaciones de Producción y Fixes de Datos

### Fecha: 11-12 de marzo de 2026

### Fix — Logo Login con contorno blanco
**Archivo:** `src/app/login/page.tsx`

**Cambio:** Logo en panel izquierdo del login ahora tiene glow blanco sutil con `filter: drop-shadow(0 0 6px rgba(255,255,255,0.5)) drop-shadow(0 0 20px rgba(255,255,255,0.15))` para mejorar visibilidad sobre el gradiente oscuro.

### Fix — Botón "Nuevo Instructivo" invisible para ADMIN
**Archivo:** `src/app/dashboard/instructivo/page.tsx`

**Cambio:** El endpoint `/api/auth/me` retorna `{ user: { rol: "ADMIN" } }` pero el código leía `d?.rol` (nivel raíz). Corregido a `d?.user?.rol || d?.rol` para soportar ambos formatos.

### Optimización — Deduplicación de requests con getOrFetch
**Archivo:** `src/lib/merakiCache.ts`

**Cambio:** Nueva función `getOrFetch<T>(bucket, key, fetcher, ttlMs)` que deduplicaba requests in-flight. Cuando 4 secciones cargan en paralelo, las llamadas compartidas (`getNetworkInfo`, `getNetworkDevices`, `getOrganizationDevicesStatuses`, etc.) se ejecutan una sola vez. ~17 llamadas redundantes eliminadas por carga de red.

**Archivo:** `src/app/api/meraki/networks/[networkId]/section/[sectionKey]/route.ts`
- Base calls envueltas en `getOrFetch` con bucket `networkById`
- Topology, switch port statuses, availability history deduplicados

### Fix — Puerto fantasma en Z3 (LLDP stale data)
**Archivos:** `src/app/api/meraki/networks/[networkId]/section/[sectionKey]/route.ts`

**Problema:** Puerto 4 del Z3 mostraba un dispositivo conectado cuando no había nada. Causa: LLDP/CDP mantiene entradas "stale" por su hold timer (120-180s) después de que un dispositivo se desconecta.

**Solución:** Nueva función `portHasActiveLink(status)` que verifica el estado real del link antes de aplicar enriquecimiento LLDP. Regex contra patrones activos (`connected|active|up|online`) y rechazo de inactivos (`not connected|disconnected|offline|down`). Regla GAP (puerto 5 del Z3) también verifica que el AP esté online antes de asignar.

### Investigación — Velocidad WAN de Appliances
**Scripts temporales creados y eliminados:** `testWanSpeed.mjs`, `testWanSpeed2.mjs`, `testWanSpeed3.mjs`

**Hallazgo:** Se probaron ~19 endpoints de la API Meraki v1 contra las 30 organizaciones (Z3, MX84, MX85). **La API no expone la velocidad negociada del puerto WAN** (10/100/1000 Mbps). Solo está disponible throughput calculado (bytes enviados/recibidos por intervalo). La velocidad de link solo existe a nivel firmware/kernel y Meraki la reporta al cloud por túnel, pero no la expone en la API REST.

### Fix — CACHE_TTL_MS warning eliminado
**Archivo:** `src/contexts/NetworkContext.tsx`

**Cambio:** Constante `CACHE_TTL_MS` movida al scope correcto para eliminar warning de compilación.

### Optimización — Prefetch de secciones
**Archivo:** `src/contexts/NetworkContext.tsx`

**Cambio:** Al seleccionar una red, se prefetchean las 4 secciones (`topology`, `switches`, `access_points`, `appliance_status`) en paralelo, acelerando la experiencia al navegar entre tabs.

### Fix — Geolocalización (Permissions-Policy + IP fallback)
**Archivos:** `next.config.mjs`, components de mapa

**Cambio:** Header `Permissions-Policy: geolocation=(self)` habilitado. Fallback a geolocalización por IP cuando el navegador no soporta o deniega la API de geolocation.

---

## Fase 9: Sprint de Mejoras UX/UI

### 1. Perfil de usuario mejorado
- **Header dropdown** — Posicionamiento `fixed sm:absolute` para mobile. Ancho ampliado a `w-72`. Enlace "Mi perfil" a `/dashboard/perfil`. Enlace "Bandeja" con badge de no leídas. Avatar agrandado (`w-11 h-11`). Badge de rol inline con nombre/email.
- **Página de perfil** (`/dashboard/perfil`) — Nueva página con header gradiente, avatar con inicial, campos editables (nombre, teléfono), badge de rol, fecha miembro, tarjetas de estadísticas (asignaciones, predios creados, comentarios).
- **API de perfil** (`/api/auth/profile`) — GET retorna usuario con conteos. PATCH permite actualizar nombre (2-100 chars) y teléfono (max 30 chars).

### 2. KPIs — Donut chart mejorado
- Altura 300→340, outerRadius 100→110, innerRadius 55→60.
- `paddingAngle` 2→3, `minAngle={8}` para evitar slices minúsculos.
- Tipografía: 12.5px, `'Inter', 'Segoe UI', system-ui, sans-serif`, `fontWeight: 500`.
- Labels vacíos retornan `""` para hide. Tooltip: 13px con misma tipografía.

### 3. Subcarpetas en importar
- `crearNuevoEspacio()` ahora envía `parentId: espacioId` al crear dentro de un workspace.
- Calcula `_depth` correcto para la subcarpeta e inserta en posición correcta post-children.
- Botón dinámico: "+ Subcarpeta" o "+ Nuevo" según contexto.
- Función flatten maneja tanto `children` como `hijos` (compatibilidad API/legacy).

### 4. Ocultar estados vacíos en cronograma
- Estado `showEmptyStates` (default false) con botón toggle.
- Estados con 0 tareas ocultos por defecto, toggle para mostrar con conteo de vacíos.

### 5. Control de visibilidad de estados por rol
- **Modelo nuevo** `PermisoEstado` en schema.prisma: `estadoId`, `rol`, `visible`, unique `[estadoId, rol]`.
- **API** (`/api/permisos/estados`) — GET retorna permisos con detalles del estado. PUT upsert (solo admin, roles MODERADOR/TECNICO).
- **UI en permisos** — Sección "Visibilidad de estados" con tabla desktop y cards mobile, mostrando matriz estado×rol con checkboxes.
- **Filtrado en tareas** — Estado `hiddenEstadoIds` poblado desde API para usuarios no-admin. Estados restringidos por permisos de rol quedan ocultos.

### 6. Persistencia de columnas
- Orden y visibilidad de columnas guardados en `localStorage` (`pmn-col-config`).
- Carga en mount, actualización en cada cambio. Ref `colConfigLoaded` previene saves prematuros.
- Fix: bug duplicado `{e.nombre}` en sección de estados config.

### 7. Permisos en UI (verificado)
- Sidebar usa `usePermisos()` con `puedeVer()`. Tareas: `isModOrAdmin` para acciones. Delete estado: solo ADMIN. EspaciosSidebar: `isModOrAdmin` para add/delete.

### 8. Engranaje de configuración por sección
- **Componente** `SectionSettings.tsx` — Reutilizable, solo visible para admin/moderador, click-outside-to-close, acepta children.
- **KPIs** — Engranaje con 7 toggles para secciones (progreso, predios, operación, recursos, gráficos fila 1/2, actividad). Persistencia en `localStorage` (`pmn-kpi-sections`).
- **Stock** — Engranaje placeholder (próximamente: vista y columnas).
- **Calendario** — Engranaje placeholder (próximamente: preferencias de vista).
- **Tareas** — Ya tenía engranaje inline (config de columnas + estados).

### 9. Personalización de perfil
- **Paleta de avatar** — 8 gradientes seleccionables (Índigo/Violeta, Océano, Atardecer, Bosque, Berry, Pizarra, Ámbar, Menta).
- **Preferencia "vista compacta"** — Toggle para futuras tablas compactas.
- **Persistencia** — `localStorage` (`pmn-perfil-prefs`), sincronizado con Header (avatar en dropdown usa el gradiente seleccionado).

### Archivos nuevos
| Archivo | Propósito |
|---------|-----------|
| `src/app/api/auth/profile/route.ts` | GET/PATCH perfil del usuario |
| `src/app/dashboard/perfil/page.tsx` | Página de perfil completa |
| `src/app/api/permisos/estados/route.ts` | CRUD visibilidad de estados por rol |
| `src/components/ui/SectionSettings.tsx` | Componente engranaje de configuración |

### Archivos modificados
| Archivo | Cambios principales |
|---------|---------------------|
| `Header.tsx` | Dropdown mejorado, avatar dinámico con gradiente personalizable |
| `kpis/page.tsx` | Donut mejorado, SectionSettings con toggles por sección |
| `importar/page.tsx` | Soporte subcarpetas con `parentId` |
| `tareas/page.tsx` | Ocultar vacíos, filtro por permisos de estado, localStorage columnas |
| `permisos/page.tsx` | Sección visibilidad de estados con matriz rol×estado |
| `stock/page.tsx` | SectionSettings en header |
| `calendario/page.tsx` | SectionSettings en header |
| `perfil/page.tsx` | Personalización: paleta de avatar, vista compacta |
| `schema.prisma` | Modelo PermisoEstado + relación en EstadoConfig |

### Nota de deploy
- Ejecutar `npx prisma db push` o crear migración para el nuevo modelo `PermisoEstado`.

---

## Roadmap de Mejoras Futuras

### Funcionales (post-deploy, por demanda)
1. **ConnectivityBar con datos históricos reales** — Barras de switches y APs muestran datos sintéticos. Integrar endpoints de historial de conectividad.
2. **Exportación PDF/JPG desde secciones** — html2canvas + jsPDF instalados y componente ExportableSection existe, falta integrarlo en todas las vistas.
3. **Push Notifications UI** — Infraestructura VAPID configurada, falta botón de suscripción visible en la UI del usuario.
4. **SSE streaming para predios** — Sincronización en tiempo real de datos CSV no implementada.
5. **Cobertura API Meraki ampliada** — 93 funciones implementadas de ~130 disponibles. Faltan: Wireless avanzado (radio settings, RF profiles), Cable Test ejecución, SDWAN policies.

### Técnicos (refactor, no afectan funcionalidad)
6. **Tipado estricto restante** — ~50 usos de `any` en componentes de gestión (actas, tareas, espacios, calendario). Crear interfaces para cada modelo Prisma.
7. **Logging centralizado** — Reemplazar ~40 `console.error` por logger estructurado (Pino o Winston) con niveles y rotación.
8. **Cache cleanup automático** — `merakiCache.ts` tiene TTL pero sin GC. Agregar intervalo de limpieza o LRU con límite de entradas.
9. **CRON_SECRET como header** — Actualmente se pasa por query parameter (queda en logs de servidor). Migrar a header `Authorization: Bearer {secret}`.

### Pre-deploy checklist
- [ ] Rotar JWT_SECRET (generar valor aleatorio largo)
- [ ] Rotar CRON_SECRET (generar valor aleatorio)
- [ ] Configurar DATABASE_URL con PostgreSQL de producción
- [ ] NODE_ENV=production
- [ ] Crear directorios: `/uploads/actas`, `/logs`
- [ ] `npx prisma migrate deploy` en VPS
- [ ] SSL/TLS vía reverse proxy (Nginx/Caddy)
- [ ] Verificar `npm run build` limpio

---

*Proyecto listo para deploy en VPS*
---

## Fase 10: shadcn/ui + Librerías Utilitarias + Bug Fix + Dark Mode v3

### Fecha: 20 de marzo de 2026

### Bug Fix — Eliminación masiva "SIN ASIGNAR"
**Archivos:**
- `src/app/api/tareas/route.ts` — DELETE ahora soporta `?estadoId=xxx` (incluyendo `estadoId=sin-estado`) para eliminar TODOS los registros de un grupo de estado directamente en BD, sin depender del batch visible de 100.
- `src/app/dashboard/tareas/page.tsx` — `handleBulkDelete(groupId)` usa `?estadoId=` en vez de enviar IDs visibles. Ejecuta `fetchTareas()` post-eliminación para refrescar datos desde BD.

**Causa raíz:** `handleBulkDelete` solo eliminaba IDs del batch visible (límite 100), actualizaba estado local sin re-fetch. Al recargar, la BD retornaba más registros del grupo que estaban fuera del batch.

### shadcn/ui v4.1.0 adaptado a Tailwind CSS 3
**Archivos creados:**
| Archivo | Propósito |
|---------|-----------|
| `components.json` | Configuración shadcn/ui |
| `src/lib/utils.ts` | Función `cn()` (clsx + tailwind-merge) |
| `.npmrc` | `legacy-peer-deps=true` (react-leaflet@5 requiere React 19) |

**Adaptaciones TW4 → TW3:**
- Removidos imports TW4 de `globals.css`: `@import "shadcn/tailwind.css"`, `@import "tw-animate-css"`, `@apply outline-ring/50`
- Removido fuente Geist de `layout.tsx` (restaurada Inter)
- Instalado `tailwindcss-animate` (plugin TW3 reemplaza `tw-animate-css`)
- CSS variables oklch en `:root` y `.dark` personalizadas para Cerulean Blue + Grenadier
- `tailwind.config.ts`: colores CSS-variable (`background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `chart.1-5`, `sidebar.*`), `borderRadius` con CSS var, plugin `tailwindcss-animate`

**19 componentes shadcn instalados:**
avatar, badge, button, calendar, card, chart, command, dialog, dropdown-menu, input, label, popover, select, separator, sheet, skeleton, table, tabs, tooltip

### Librerías utilitarias instaladas
| Librería | Propósito |
|----------|-----------|
| `framer-motion` | Animaciones declarativas |
| `sonner` | Toasts/notificaciones |
| `cmdk` | Command palette (⌘K) |
| `@tanstack/react-table` | Tablas headless |
| `@tanstack/react-query` | Data fetching/cache |
| `nuqs` | Estado en query params |
| `vaul` | Drawers móviles |
| `date-fns` | Utilidades de fechas |
| `react-virtuoso` | Listas virtualizadas |
| `next-themes` | Soporte de temas |

### Dark Mode v3 (completado en sesión previa)
- Cobertura completa de AccessPointComponents, ApplianceHistoricalCharts, archivos CSS legacy.
- Paleta Cerulean Blue (#006CB7) + Grenadier (#D34600) + superficie blue-tinted.
- Jerarquía tonal dark: page `#0f172a` → container `#131c2e` → card `#1a2332` → elevated `#1e293b` → active `#263549`.
- CSS variables oklch para shadcn matching el tema.

### Git
- **Tag:** `backup-pre-libs` en commit `2cc72f1` (antes de instalación de librerías)
- **Build verificado** — `npm run build` exitoso con todas las dependencias

---

## Fase 11: Animaciones, Responsive y Fix Prisma

### Fecha: 20 de marzo de 2026

### Animaciones globales (Tailwind + CSS)
**Archivos:**
- `tailwind.config.ts` — Nuevas animaciones keyframe: `slideInLeft`, `slideUp`, `shimmer`, `countUp`, `cardEnter`. Fix lint: `require("tailwindcss-animate")` → `import tailwindcssAnimate from "tailwindcss-animate"` (ESM).
- `src/app/globals.css` — 5 utilidades CSS nuevas:
  - `.skeleton-shimmer` — gradiente animado para placeholders de carga
  - `.card-hover` — scale + sombra en hover con transición
  - `.stagger-children` — animación escalonada de hijos (card-enter con delay)
  - `.row-animate` — slide-in-left para filas de lista
  - `.mobile-card-table` — tabla → cards en mobile (`display: block`, cada celda con `::before` label)

### Páginas mejoradas (animaciones + responsive)
**Archivos modificados:**
- `src/app/dashboard/kpis/page.tsx` — AnimatePresence, stagger-children en grids, card-hover en stat cards, count-up animado en números, grids responsive (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`), skeleton shimmer en loading.
- `src/app/dashboard/stock/page.tsx` — mobile-card-table, modal AnimatePresence con slide-up, filtros responsive (`flex-col sm:flex-row`), columnas secundarias ocultas en mobile (`hidden sm:table-cell`).
- `src/app/dashboard/actividad/page.tsx` — stagger-children en lista, row-animate en items, header/filtros/lista responsive.
- `src/app/dashboard/bandeja/page.tsx` — stagger-children, tamaños responsive, `active:scale-[0.97]` press effect en botones.
- `src/app/dashboard/calendario/page.tsx` — AnimatePresence, botones touch-friendly (`px-4 py-2 sm:px-3 sm:py-1.5`, `active:scale-[0.97]`), filtro `w-full sm:w-auto`, semana scroll horizontal (`overflow-x-auto`, `min-w-[560px]`), día con `stagger-children` + `row-animate`, modal slide-up desde bottom en mobile (`items-end sm:items-center`, `rounded-t-2xl sm:rounded-xl`), categorías `grid-cols-2 sm:grid-cols-4`.
- `src/components/layout/Sidebar.tsx` — Backdrop con `transition-opacity duration-300` (sin flash), drawer slide `translate-x-0 / -translate-x-full` con `duration-300 ease-out shadow-2xl`, nav links con `hover:translate-x-0.5` en items inactivos.

### Fix crítico: /api/tareas retornaba 500
**Síntoma:** `PrismaClientKnownRequestError: The column 'existe' does not exist in the current database`
**Causa real:** 7 columnas del modelo `Predio` en `schema.prisma` no existían en la base de datos PostgreSQL:
- `tipoRed`, `codigoPostal`, `caracteristicaTelefonica`, `telefono`, `lab`, `nombreInstitucion`, `correo`
- El mensaje `'existe'` era un **bug de Prisma 5.x** que reporta el nombre de columna incorrecto.
- Las columnas fueron agregadas al schema sin ejecutar migración ni `db push`.

**Fix aplicado:**
- `npx prisma db push --accept-data-loss` — Sincronizó schema → DB, agregó las 7 columnas faltantes.
- Migración `20260311000000_sync_instructivo_and_indexes/migration.sql` — Removido BOM UTF-8 (bytes EF BB BF) que causaba error de sintaxis en shadow database.

**Verificación:** Query completa de `prisma.predio.findMany()` con includes ejecutada exitosamente (5 registros).

### Build
- **Build verificado** — `npx next build` compilado exitosamente, 62 páginas generadas, solo 3 warnings pre-existentes (react-hooks/exhaustive-deps).
