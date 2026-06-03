# Carrot — Plataforma de Gestión Operativa y Monitoreo de Red

> Sistema integral para equipos técnicos en campo que unifica gestión de tareas, inventario, monitoreo Meraki, facturación, chat y analíticas en una sola plataforma web self-hosted.

---

## ¿Qué es Carrot?

Carrot es una plataforma web diseñada para empresas que gestionan operaciones técnicas en campo: instalaciones, mantenimiento de redes, logística de equipos y coordinación de técnicos. Reemplaza la combinación de hojas de cálculo, WhatsApp, correos y herramientas dispersas por un sistema centralizado, en tiempo real y accesible desde cualquier dispositivo.

---

## Problema que resuelve

| Sin Carrot | Con Carrot |
|---|---|
| Excel compartidos que se desactualizan | Base de datos centralizada en tiempo real |
| WhatsApp para coordinación → mensajes perdidos | Chat integrado con mesa de ayuda y notificaciones push |
| Sin visibilidad del estado del inventario | Stock con estados, etiquetas, asignaciones y paginación de +5.000 registros |
| Reportes manuales de facturación | Generación automática semanal con exportación CSV desglosada por técnico |
| Sin monitoreo de red integrado | Topología, switches, APs, appliance y monitoreo post-cambio Meraki en el mismo lugar |
| Técnicos sin acceso a info de campo | PWA instalable en móvil con mapa GPS, calendario y notificaciones push |
| Accesos sin control granular | Permisos por sección y por usuario (ver/crear/editar/eliminar/exportar), con visibilidad de estados configurable por rol |
| Eliminaciones accidentales irrecuperables | Papelera con snapshot completo, restauración con un clic y purga a 30 días |

---

## Módulos actuales

### 1. Dashboard principal
- **Resumen ejecutivo** adaptado por rol: predios totales, con red Meraki, tareas del día, pendientes, actividad reciente
- Vista de dispositivos Meraki en vivo: total online/offline/alerta/dormant, desglose por switches, APs y appliances
- Widgets de stock (disponibles, asignados, rotos) y usuarios activos
- Acceso rápido a todas las secciones desde un solo lugar

### 2. Gestión de tareas / Predios (Cronograma)
- **Espacios de trabajo jerárquicos** — carpetas y subcarpetas con colores e íconos personalizables
- **Tablero Kanban** con drag-and-drop entre estados personalizados
- **Vista de lista** con columnas configurables, reordenables y ocultables (configuración persistida en DB)
- **Filtros avanzados**: búsqueda de texto, estado, equipo asignado, provincia, ámbito, prioridad, fecha
- **Delegaciones cruzadas** — un técnico puede compartir visibilidad de sus tareas con otro usuario
- **Campos del cronograma operativo**: incidencias, CUE, LAC-R, ámbito (Urbano/Rural), equipo asignado, provincia, teléfono, correo, coordenadas GPS, tipo de red, código postal
- **Campos dinámicos** (CampoPersonalizado) — el admin crea campos extra (text/number/date/select/badge) que se agregan a todas las tareas sin migraciones
- **Prioridades**: Baja / Media / Alta / Urgente con codificación visual de color
- **Comentarios** por tarea con timeline de actividad
- **Actas oficiales**: upload de PDF con generación de QR, múltiples versiones por predio
- **Vinculación Meraki**: cada predio puede asociarse a una red Meraki (networkId + orgId) para abrir el panel de monitoreo directo

### 3. Mis Tareas (vista técnico)
- Vista personal filtrada por tareas propias, asignadas o de equipos delegados
- Filtros rápidos: vencidas, para hoy, alta/urgente, sin GPS, sin estado
- KPIs individuales: total, hoy, vencidas, conformes
- Acceso rápido a tarea vinculada con link directo al predio

### 4. Estado operativo
- Panel de alertas de calidad de datos: predios sin estado, sin equipo asignado, sin GPS, sin espacio
- Métricas de completitud del cronograma
- Resumen de usuarios activos y actividad reciente

