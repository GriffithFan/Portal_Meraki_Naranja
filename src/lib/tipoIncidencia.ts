/**
 * "Tipo de Incidencia" viene de Salesforce (lo trae el enriquecimiento). Lo normal
 * es "Mantenimiento / Reparacion"; cualquier otro (ej. "Reingeniería Red Local")
 * es una tarea especial que se marca con un badge en la tarea/predio.
 */
export const TIPO_INCIDENCIA_NORMAL = "Mantenimiento / Reparacion";

function normalizar(t?: string | null): string {
  return (t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, ""); // sin espacios: tolera "A / B" vs "A/B"
}

/** true si el predio tiene un tipo de incidencia NO estándar (tarea especial). */
export function esTipoIncidenciaEspecial(tipo?: string | null): boolean {
  const n = normalizar(tipo);
  if (!n) return false; // sin dato → no se marca
  return n !== normalizar(TIPO_INCIDENCIA_NORMAL);
}
