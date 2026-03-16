# Portal Meraki Naranja

## Plataforma Integral de Gestión de Redes y Operaciones de Campo

---

## El Problema

Las empresas que gestionan infraestructura de red Cisco Meraki enfrentan un desafío recurrente: **la información está fragmentada**. El dashboard de Meraki muestra el estado de la red, pero no conecta esa información con la realidad operativa del día a día.

- Los técnicos de campo no saben el estado real de los equipos que van a instalar.
- Los coordinadores no pueden cruzar el avance del cronograma con el estado de la red.
- La facturación depende de revisar manualmente qué sitios quedaron conformes.
- Los reportes de anomalías llegan tarde o no llegan.
- No hay un solo lugar donde ver todo.

**Portal Meraki Naranja resuelve todo esto en una sola plataforma.**

---

## Qué es

Una plataforma web que integra el monitoreo de redes Cisco Meraki con la gestión completa de operaciones de campo: cronogramas, inventario, documentación, facturación y comunicación del equipo.

No reemplaza el dashboard de Meraki. **Lo extiende** con las herramientas que el equipo operativo realmente necesita.

---

## Módulos

### 1. Monitoreo de Red en Tiempo Real

Visualización completa de la infraestructura de red sin salir de la plataforma.

**Topología de Red**
- Diagrama interactivo de dispositivos y conexiones físicas (LLDP/CDP).
- Vista unificada de switches, access points y appliances por sitio.

**Switches**
- Estado de cada puerto (velocidad, duplex, PoE, tráfico).
- Detección automática de errores CRC con alertas.
- Tabla ordenable y filtrable por cualquier columna.

**Access Points**
- Calidad de señal (RSSI) por AP.
- Clientes conectados por SSID.
- Historial de conexiones exitosas y fallidas.
- Velocidad ethernet de cada AP.

**Appliance / Firewall**
- Estado de uplinks WAN y LAN.
- Métricas de latencia y pérdida de paquetes con gráficos históricos.
- Configuración de VLANs, reglas de firewall (L3, L7), NAT, VPN site-to-site.
- Estado de IDS/IPS, malware detection y content filtering.

> Se integran más de 50 endpoints de la API de Meraki Dashboard con reintentos automáticos, paginación inteligente y caché diferenciado por tipo de dato.

---

### 2. Gestión de Cronograma y Sitios

El corazón operativo de la plataforma.

**Tabla de Predios / Sitios**
- Tabla editable en línea con 20+ columnas: nombre, código, dirección, provincia, equipo asignado, estado, prioridad, fechas, incidencias, CUE, ámbito (urbano/rural), coordenadas GPS.
- Filtrado por estado, equipo, provincia, espacio de trabajo.
- Búsqueda instantánea.
- Asignación múltiple de técnicos por sitio.
- Vinculación automática con redes Meraki (por nombre o ID).

**Espacios de Trabajo**
- Organización jerárquica de sitios en carpetas/espacios.
- Estadísticas agregadas por espacio: distribución por estado, equipo, provincia y ámbito.
- Colores e iconos personalizables.

**Estados Configurables**
- Definición libre de estados con color, orden y clave.
- Flujo visual del avance del cronograma.

---

### 3. Calendario Operativo

- Vista mensual, semanal y diaria.
- Categorías: instalación, mantenimiento, reunión, visita, guardia, recordatorio.
- Prioridades con indicadores visuales.
- Arrastrar y soltar para reprogramar (drag & drop).
- Notificaciones push automáticas para recordatorios.
- Delegación de visibilidad entre usuarios.

---

### 4. Inventario de Equipos (Stock)

- Registro de equipos con número de serie único, modelo, marca, cantidad, categoría y ubicación.
- Estados del equipo: Disponible, Instalado, En transición, Roto, Perdido, En reparación.
- Asignación de equipos a sitios.
- Historial de cambios.

---

### 5. Importación Masiva de Datos

- Carga de archivos Excel (XLSX, XLS) y CSV.
- Vista previa de hasta 200 filas antes de confirmar.
- Mapeo visual de columnas del archivo a campos del sistema.
- Soporte de importación de predios y equipos en lote.
- Ideal para migrar desde planillas existentes.

---

### 6. Documentación y Actas