### 5. Supervisor por equipo
- Vista comparativa de carga de trabajo por técnico/equipo (TH01-TH10)
- Métricas por equipo: total tareas, vencidas hoy, alta/urgente, sin GPS, sin estado
- Filtros por vencidas, para hoy, con alertas
- Resumen global de toda la operación en tiempo real

### 6. Calendario
- Vistas mensual, semanal y diaria
- Categorías de evento: Instalación, Mantenimiento, Reunión, Visita, Guardia, Recordatorio, General
- Soporte para eventos de todo el día y de múltiples días
- Notificaciones push configurables por evento
- Asignación de técnico y vinculación opcional a predio

### 7. Inventario de equipos (Stock)
- **Tabla con TanStack Table + virtual scroll** (100 filas/página, soporta +5.000 registros sin lag)
- **Edición inline** doble clic en cualquier celda
- **Sistema de etiquetas con colores** — 10 colores predefinidos, edición directa con Enter para guardar
- **Dropdowns de Proveedor y Ubicación** con valores preconfigurados más opción "editar libremente"
- **Estados**: Disponible, Instalado, En tránsito, Roto, Perdido, En reparación
- **Campos**: nombre, descripción, número de serie, modelo, marca, cantidad, categoría, ubicación, proveedor, fecha de alta, notas
- **Campos extra dinámicos** (JSON) para datos adicionales por equipo
- **Asignación a técnico** directamente desde la tabla
- **Vinculación a predio** — el equipo puede asociarse al sitio donde está instalado
- Filtros combinados: búsqueda de texto, estado, categoría
- Exportación CSV de la vista filtrada

### 8. Importación masiva desde Excel
- Soporta **XLSX, XLS y CSV** (hasta 2.000 filas por lote)
- **Auto-detección inteligente de columnas** con aliases en español e inglés
- Matching de técnicos **sin sensibilidad a acentos ni mayúsculas** (`enzò` → `Enzo`)
- Matching de estados con normalización automática
- **Previsualización en vivo** antes de confirmar la importación
- Exclusión selectiva de filas y columnas problemáticas
- Creación de campos personalizados al vuelo durante la importación

### 9. Monitoreo de red Meraki
- **Búsqueda de redes** por nombre, código de predio, serial, MAC, network ID (`L_xxx`, `N_xxx` o numérico puro)
- **Topología de red** interactiva — grafo de capa de enlace LLDP/CDP con visualización de vínculos entre dispositivos
- **Switches**: estado de puertos (up/down/SFP/copper), velocidad, ACLs, detección de fibra
- **Access Points**: estado online/offline, señal WiFi, detección de repetidores mesh, historial de conexiones y calidad de señal
- **Appliance (MX)**: estado de uplinks (WAN/LTE), pérdida de paquetes, latencia, datos históricos de ancho de banda por uplink, ARP/DHCP
- **Cable test** por serial directo desde la UI
- **Monitoreo post-cambio de estado**: tras cambiar el estado de un predio, el sistema realiza checks automáticos a los 15 y 30 minutos y notifica al usuario si la red vuelve a estar online o si hay alertas
- Cache inteligente con TTL configurable (5-10 min) y paginación cursor para +1.000 dispositivos
- Retry automático de rate limit Meraki (429) con backoff

### 10. KPIs y analíticas
- **Total de predios** con desglose por estado personalizado, equipo técnico, provincia y ámbito
- **Progreso del cronograma** — porcentaje de tareas conformes
- **Producción semanal**: total, conformes y no conformes, desglosado por técnico
- **Gráficos interactivos** (Recharts): barras, tortas, líneas de tendencia
- **Tareas**: pendientes, vencidas, para hoy, completadas en semana y mes
- **Stock**: disponibles, asignados, rotos
- **Operación**: usuarios activos, actividad semanal, notificaciones pendientes
- Secciones del dashboard toggleables con persistencia en localStorage

### 11. Chat y mesa de ayuda
- Flujo Help Desk completo: `ABIERTA` → técnico envía → `EN_CURSO` → agente toma → `CERRADA`
- **Envío de archivos multimedia**: imágenes, video, audio (hasta 2 min grabado en browser), documentos ZIP (hasta 25 MB)
- **Reacciones** a mensajes con emojis
- Descarga inline o como attachment por tipo MIME
- **Notificaciones push** al equipo mesa cuando llega una nueva consulta
- Contador de mensajes no leídos en tiempo real
- Colores de participante por conversación para identificación visual

