# Checklist de Mejoras: Seguridad, Performance y Funcionalidades

Fecha inicial: 2026-04-27
Ultima actualizacion: 2026-04-28

Este documento funciona como checklist vivo. La fase sensible de credenciales/login queda separada para mas adelante; las mejoras actuales deben evitar tocar credenciales de tecnicos, `passwordPlain`, estados actuales, stock y datos operativos.

## Aplicado

- [x] Columnas OCP visibles desde Excel importado mediante campos personalizados.
- [x] Regla global `equipoAsignado` equivalente a asignacion de usuario.
- [x] Backfill de asignaciones desde equipo/asignado en produccion.
- [x] Cache corto para KPIs de dashboard.
- [x] Carga dinamica de `xlsx` en Stock para reducir bundle inicial.
- [x] Polling de chat/notificaciones pausado con pestaña oculta y sin requests solapados.
- [x] Chat incremental con `since` para traer solo mensajes nuevos.
- [x] Diferencia clara entre tareas directas y tareas con subcarpetas.
- [x] Toggle opcional para incluir subcarpetas en espacios.
- [x] Script manual de backup con retencion: `scripts/backup-production.sh`.
- [x] Panel Estado operativo basico: `/dashboard/operacion`.
- [x] Panel Estado operativo extendido: runtime Node, RAM, disco, logs PM2 y backups detectados.
- [x] Vista Mis tareas: `/dashboard/mis-tareas`.
- [x] Filtros rapidos de Mis tareas: hoy, vencidas, sin GPS, sin estado, sin espacio y alta prioridad.
- [x] Paginacion server-side inicial en Cronograma: `/dashboard/tareas` carga 500 registros por pagina.
- [x] Busqueda server-side en Cronograma.
- [x] Filtros server-side en Cronograma por estado, provincia, equipo, prioridad y filtros rapidos.
- [x] Paginacion server-side inicial en tareas por espacio: `/dashboard/tareas/espacio/[id]/tareas` carga 500 registros por pagina.

## En Progreso / Pendiente no Sensible

- [ ] Paginacion avanzada de tareas: conteos globales por estado/grupo calculados en servidor, no solo sobre lo cargado.
- [ ] Filtros guardados por usuario en Cronograma.
- [ ] Filtros server-side completos en tareas por espacio: estado, provincia, equipo, prioridad y filtros rapidos.
- [ ] Historial visual por predio con timeline de actividad, cambios de estado, asignaciones, comentarios y archivos.
- [ ] Centro de importaciones con historial, errores por fila, resumen de altas/cambios y proteccion contra reimportaciones ciegas.
- [ ] Modo supervisor por equipo: carga, vencidas, avance y pendientes por tecnico/equipo.
- [ ] Stock minimo y alertas por tipo/equipo.
- [ ] Busqueda global inicial: predios + stock; luego chats, actas e instructivos.
- [ ] Reportes programados diarios/semanales por bandeja interna o email.
- [ ] Panel operativo con checks HTTP externos, estado PM2 mas detallado y ultima ejecucion de cron/backups.
- [ ] Separar graficos pesados de `/dashboard/kpis` en chunks dinamicos.
- [ ] Cache compartido para catalogos (`estados`, `espacios`, `campos-personalizados`, usuarios/equipos).
- [ ] Indices DB basados en consultas lentas reales medidas en VPS.
- [ ] Optimizar imagenes privadas donde sea seguro reemplazar `<img>` por `next/image` o endpoint optimizado.

## Seguridad sin Tocar Credenciales

- [ ] Actualizar dependencias vulnerables (`xlsx`, `jspdf` y otras segun `npm audit`) con pruebas de exportaciones.
- [ ] Endurecer uploads de chat, actas e instructivos: MIME, tamaño, extension, nombres y carpetas.
- [ ] Sanitizacion avanzada de comentarios, nombres de archivo y textos renderizados.
- [ ] CSP en modo report-only antes de bloquear recursos.
- [ ] Monitoreo de eventos sospechosos: login fallido, 403/429, uploads rechazados y errores repetidos.
- [ ] Backup automatico con retencion usando el script existente.
- [ ] Prueba de restauracion de backup en entorno aislado.

## Fase Separada Sensible

No aplicar dentro de las tandas operativas actuales.

- [ ] Eliminar credenciales en texto plano (`passwordPlain`).
- [ ] Cambiar recuperacion/consulta de claves de tecnicos.
- [ ] Resetear contraseñas o forzar rotacion.
- [ ] Cambiar flujo de login de tecnicos.
- [ ] Endurecer sesiones/cookies si puede afectar moviles o sesiones largas.
- [ ] Revisar matriz de permisos por rol/espacio con impacto en visibilidad de datos.

## Sugerencias para Agregar

- [ ] Vista de mapa de trabajo diario con filtros por tecnico/equipo y tareas sin GPS.
- [ ] Cola de revision para datos incompletos: sin estado, sin equipo, sin GPS, sin espacio, CUE duplicado.
- [ ] Notificaciones internas por reglas: tarea vencida, stock bajo, chat sin respuesta, backup viejo.
- [ ] Exportacion de reportes filtrados desde Cronograma respetando los filtros server-side.
- [ ] Panel de calidad de datos por espacio/provincia/equipo.
- [ ] Modo auditoria read-only con acceso temporal y trazabilidad.
- [ ] Resumen ejecutivo semanal para administradores.
- [ ] Pruebas automatizadas de humo para rutas criticas antes de deploy.
- [ ] Dashboard de importaciones por origen: ClickUp, Excel, scripts manuales.
- [ ] Diccionario de campos personalizados para explicar origen y uso de cada columna.

## Orden Recomendado Actual

1. Completar filtros server-side en tareas por espacio.
2. Agregar historial visual por predio.
3. Crear centro de importaciones en modo lectura/reporte.
4. Implementar modo supervisor por equipo.
5. Agregar stock minimo y alertas.
6. Avanzar con seguridad sin credenciales: dependencias, uploads, sanitizacion y CSP report-only.
7. Ejecutar fase separada sensible solo con backup, comunicacion y ventana de prueba.
