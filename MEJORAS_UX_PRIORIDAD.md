# Mejoras UX y Calidad - Prioridad Actual

## Fuera de esta tanda
- Personalizacion de la pagina principal al iniciar: queda diferida para definir luego por rol, usuario o preferencia.

## Prioridad alta
1. Vistas guardadas en Tareas y Stock: filtros, columnas, orden y agrupacion reutilizables.
2. Virtualizacion real en tablas pesadas: Tareas, espacios de trabajo y Stock con `react-virtuoso`.
3. Feedback consistente: reemplazar `alert`/`confirm` por toasts y dialogos propios.
4. Importacion mas clara: prevalidacion visual, conflictos, duplicados, omitidos y resumen antes de ejecutar.
5. Command palette accionable: no solo navegar, tambien crear, buscar, abrir flujos frecuentes y aplicar vistas.

## Prioridad media
6. Busqueda global con acciones: abrir detalle, copiar codigo, ir al espacio, descargar acta o abrir chat.
7. Edicion inline con estados por celda/fila: guardando, guardado, error y reintentar.
8. Panel lateral persistente de detalle para revisar tareas/stock sin perder contexto.
9. Notificaciones accionables: tomar chat, abrir tarea, marcar resuelto, ver stock o ir al predio.
10. Preferencias por usuario centralizadas: columnas, filtros, ancho de sidebar y vistas por defecto en servidor.

## Calidad percibida
11. Unificar iconografia con `lucide-react` y reducir SVG/emoji aislado en navegacion.
12. Estados vacios utiles: limpiar filtros, crear registro, volver a vista guardada o abrir ayuda contextual.
13. Experiencia movil operativa: mis tareas, chat, mapa, adjuntar evidencia, cambiar estado y comentar.
14. Accesibilidad y teclado: foco, `aria-label`, Escape consistente, navegacion de tablas y atajos simples.

## Primer bloque de aplicacion
- Chat: toasts y dialogos de confirmacion.
- Command palette: acciones frecuentes y mejores iconos.
- Estados vacios: componente reusable para aplicar progresivamente.

## Segundo bloque de aplicacion
- Stock: vistas guardadas por usuario con busqueda, filtros, orden y columnas.
- Stock: reemplazo del ultimo `confirm` nativo por modal integrado para quitar campos.

## Tercer bloque de aplicacion
- Tareas: vistas guardadas por usuario en Cronograma general.
- Espacios: vistas guardadas por usuario y por espacio, incluyendo subcarpetas, filtros, orden y columnas.
- Command palette: busqueda global real dentro de `Ctrl K`, con apertura directa del resultado.
- Importacion: resumen previo con filas, columnas mapeadas, omitidas, campos extra y validacion del campo minimo requerido.
- Tareas: feedback de guardado/error al editar campos inline.
- Bandeja: las notificaciones con enlace ahora abren su destino y se marcan como leidas.

## Cuarto bloque de aplicacion
- Tareas: detalle en panel lateral en escritorio para revisar sin perder la lista de contexto.
- Tareas: dialogos propios para renombrar o quitar campos del detalle, sin `prompt`/`confirm` nativos.
- Stock: formulario de crear/editar equipo convertido a panel lateral en escritorio.
- Stock: virtualizacion real de la tabla desktop con `react-virtuoso`.
- Accesibilidad: semantica `dialog`, `aria-modal` y etiquetas basicas en paneles tocados.

## Pendiente actual
1. Virtualizacion real en tablas complejas de Tareas y espacios, cuidando agrupaciones y seleccion multiple.
2. Preferencias por usuario mas centralizadas: ancho de sidebar, vista por defecto y otros ajustes finos.
3. Experiencia movil operativa profunda para tareas, chat, mapa y evidencia.
4. Accesibilidad y teclado ampliada: foco inicial, navegacion de tablas y atajos simples.
5. Edicion inline avanzada con indicador por celda y reintento local cuando falle la red.
