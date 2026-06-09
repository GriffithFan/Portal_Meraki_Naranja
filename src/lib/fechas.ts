/** Utilidades de fecha para zona horaria Argentina (UTC-3, sin horario de verano). */

export const TZ_OFFSET_MIN = -180; // Argentina = UTC-3

/**
 * Rango [inicio, fin) del día calendario argentino, como instantes UTC.
 * @param fechaStr opcional "YYYY-MM-DD"; si se omite o es inválido, usa el día actual en AR.
 */
export function dayRangeAR(fechaStr?: string | null): { start: Date; end: Date } {
  let y: number, m: number, d: number;
  if (fechaStr && /^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
    [y, m, d] = fechaStr.split("-").map(Number);
  } else {
    const nowAr = new Date(Date.now() + TZ_OFFSET_MIN * 60000);
    y = nowAr.getUTCFullYear();
    m = nowAr.getUTCMonth() + 1;
    d = nowAr.getUTCDate();
  }
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - TZ_OFFSET_MIN * 60000);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start, end };
}