### 12. Facturación y reportes
- **Generación automática semanal** (cron lunes 08:00) de reportes de conformidad
- Agrupación por técnico: cantidad de tareas conformes, listado con código, nombre y provincia
- **Exportación CSV** con desglose completo por técnico
- Generación manual adicional desde la UI (Admin/Mod)
- Histórico de todos los reportes con expandible por semana
- Marcado manual `enFacturacion` por predio para gestión de facturación especial

### 13. Instructivos técnicos
- Guías con **video embebido** (YouTube o archivo local), imágenes y PDF adjunto
- Visor de imágenes fullscreen con zoom interactivo
- Categorías configurables, ordenamiento manual
- Acceso de solo lectura para técnicos de campo

### 14. Actas oficiales
- Upload de PDF por predio con versionado
- **Generación de QR** embebido en el acta para verificación
- Vinculación directa al predio correspondiente
- Descarga directa desde el listado

### 15. Hospedajes
- Gestión de alojamientos para equipos en campo
- Campos: ubicación, nombre, tipo, garage, teléfono, provincia, notas
- Filtro por provincia y búsqueda de texto

### 16. Bandeja de notificaciones
- Inbox centralizado con todas las notificaciones del usuario
- Tipos: Tarea, Alerta, Recordatorio, Changelog, Alerta monitoreo, Monitoreo OK
- Filtro leídas/no leídas, marcado individual y masivo como leído

### 17. Registro de actividad
- Timeline completo de todas las acciones: CREAR, ACTUALIZAR, ELIMINAR, CAMBIO_ESTADO
- Filtro por entidad (predio, equipo, calendario, etc.)
- Paginación cursor con "cargar más" (50 registros por página)
- Visible para Admin y Moderador

### 18. Auditoría de accesos
- Log de eventos de seguridad: LOGIN, CONSULTA_PREDIO, CONSULTA_MERAKI
- Filtros por tipo de acción, usuario y rango de fechas
- Paginación con "cargar más"
- Solo accesible para Admin

### 19. Papelera
- Eliminación suave para: Predios, Equipos, Actas, Eventos de calendario, Instructivos, Hospedajes, Reportes
- **Snapshot JSON completo** del registro antes de eliminar
- Restauración con un clic (recrea el registro original)
- Búsqueda y filtro por tipo
- **Purga automática** a los 30 días (cron `cleanup`)
- Vaciado total con confirmación doble

### 20. Gestión de usuarios
- CRUD completo de usuarios con rol asignado
- **Contraseña visible para Admin** (campo `passwordPlain`) para soporte de campo
- Sub-rol `esMesa` para habilitar atención de chat sin cambiar el rol principal
- Activar/desactivar usuarios sin eliminarlos

### 21. Permisos granulares
- **Matriz por rol** (Admin/Moderador/Técnico) × sección × acción (ver/crear/editar/eliminar/exportar)
- **Sobreescritura por usuario** individual: se puede dar más o menos acceso que su rol base
- **Visibilidad de estados por rol y por usuario**: un estado puede ser visible para Admins pero oculto para Técnicos
- Secciones disponibles en el panel de permisos: mis-tareas, tareas, calendario, predios, hospedajes, stock, importar, switches, topología, APs, appliance, instructivos, facturación, actas, papelera, chat, actividad, KPIs, operación, supervisor, usuarios, permisos, auditoría

### 22. Perfil de usuario
- Cambio de nombre y contraseña
- Gestión de suscripciones push
- Vista de delegaciones activas (dadas y recibidas)

---

## Características transversales

