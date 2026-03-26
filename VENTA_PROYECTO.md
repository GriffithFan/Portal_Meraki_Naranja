# Carrot — Plataforma de Gestión Operativa y Monitoreo de Red

> Sistema integral para equipos de campo que unifica gestión de tareas, inventario, monitoreo Meraki, facturación y comunicación en una sola plataforma web.

---

## ¿Qué es Carrot?

Carrot es una plataforma web diseñada para empresas que gestionan operaciones técnicas en campo — instalaciones, mantenimiento de redes, logística de equipos y coordinación de técnicos. Reemplaza la combinación de hojas de cálculo, WhatsApp, correos y herramientas dispersas por un sistema centralizado, en tiempo real y accesible desde cualquier dispositivo.

---

## Problema que resuelve

| Sin Carrot | Con Carrot |
|---|---|
| Excel compartidos que se desactualizan | Base de datos centralizada en tiempo real |
| WhatsApp para coordinación → mensajes perdidos | Chat integrado con mesa de ayuda y notificaciones push |
| Sin visibilidad del estado del inventario | Stock con estados, asignaciones y etiquetas en vivo |
| Reportes manuales de facturación | Generación automática semanal con exportación CSV |
| Sin monitoreo de red integrado | Topología, switches, APs y appliance Meraki en el mismo lugar |
| Técnicos sin acceso a información de campo | App móvil (PWA) con mapas GPS y calendario |

---

## Módulos principales

### 1. Gestión de tareas y espacios de trabajo
- **Tablero Kanban** con drag-and-drop entre estados (Pendiente → En proceso → Completada)
- **Espacios jerárquicos** — carpetas y subcarpetas con colores e íconos personalizables
- **Calendario** integrado con vistas mensual, semanal y diaria
- Asignación a técnicos, prioridades (Baja/Media/Alta/Urgente) y fechas programadas
- Campos de cronograma: incidencias, CUE, LAC-R, ámbito, equipo asignado, provincia
- Registro automático de actividad en cada cambio

### 2. Inventario de equipos (Stock)
- **Columnas personalizables**: arrastrar para reordenar, mostrar/ocultar, configuración persistente
- **Edición inline**: doble clic en cualquier celda para editar al instante
- **Sistema de etiquetas**: 10 colores predefinidos para clasificación visual rápida
- **Estados de equipo**: Disponible, Instalado, En tránsito, Roto, Perdido, En reparación
- **Asignación a técnicos** directamente desde la tabla
- Búsqueda, filtros por estado/categoría y soporte para +5,000 registros
- Campo de fecha nativo para control de ingreso/alta

### 3. Importación masiva desde Excel
- Soporta **XLSX, XLS y CSV** (hasta 2,000 filas por lote)
- **Auto-detección inteligente** de columnas con aliases en español e inglés
- Matching de técnicos **sin sensibilidad a acentos ni mayúsculas** (ej: "enzò" → "Enzo")
- Matching de estados con normalización automática
- Previsualización en vivo antes de confirmar
- Exclusión selectiva de filas y columnas
- Creación de campos personalizados al vuelo

### 4. Predios y locaciones
- Gestión de sitios con coordenadas GPS y **mapa interactivo (Leaflet)**
- Dirección, ciudad, provincia, código postal, CUE
- Vinculación directa con redes Meraki
- Sistema de comentarios por predio
- Integración con cronograma operativo

### 5. Monitoreo de red Meraki
- **Topología de red** interactiva con grafos de capa de enlace
- **Switches**: estado de puertos, detección fibra/cobre, ACLs
- **Access Points**: estado online/offline, detección de repetidores mesh, señal WiFi
- **Appliance**: uplinks, salud LTE/Internet, métricas de ancho de banda
- Datos históricos de performance (pérdida, latencia, uso de uplink)
- Cache inteligente con TTL de 5 minutos y paginación cursor para +1,000 dispositivos

### 6. Chat y mesa de ayuda
- Flujo de trabajo Help Desk: Crear → Abrir → Agente toma → Cerrada
- Envío de archivos, imágenes, audio y documentos (hasta 25 MB)
- **Notificaciones push** al equipo de mesa cuando llega una nueva consulta
- Contador de mensajes no leídos y bandeja de notificaciones
- Anonimización de consultas técnicas

### 7. Facturación y reportes
- Reportes semanales automáticos (cron los lunes 08:00)
- Agrupación por técnico: cantidad de tareas, horas, costo
- **Exportación CSV** con desglose detallado
- Filtro por estado de conformidad
- Histórico de reportes para auditoría

### 8. Instructivos técnicos
- Guías con video (YouTube embebido), imágenes y descripción
- Visor de imágenes interactivo con zoom fullscreen
- Acceso de solo lectura para técnicos