**Actas**
- Subida de documentos PDF, DOC y DOCX vinculados a sitios.
- Versionado automático.
- Descarga segura con validación de acceso y protección contra path traversal.

**Instructivos / Base de Conocimiento**
- Contenido HTML enriquecido.
- Videos embebidos o subidos directamente.
- Categorización y orden personalizado.
- Accesible para todo el equipo.

---

### 7. Facturación Automatizada

Disponible exclusivamente para administradores.

- Generación de reportes semanales automáticos o manuales.
- Resumen por técnico: cantidad de sitios con estado "Conforme", listado de IDs.
- Exportación directa a CSV.
- Auditoría completa: quién generó, cuándo, modo (automático/manual).
- Cron job configurable para generación periódica.

---

### 8. Monitoreo Automatizado Post-Cambio

Cuando un técnico cambia el estado de un sitio, el sistema lanza automáticamente verificaciones de la red Meraki asociada.

**Proceso:**
1. Se detecta el cambio de estado en un predio.
2. El sistema programa 2 verificaciones automáticas con 15 minutos de intervalo.
3. En cada verificación, consulta la API de Meraki para:
   - Detectar errores CRC en puertos de switches.
   - Verificar la velocidad ethernet de los access points.
4. Si detecta anomalías, envía notificación push al técnico y registra en la bandeja.

> El equipo identifica problemas en la red minutos después de una instalación, sin que nadie tenga que revisar manualmente.

---

### 9. Comunicación del Equipo

**Notificaciones Push (PWA)**
- Notificaciones nativas del navegador/dispositivo.
- Alertas de monitoreo, recordatorios de calendario, asignaciones.
- La plataforma funciona como Progressive Web App: se instala como aplicación.

**Bandeja de Notificaciones**
- Historial completo de notificaciones.
- Estado leído/no leído.
- Enlace directo a la entidad relevante.

**Registro de Actividad**
- Log completo de todas las acciones del equipo.
- Filtrable por tipo de acción, entidad y usuario.
- Auditoría transparente de quién hizo qué y cuándo.

**Comentarios**
- Comentarios por sitio y por equipo.
- Comunicación contextual directamente en la entidad relevante.

---

### 10. Administración

**Gestión de Usuarios**
- Tres roles: Administrador, Moderador, Técnico.
- Delegaciones de visibilidad entre usuarios.
- Activación/desactivación de cuentas.

**Permisos Granulares**
- Control de acceso por sección para cada usuario.
- Configuración dinámica sin necesidad de cambiar código.

---

## Arquitectura y Seguridad

### Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14 + React 18 + TypeScript |
| Estilos | Tailwind CSS |
| Backend | Next.js API Routes (serverless-ready) |
| Base de datos | PostgreSQL + Prisma ORM |
| Autenticación | JWT (jose) + bcryptjs |
| Notificaciones | Web Push API |
| Validación | Zod (validación en toda entrada de datos) |

### Medidas de Seguridad Implementadas

| Medida | Detalle |
|--------|---------|
| Autenticación | JWT con cookies HttpOnly, Secure, SameSite=Strict |
| Rate Limiting | 120 req/min global por IP, 3 intentos de login por 15 min |
| Validación de entrada | Zod schemas en todas las rutas que reciben datos |
| Content Security Policy | script-src 'self', frame-ancestors 'none', form-action 'self' |
| HSTS | max-age 2 años con includeSubDomains y preload |
| Protección IDOR | Verificación de propiedad/asignación en recursos por ID |
| Protección Path Traversal | Validación con path.resolve + startsWith en descargas |
| Anti-timing oracle | Hash dummy en login para no revelar existencia de emails |
| Protección CSRF | SameSite=Strict en cookies + validación de sesión |
| CRON seguro | Verificación timing-safe de token secreto |
| Limites de tamaño | 16KB default, 256KB para rutas de datos masivos |
| Errores seguros | Mensajes genéricos al cliente, sin stack traces |

---

## Requisitos de Infraestructura