| Característica | Detalle |
|---|---|
| **Roles y permisos** | 3 roles (Admin, Moderador, Técnico) + sub-rol Mesa de Ayuda. Permisos por sección y por usuario individual |
| **Papelera con snapshot** | Eliminación suave con JSON completo. Restauración con un clic. Purga automática a 30 días |
| **Notificaciones push (VAPID)** | Web Push API. Alertas en tiempo real para chat, tareas, cambios de estado y monitoreo Meraki |
| **PWA instalable** | Service Worker con cache offline, manifest, ícono en pantalla de inicio |
| **Modo oscuro** | Toggle light/dark con detección del sistema. Variables oklch para colores precisos |
| **Diseño responsivo** | Mobile-first con Tailwind. Tablas adaptativas, modales bottom-sheet, sidebar colapsable |
| **Animaciones** | Framer Motion + animaciones Tailwind: fade, slide, scale, shake, shimmer, float |
| **Exportación de secciones** | Botón "Exportar" por sección Meraki usando html-to-image → PNG descargable |
| **Búsqueda en tiempo real** | Barra de búsqueda en header + búsqueda Meraki multi-campo (nombre, predio, serial, MAC, networkId) |
| **Crons automáticos** | Facturación semanal, monitoreo post-cambio, cleanup de papelera |
| **Rate limiting API** | Límite de requests en middleware + retry automático de Meraki 429 |
| **Configuración de vista compartida** | Orden y visibilidad de columnas persistido en DB por clave de vista |

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| **Frontend** | Next.js 14.2 (App Router), React 18, TypeScript 5 |
| **UI** | Tailwind CSS 3.4, shadcn/ui, Base UI, Framer Motion 12, Lucide icons 0.577 |
| **Tablas** | TanStack Table 8, React Virtuoso (virtual scroll) |
| **Drag & Drop** | @dnd-kit/core + @dnd-kit/sortable |
| **Mapas** | Leaflet 1.9 + react-leaflet 5 |
| **Gráficos** | Recharts 2.15 (barras, líneas, tortas, áreas) |
| **Fechas** | date-fns 4, react-day-picker 9 |
| **Backend** | Next.js API Routes (Node.js 18+) |
| **Base de datos** | PostgreSQL 16 + Prisma 5.22 ORM |
| **Autenticación** | JWT httpOnly cookies (8h) + bcryptjs + jose |
| **Validación** | Zod 4 (schemas tipados en todos los endpoints) |
| **HTTP cliente** | Axios (con retry automático para Meraki 429) |
| **Archivos / docs** | XLSX parser, jsPDF 4, html-to-image, html2canvas, Sharp, QRCode, web-push |
| **Notificaciones** | Web Push API, VAPID (web-push 3.6) |
| **Toasts** | Sonner 2 |
| **URL state** | nuqs 2 |
| **Despliegue** | VPS Ubuntu 24.04, PM2, Nginx, Let's Encrypt (TLS automático) |

---

## Seguridad

- **Firewall UFW** — solo SSH, HTTP y HTTPS expuestos
- **SSH** con claves Ed25519 (sin contraseña, sin login root)
- **Fail2ban** — bloqueo automático tras 3 intentos fallidos
- **TLS 1.2+** con certificados Let's Encrypt y renovación automática
- **Nginx** con rate limiting (30 req/s), HSTS, CSP, X-Frame-Options, X-Content-Type-Options, compresión Gzip
- **Acceso a `/uploads` bloqueado** (403 directo vía Nginx)
- **Middleware Next.js** con verificación JWT en cada ruta protegida y rate limiting in-memory
- **PostgreSQL** con usuario de privilegios mínimos (no superuser)
- **Backups automáticos** con retención de 30 días
- **Actualizaciones de seguridad** desatendidas (unattended-upgrades)
- **Log de auditoría** de accesos y consultas sensibles con IP y timestamp

---

## ¿Para quién es?

- **ISPs y proveedores de telecomunicaciones** que gestionan instalaciones y mantenimiento de red en campo
- **Empresas con equipos técnicos distribuidos** que necesitan coordinar tareas, inventario y logística entre múltiples técnicos
- **Organizaciones que usan Cisco Meraki** y quieren un dashboard operativo integrado sin depender del Dashboard nativo
- **Empresas de servicios** que requieren trazabilidad de operaciones, facturación por técnico y reportes auditables

---

## Diferenciadores actuales