### 9. Actas oficiales
- **Generación de PDF** con códigos QR
- Múltiples actas por locación
- Vinculación directa a predios

### 10. Hospedajes
- Gestión de alojamientos para equipos en campo
- Ubicación, tipo, garage, teléfono, provincia, notas

---

## Características transversales

| Característica | Detalle |
|---|---|
| **Roles y permisos** | 3 niveles (Admin, Moderador, Técnico) + sub-rol Mesa de ayuda. Matriz de permisos configurable por sección |
| **Papelera** | Eliminación suave con snapshot completo. Restauración con un clic. Purga automática a 30 días |
| **Notificaciones push** | Web Push API con VAPID. Alertas en tiempo real para chat, tareas y cambios |
| **PWA (Progressive Web App)** | Instalable en móvil, Service Worker con cache offline, ícono en pantalla de inicio |
| **Modo oscuro** | Toggle light/dark con detección de preferencia del sistema. Variables oklch para colores precisos |
| **Diseño responsivo** | Mobile-first con Tailwind. Tablas adaptativas, modales bottom-sheet, sidebar colapsable, botones touch-friendly |
| **Animaciones** | Framer Motion + 15 animaciones Tailwind: fade, slide, scale, shake, shimmer, float |
| **Registro de actividad** | Timeline completo de acciones por entidad y usuario |
| **Bandeja de notificaciones** | Inbox centralizado con filtros y timestamps |
| **Búsqueda global** | Barra de búsqueda en el header que filtra la sección activa |

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript |
| **UI** | Tailwind CSS 3.4, shadcn/ui (19 componentes), Framer Motion, Lucide icons |
| **Mapas** | Leaflet + react-leaflet |
| **Gráficos** | Recharts (barras, líneas, tortas) |
| **Backend** | Next.js API Routes (Node.js 18+) |
| **Base de datos** | PostgreSQL 16 + Prisma 5 ORM |
| **Autenticación** | JWT (httpOnly cookies, 8h exp) + bcrypt |
| **Validación** | Zod (schemas tipados) |
| **Archivos** | XLSX parser, jsPDF, html-to-image, Sharp, QRCode |
| **Notificaciones** | Web Push API, VAPID |
| **Estado** | TanStack Query, TanStack Table, React Virtuoso (virtual scroll) |
| **Despliegue** | VPS Ubuntu 24.04, PM2, Nginx, Let's Encrypt |

---

## Seguridad

- **Firewall UFW** — solo SSH, HTTP y HTTPS abiertos
- **SSH** con claves Ed25519 (sin contraseña, sin root)
- **Fail2ban** — bloqueo automático tras 3 intentos fallidos
- **TLS 1.2+** con certificados Let's Encrypt y renovación automática
- **Nginx** con rate limiting (30 req/s), HSTS, CSP, X-Frame-Options, compresión Gzip
- **Acceso a uploads bloqueado** (403 directo)
- **PostgreSQL** con usuario de privilegios mínimos
- **Backups automáticos** con retención de 30 días
- **Actualizaciones de seguridad** desatendidas (unattended-upgrades)

---

## KPIs y analíticas

- Total de predios y desglose por estado
- Distribución por equipo técnico (TH01-TH10)
- Distribución geográfica por provincia
- Distribución por ámbito (Urbano/Rural)
- Porcentaje de cumplimiento semanal de tareas
- Resumen de actividad: creaciones, actualizaciones, completados
- Secciones toggleables con persistencia en localStorage

---

## ¿Para quién es?

- **ISPs y proveedores de telecomunicaciones** que gestionan instalaciones y mantenimiento de red
- **Empresas con equipos técnicos en campo** que necesitan coordinar tareas, inventario y logística
- **Organizaciones que usan Cisco Meraki** y quieren un dashboard operativo integrado
- **Empresas de servicios** que requieren trazabilidad de operaciones, facturación y reportes

---

## Diferenciadores

1. **Todo en uno** — Tareas + Stock + Meraki + Chat + Facturación en una sola plataforma
2. **Importación inteligente** — Auto-detecta columnas de Excel con normalización de acentos y matching difuso
3. **Monitoreo Meraki nativo** — Topología, switches, APs y appliance sin salir de la plataforma
4. **PWA instalable** — Funciona como app nativa en móvil con notificaciones push y modo offline
5. **Personalizable** — Columnas configurables, etiquetas con colores, permisos por sección, modo oscuro
6. **Seguridad probada** — VPS hardened con fail2ban, TLS, rate limiting y backups automáticos
7. **Sin dependencia de SaaS** — Self-hosted en tu propio servidor, sin suscripciones mensuales a terceros

---

## Contacto

*[Completar con datos de contacto]*
