/**
 * Estado de un predio respecto a la VENTANA de su cronograma (DESDE–HASTA, ~14 días).
 * Regla nueva: solo se visita DENTRO de la ventana; ni antes (futuro) ni después
 * (vencido → cronograma nuevo, 15 días). "Por vencer" = quedan pocos días a HASTA
 * (prioridad máxima para no perderlo).
 */
export type VentanaEstado = "sin_fechas" | "futuro" | "en_ventana" | "por_vencer" | "vencido";

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
