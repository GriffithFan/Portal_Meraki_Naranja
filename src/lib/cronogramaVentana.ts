/**
 * Estado de un predio respecto a la VENTANA de su cronograma (DESDE–HASTA, ~14 días).
 * Regla nueva: solo se visita DENTRO de la ventana; ni antes (futuro) ni después
 * (vencido → cronograma nuevo, 15 días). "Por vencer" = quedan pocos días a HASTA
 * (prioridad máxima para no perderlo).
 */
export type VentanaEstado = "sin_fechas" | "futuro" | "en_ventana" | "por_vencer" | "vencido";

/** Órdenes de trabajo con las que el cronograma todavía sirve para ir al predio. */
const ORDENES_VIGENTES = new Set(["planificada", "lanzada"]);

/**
 * ¿La ventana futura de este predio corresponde a un cronograma que sigue en pie?
 *
 * Importa para el cartel "PRONTO": ese cartel dice "no lo pidas de nuevo, ya tiene
 * fecha", y con el cronograma cerrado eso es falso — la fecha quedó ahí pero el
 * cronograma no sirve, así que el predio SÍ hay que volver a pedirlo.
 *
 * Se aplica la misma regla de oro que el LAC-R: la Orden de Trabajo manda sobre el
 * tilde de "activo", porque Salesforce deja el tilde puesto después de finalizar.
 *
 * Devuelve `null` cuando no hay datos (predio sin enriquecer): ante la duda no se
 * cambia lo que se venía mostrando.
 */
export function cronogramaSigueAbierto(camposExtra: unknown): boolean | null {
  if (!camposExtra || typeof camposExtra !== "object") return null;
  const ce = camposExtra as Record<string, unknown>;
  const activo = String(ce.cronograma_activo ?? "").trim().toUpperCase();
  const orden = String(ce.cronograma_orden ?? "").trim().toLowerCase();
  if (!activo && !orden) return null;
  if (activo === "NO") return false;
  if (orden) return ORDENES_VIGENTES.has(orden);
  return null;               // activo SI pero sin orden legible: no se decide
}

export const VENTANA_META: Record<VentanaEstado, { label: string; corto: string }> = {
  sin_fechas: { label: "Sin fechas", corto: "Sin fechas" },
  futuro:     { label: "Futuro (aún no abre)", corto: "Futuro" },
  en_ventana: { label: "En ventana", corto: "En ventana" },
  por_vencer: { label: "Por vencer", corto: "Por vencer" },
  vencido:    { label: "Vencido", corto: "Vencido" },
};

// Días (contando por fecha, sin hora) entre dos fechas: b - a.
function diasEntre(a: Date, b: Date): number {
  const dia = 86400000;
  const ax = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bx = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bx - ax) / dia);
}

export interface VentanaInfo {
  estado: VentanaEstado;
  diasRestantes: number | null; // a HASTA (si en ventana / por vencer)
  diasParaAbrir: number | null; // a DESDE (si futuro)
}

/**
 * @param umbralPorVencer días o menos hasta HASTA para marcar "por vencer" (default 3).
 */
export function estadoVentana(
  desde: Date | string | null | undefined,
  hasta: Date | string | null | undefined,
  hoy: Date = new Date(),
  umbralPorVencer = 3
): VentanaInfo {
  const d = desde ? new Date(desde) : null;
  const h = hasta ? new Date(hasta) : null;
  if (!d || !h || isNaN(d.getTime()) || isNaN(h.getTime())) {
    return { estado: "sin_fechas", diasRestantes: null, diasParaAbrir: null };
  }
  const aDesde = diasEntre(hoy, d); // >0 si DESDE está en el futuro
  const aHasta = diasEntre(hoy, h); // >=0 si HASTA es hoy o después
  if (aDesde > 0) return { estado: "futuro", diasRestantes: null, diasParaAbrir: aDesde };
  if (aHasta < 0) return { estado: "vencido", diasRestantes: aHasta, diasParaAbrir: null };
  const estado: VentanaEstado = aHasta <= umbralPorVencer ? "por_vencer" : "en_ventana";
  return { estado, diasRestantes: aHasta, diasParaAbrir: null };
}

/** El próximo día hábil (lun-vie) a partir de hoy: vie→lun, sáb→lun, dom→lun, resto→mañana. */
export function proximoDiaHabil(hoy: Date = new Date()): Date {
  const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  const dow = d.getUTCDay(); // 0=Dom … 6=Sáb
  const add = dow === 5 ? 3 : dow === 6 ? 2 : 1; // vie→lun, sáb→lun, dom/lun-jue→+1
  d.setUTCDate(d.getUTCDate() + add);
  return d;
}

/**
 * True si el cronograma arranca a más tardar el próximo día hábil (a fines prácticos
 * "arranca ya": ej. hoy viernes y DESDE es el lunes → arrancaría el lunes igual).
 * Sirve para marcar LAC-R SI a cronogramas futuros inminentes.
 */
export function arrancaProximoDiaHabil(
  desde: Date | string | null | undefined,
  hoy: Date = new Date()
): boolean {
  const d = desde ? new Date(desde) : null;
  if (!d || isNaN(d.getTime())) return false;
  return diasEntre(d, proximoDiaHabil(hoy)) >= 0; // proximoDiaHabil - d >= 0  ⇔  d <= proximoDiaHabil
}
