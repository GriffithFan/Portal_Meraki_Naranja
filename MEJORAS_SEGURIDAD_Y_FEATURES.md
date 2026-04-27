# Mejoras Diferidas: Seguridad y Funcionalidades

Fecha: 2026-04-27

Este documento lista mejoras que conviene aplicar en fases controladas. No forman parte de los cambios de bajo riesgo ya desplegados porque pueden afectar accesos, dependencias, uploads, experiencia central o infraestructura.

## Seguridad Pendiente

| Mejora | Riesgo | Que cambia | Recomendacion |
| --- | --- | --- | --- |
| Eliminar credenciales en texto plano (`passwordPlain`) | Alto operativo | Cambia recuperacion/consulta de claves de tecnicos | Hacer backup DB, inventario de usuarios afectados, migracion gradual y comunicacion previa |
| Actualizar dependencias vulnerables (`jspdf`, `xlsx`, y otras segun auditoria) | Medio | Puede afectar exportaciones PDF/Excel | Probar exportacion de stock, tareas, actas y reportes antes de subir |
| Endurecer uploads de chat, actas e instructivos | Medio | Validaciones MIME, tamano, extension, nombres y carpetas | Aplicar por modulo, empezando por logs/alertas antes de bloquear archivos |
| Rate limiting persistente | Medio | Cambia proteccion de login y APIs sensibles | Usar almacenamiento externo o estrategia compatible con PM2; evitar falsos positivos a tecnicos |
| Headers y CSP estrictos | Medio-alto | Puede bloquear imagenes, mapas, scripts o descargas | Primero modo report-only, luego enforcement por etapas |
| Auditoria de sesiones/cookies | Medio | Ajustes de expiracion, flags y renovacion | Probar en moviles y tecnicos con sesiones largas |
| Revisar permisos por rol y espacio | Medio | Puede cambiar visibilidad de datos | Crear matriz esperada por rol antes de tocar reglas |
| Sanitizacion avanzada de contenido renderizado | Bajo-medio | Refuerza textos enriquecidos, comentarios y archivos | Aplicar sin modificar datos existentes |
| Monitoreo de errores de seguridad | Bajo | Agrega alertas de eventos sospechosos | Empezar con logging sin bloqueo |
| Backups cifrados fuera del VPS | Medio | Cambia destino y retencion de backups | Probar restauracion completa antes de confiar en la rutina |

## Funcionalidades Sugeridas

| Funcionalidad | Riesgo | Valor operativo | Notas |
| --- | --- | --- | --- |
| Panel de estado operativo | Bajo-medio | Ver app, DB, backups, disco, PM2, errores recientes | Ideal para administradores |
| Vista "Mis tareas" para tecnicos | Medio | Reduce ruido y acelera trabajo diario | Debe respetar asignaciones/equipoAsignado actuales |
| Alertas de tareas inconsistentes | Bajo-medio | Detecta sin estado, sin equipo, sin GPS, duplicados | Primero como reporte, no bloqueo |
| Modo supervisor por equipo | Medio | Carga de trabajo, avances y pendientes por tecnico/equipo | Util para coordinacion TH |
| Historial visual por predio | Medio | Timeline de estados, asignaciones, comentarios y archivos | Aprovecha `actividad` existente |
| Centro de importaciones | Medio | Historial de importaciones, errores por fila, resumen de cambios | Evita reimportaciones ciegas |
| Reportes programados | Medio | Resumen diario/semanal de tareas, stock, chats y alertas | Enviar por email o bandeja interna |
| Stock minimo y alertas | Medio | Avisos de faltantes o equipos criticos | Requiere definir umbrales por tipo/equipo |
| Busqueda global | Medio | Buscar predios, stock, chats, actas e instructivos | Puede empezar por predios + stock |
| Modo solo lectura segura | Bajo-medio | Acceso para auditorias o supervision externa | Requiere roles/permisos bien definidos |

## Mejoras Tecnicas Pendientes de Performance/UX

| Mejora | Riesgo | Estado recomendado |
| --- | --- | --- |
| Paginacion server-side real en tareas | Medio | Hacer en rama/ventana de prueba; toca la pantalla principal |
| Filtros server-side para tareas | Medio | Aplicar junto con paginacion para no cargar 2000 registros siempre |
| Separar graficos pesados de KPIs en chunks dinamicos | Medio | Conviene refactorizar `dashboard/kpis` en componentes pequenos |
| Indices nuevos basados en consultas lentas reales | Medio | Medir primero; luego migracion Prisma controlada |
| SSE/WebSocket para notificaciones en vivo | Medio-alto | Probar con Nginx/PM2 antes de reemplazar polling |
| Optimizar imagenes privadas de chat/instructivos | Bajo-medio | Cuidar endpoints autenticados antes de usar `next/image` |
| Cache compartido para catalogos (`estados`, `espacios`, `campos`) | Bajo-medio | Implementar con React Query o contexto dedicado |
| Backup automatico con retencion | Bajo-medio | Usar primero el script manual y luego cron/systemd timer |

## Orden Sugerido

1. Probar restauracion de backup en entorno aislado.
2. Crear panel de estado operativo basico.
3. Agregar alertas de inconsistencias en modo reporte.
4. Implementar "Mis tareas" para tecnicos.
5. Refactorizar tareas con paginacion/filtros server-side.
6. Recién despues avanzar con seguridad sensible: `passwordPlain`, CSP, rate limit persistente y uploads estrictos.