| Componente | Mínimo | Recomendado |
|-----------|--------|-------------|
| Servidor | VPS 1 vCPU, 1GB RAM | VPS 2 vCPU, 4GB RAM |
| Base de datos | PostgreSQL 14+ | PostgreSQL 16 |
| Node.js | 18 LTS | 20 LTS |
| Almacenamiento | 10 GB | 50 GB (documentos y videos) |
| SSL | Requerido (Let's Encrypt) | Requerido |
| Dominio | Requerido | Requerido |

**Requisitos externos:**
- Cuenta Cisco Meraki con API key habilitada.
- Acceso a las organizaciones/redes que se desean monitorear.

---

## Diferenciadores

| Característica | Portal Meraki Naranja | Dashboard Meraki | Planilla Excel | Software genérico de tareas |
|---|---|---|---|---|
| Monitoreo de red en tiempo real | ✅ | ✅ | ❌ | ❌ |
| Gestión de cronograma de campo | ✅ | ❌ | ✅ (manual) | ✅ |
| Vinculación sitio ↔ red | ✅ Automática | ❌ | ❌ | ❌ |
| Alertas automáticas post-instalación | ✅ | ❌ | ❌ | ❌ |
| Facturación por técnico | ✅ | ❌ | ✅ (manual) | ❌ |
| Importación desde Excel existente | ✅ | ❌ | N/A | Parcial |
| Push notifications | ✅ | ❌ | ❌ | Varía |
| Documentación y actas por sitio | ✅ | ❌ | ❌ | ❌ |
| Auditoría de acciones | ✅ | ✅ (solo red) | ❌ | Varía |
| Una sola plataforma | ✅ | Solo red | Solo datos | Solo tareas |

---

## Casos de Uso

### Empresa integradora de telecomunicaciones
> "Tenemos 500 sitios por recorrer en 6 meses. Cada sitio tiene equipos Meraki. Necesitamos que los técnicos vean el estado de la red, marquen el avance y que el coordinador pueda facturar lo que ya está conforme."

### ISP regional con infraestructura Meraki
> "Nuestros técnicos trabajan en campo y necesitan ver la topología y el estado de los switches antes de ir al sitio. Si algo falla después de una instalación, queremos saberlo en minutos, no en días."

### Empresa de mantenimiento de redes escolares
> "Gestionamos cientos de escuelas con equipos Meraki. Necesitamos un cronograma por provincia, control de stock de equipos y actas firmadas por sitio."

---

## Modelo de Entrega

**Opción 1 — Instalación en servidor del cliente**
- Deploy en VPS del cliente (Ubuntu/Debian).
- Scripts de instalación automatizados incluidos.
- El cliente mantiene control total de sus datos.
- Soporte post-instalación configurable.

**Opción 2 — Plataforma gestionada (SaaS)**
- Hosting y mantenimiento incluido.
- Actualizaciones automáticas.
- Backups diarios.
- SLA configurable.

---

## Soporte y Mantenimiento

| Nivel | Incluye |
|-------|---------|
| **Básico** | Corrección de bugs, actualizaciones de seguridad |
| **Estándar** | Básico + soporte por email en horario laboral, actualizaciones mensuales |
| **Premium** | Estándar + soporte prioritario, personalización de módulos, capacitación del equipo |

---

## Roadmap

| Estado | Funcionalidad |
|--------|--------------|
| ✅ Disponible | Monitoreo Meraki (switches, APs, appliances, topología) |
| ✅ Disponible | Gestión de cronograma con tabla editable |
| ✅ Disponible | Calendario con drag & drop |
| ✅ Disponible | Inventario de equipos |
| ✅ Disponible | Importación masiva Excel/CSV |
| ✅ Disponible | Documentación y actas |
| ✅ Disponible | Facturación automatizada |
| ✅ Disponible | Monitoreo post-cambio automático |
| ✅ Disponible | Push notifications (PWA) |
| ✅ Disponible | Roles y permisos granulares |
| 🔜 Próximo | Mapa interactivo de sitios con GPS |
| 🔜 Próximo | Dashboard ejecutivo con KPIs |
| 🔜 Próximo | Reportes exportables en PDF |
| 🔜 Próximo | Integración con sistemas de ticketing |

---

## Demo

Solicite una demostración con datos de su propia infraestructura Meraki.

La configuración inicial requiere únicamente:
1. Una API key de Meraki Dashboard.
2. Acceso a la organización que desea monitorear.
3. 15 minutos.

---

## Contacto

**Portal Meraki Naranja**
Plataforma integral de gestión de redes y operaciones de campo.

*Desarrollado sobre la API de Cisco Meraki Dashboard.*
*Cisco Meraki es una marca registrada de Cisco Systems, Inc.*
