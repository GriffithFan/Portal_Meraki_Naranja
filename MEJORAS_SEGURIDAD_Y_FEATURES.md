# Checklist de Mejoras: Seguridad, Performance y Funcionalidades

Fecha inicial: 2026-04-27
Ultima actualizacion: 2026-04-29

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
- [x] Filtros server-side en tareas por espacio por estado, provincia, equipo, prioridad y filtros rapidos propios del espacio.
- [x] Historial visual por predio en el modal de detalle: comentarios, cambios y archivos/actas en una linea de tiempo.
- [x] Centro de importaciones en modo lectura/reporte con historial, resumen, errores y duplicados registrados.
- [x] Modo supervisor por equipo en lectura: carga, vencidas, tareas de hoy, alertas y avance por tecnico/equipo.
- [x] Stock minimo y alertas en lectura: faltantes por tipo, no operativos, sin numero de serie y distribucion por asignacion.
- [x] Busqueda global inicial en el header: resultados combinados de tareas/predios y stock con navegacion directa.
- [x] Busqueda global ampliada a chats, actas e instructivos con navegacion filtrada.
- [x] Reporte operativo diario/semanal por bandeja interna: endpoint cron `/api/cron/reportes?tipo=diario|semanal` con deduplicacion por periodo.
- [x] Script seguro de ejecucion de reportes cron: `scripts/run-reportes-cron.sh` lee `CRON_SECRET` desde `.env` sin guardarlo en crontab.
- [x] Reportes programados en VPS: diario 11:00 UTC y semanal lunes 11:30 UTC, con log en `/var/www/carrot/logs/reportes-cron.log`.
- [x] Panel operativo ampliado con checks HTTP, detalle PM2, crontab relevante y log de reportes/backups.

## En Progreso / Pendiente no Sensible

- [ ] Paginacion avanzada de tareas: conteos globales por estado/grupo calculados en servidor, no solo sobre lo cargado.
- [ ] Filtros guardados por usuario en Cronograma.
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

1. Separar graficos pesados de `/dashboard/kpis` en chunks dinamicos.
2. Avanzar con seguridad sin credenciales: dependencias, uploads, sanitizacion y CSP report-only.
3. Ejecutar fase separada sensible solo con backup, comunicacion y ventana de prueba.
