/**
 * Campos personalizados del predio que el TECNICO puede completar desde el campo.
 *
 * Viven dentro del JSON `Predio.camposExtra` (no son columnas de la tabla), pero a
 * diferencia del resto de los campos personalizados —que solo edita un admin— estos
 * los carga el propio tecnico, asi que hay una lista blanca y una validacion de
 * valores en `PATCH /api/tareas/[id]`.
 *
 * Se centralizan aca porque los usan tres lugares que se tienen que mantener de
 * acuerdo: la validacion de la API, el badge de la lista y el reporte de facturacion.
 */

/** "¿El predio tiene mas de 20 AP?" — SI / NO. */
export const CAMPO_MAS_20_AP = "tieneMas20Ap";

/**
 * "Recablear": cuantos puntos recableo el tecnico en la visita (1 a 5).
 * Lo setea el tecnico segun lo que efectivamente hizo y se factura por eso.
 */
export const CAMPO_RECABLEAR = "recablear";
export const OPCIONES_RECABLEAR = ["1", "2", "3", "4", "5"] as const;

/** Claves de `camposExtra` que puede tocar un tecnico. El resto sigue siendo solo-admin. */
export const CAMPOS_EXTRA_TECNICO = [CAMPO_MAS_20_AP, CAMPO_RECABLEAR] as const;

/** SI / NO / vacio. Cualquier otra cosa se guarda como null. */
export function normalizarMas20Ap(valor: unknown): "SI" | "NO" | null {
  const v = String(valor ?? "").trim().toUpperCase();
  return v === "SI" || v === "NO" ? v : null;
}

/** "1".."5" o null. Acepta numero o texto; descarta cualquier otro valor. */
export function normalizarRecablear(valor: unknown): string | null {
  const v = String(valor ?? "").trim();
  return (OPCIONES_RECABLEAR as readonly string[]).includes(v) ? v : null;
}

/** true si el valor recibido es aceptable para esa clave (se usa al validar el PATCH). */
export function valorValidoParaCampo(clave: string, valor: unknown): boolean {
  if (valor === null || valor === "") return true; // borrar siempre se permite
  if (clave === CAMPO_MAS_20_AP) return normalizarMas20Ap(valor) !== null;
  if (clave === CAMPO_RECABLEAR) return normalizarRecablear(valor) !== null;
  return false;
}

/** Normaliza el valor de una clave de tecnico antes de guardarla. */
export function normalizarCampoTecnico(clave: string, valor: unknown): unknown {
  if (clave === CAMPO_MAS_20_AP) return normalizarMas20Ap(valor);
  if (clave === CAMPO_RECABLEAR) return normalizarRecablear(valor);
  return valor;
}
