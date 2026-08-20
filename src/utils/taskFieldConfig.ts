type TaskFieldLike = {
  id?: unknown;
  field?: unknown;
  label?: unknown;
  nombre?: unknown;
};

function normalized(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function isLegacyEquipoField(field: TaskFieldLike | null | undefined) {
  if (!field || typeof field !== "object") return false;
  const id = normalized(field.id);
  const fieldName = normalized(field.field);
  const label = normalized(field.label || field.nombre);
  return id === "equipoasignado" || fieldName === "equipoasignado" || label === "equipo";
}

export function sanitizeTaskFieldConfigs<T extends TaskFieldLike>(fields: T[] | null | undefined): T[] {
  if (!Array.isArray(fields)) return [];
  return fields.filter((field) => !isLegacyEquipoField(field));
}

export function hasTaskFieldConfig<T extends TaskFieldLike>(fields: T[] | null | undefined) {
  return sanitizeTaskFieldConfigs(fields).length > 0;
}

const TASK_GROUP_BY_VALUES = new Set(["estado", "provincia", "asignados", "lacR", "ambito", "ciudad"]);
const TASK_QUICK_FILTER_VALUES = new Set(["todos", "hoy", "vencidas", "sin-gps", "sin-estado", "sin-espacio", "sin-asignar"]);

export function normalizeTaskGroupBy(value: unknown) {
  const rawValue = String(value || "estado").trim();
  const normalizedValue = normalized(rawValue);
  if (normalizedValue === "equipo" || normalizedValue === "equipos" || normalizedValue === "equipoasignado") return "asignados";
  return TASK_GROUP_BY_VALUES.has(rawValue) ? rawValue : "estado";
}

export function normalizeTaskQuickFilter(value: unknown) {
  const rawValue = String(value || "todos").trim();
  const normalizedValue = normalized(rawValue);
  if (normalizedValue === "sinequipo" || normalizedValue === "sin-equipo" || normalizedValue === "equipo" || normalizedValue === "equipos") return "todos";
  return TASK_QUICK_FILTER_VALUES.has(rawValue) ? rawValue : "todos";
}

/**
 * Columnas que el servidor sabe ordenar (ORDER BY en SQL). Lo comparten la API y
 * las pantallas de tareas para no desincronizarse: si el front manda un sortBy
 * que la API no reconoce, la lista volveria al orden por defecto sin avisar.
 *
 * Ordenar SIEMPRE es server-side sobre el total de filas que matchean el filtro,
 * no sobre las que ya estan cargadas en pantalla.
 */
export const SORTABLE_PREDIO_FIELDS = new Set([
  "codigo", "incidencias", "lacR", "cue", "ambito", "provincia", "ciudad",
  "cuePredio", "tipoRed", "codigoPostal", "lab", "nombreInstitucion", "correo",
  "orden", "nombre", "fechaDesde", "fechaHasta", "fechaActualizacion",
  "updatedAt", "gpsPredio", "caracteristicaTelefonica", "telefono",
  "latitud", "longitud",
]);

/** Columnas que se ordenan por una relacion o un agregado (no por un campo de Predio). */
export const SORTABLE_RELATION_FIELDS = new Set([
  "asignaciones", "etiquetas", "comentarios", "estado", "prioridad",
]);

/** true si esta columna la puede ordenar el servidor. */
export function isServerSortable(field: string | null | undefined) {
  if (!field) return false;
  return SORTABLE_PREDIO_FIELDS.has(field) || SORTABLE_RELATION_FIELDS.has(field);
}