1. **Todo en uno** — Tareas + Stock + Meraki + Chat + Facturación + KPIs + Auditoría en una sola plataforma
2. **Monitoreo Meraki nativo** — Topología, switches, APs, appliance y monitoreo automático post-cambio sin salir de la app
3. **Permisos ultra-granulares** — Matriz rol × sección × acción + sobreescritura por usuario individual + visibilidad de estados por rol
4. **Importación inteligente** — Auto-detecta columnas de Excel con normalización de acentos y matching difuso
5. **PWA instalable** — Funciona como app nativa en móvil con notificaciones push y modo offline
6. **Sin dependencia de SaaS** — Self-hosted en tu propio servidor, sin suscripciones mensuales a terceros
7. **Papelera con restauración real** — Snapshot JSON completo + restauración en un clic para cualquier entidad
8. **Chat multimedia con mesa de ayuda** — Audio grabado, imágenes, video, documentos, reacciones y flujo Help Desk estructurado
9. **Auditoría completa** — Log de actividad por entidad + log de accesos con IP para cumplimiento y seguridad

---

## Roadmap / Funcionalidades a futuro

### Monitoreo y alertas
- **Alertas proactivas de dispositivos offline** — notificación push cuando un appliance o switch cambia a offline/alerting sin intervención manual
- **Dashboard de salud multi-org** — vista unificada de todas las organizaciones Meraki con semáforos de estado
- **Historial de uptime por red** — gráfico de disponibilidad acumulada por período (diario/semanal/mensual)
- **Integración con webhooks Meraki** — recibir eventos de la API en tiempo real en vez de polling
- **Alertas por umbral** — notificar si la pérdida de paquetes supera X% o el uso de uplink supera Y Mbps

### Gestión y operaciones
- **Firma digital en actas** — capturas de firma en pantalla táctil embebidas en el PDF
- **Checklist de instalación** — pasos configurables por tipo de trabajo, marcado por el técnico en campo
- **Cronómetro de tiempo por tarea** — registro de horas trabajadas directamente en la tarea
- **Geofencing de check-in** — validar que el técnico está en las coordenadas del predio al marcar tarea
- **Historial de cambios de estado por predio** — línea de tiempo visual de todos los cambios con fecha, usuario y nota
- **Exportación a Excel/PDF del cronograma** — tabla completa de predios con todos los campos del cronograma

### Integraciones
- **Integración con ClickUp / Jira** — sincronización bidireccional de tareas
- **API REST pública con API keys** — para que sistemas externos (ERP, CRM) puedan leer/escribir datos
- **Importación de dispositivos desde Meraki** — sincronizar automáticamente el inventario de la org al stock local
- **Exportación a SIGO / SIGEP** (sistemas provinciales de gestión) para reportes regulatorios

### Stock e inventario
- **Código QR por equipo** — etiqueta imprimible con QR que al escanear abre la ficha del equipo
- **Historial de movimientos por equipo** — quién lo tuvo, dónde estuvo, cuándo cambió de estado
- **Alertas de stock bajo** — notificación cuando la cantidad de un equipo cae por debajo del mínimo configurado
- **Reservas y préstamos** — flujo formal de salida/retorno de equipos con fecha de devolución

### Analíticas avanzadas
- **Mapa de calor geográfico** — visualización de densidad de predios/incidencias por zona en el mapa
- **Tendencia de cumplimiento** — gráfico de progreso semanal/mensual de tareas conformes vs. objetivo
- **Reporte de eficiencia por técnico** — tiempo promedio de resolución, tasa de conformidad, predios por semana
- **Exportación de KPIs a PDF** — informe ejecutivo con todos los gráficos listo para presentar

### Plataforma
- **Multi-tenant** — una instalación para múltiples empresas clientes con datos completamente aislados
- **App mobile nativa (React Native)** — para captura de fotos, firma y check-in con acceso offline real
- **SSO / OAuth2** — login con Google o Microsoft para empresas con directorio corporativo
- **Webhooks salientes** — notificar a sistemas externos cuando cambia el estado de un predio o se genera un reporte

---

## Contacto

*[Completar con datos de contacto]*
