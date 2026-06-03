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