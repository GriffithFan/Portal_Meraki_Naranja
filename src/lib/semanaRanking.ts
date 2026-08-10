/**
 * Semana de negocio del ranking: va de SÁBADO 06:00 (ART) a VIERNES 17:00 (ART), y
 * así cada semana. Un conforme del sábado a las 6am pertenece a esa nueva semana.
 *
 * El servidor corre en UTC y Argentina es UTC-3 fijo (sin horario de verano), por eso
 * 06:00 ART = 09:00 UTC y 17:00 ART = 20:00 UTC. Todo se calcula con métodos UTC.
 */

const H_INICIO_UTC = 9; // sábado 06:00 ART
const H_FIN_UTC = 20;   // viernes 17:00 ART
export const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

/** Inicio (sábado 09:00 UTC = 06:00 ART) de la semana de negocio que contiene `d`. */
export function inicioSemana(d: Date): Date {
  // getUTCDay: Dom=0 … Sáb=6. "back" = días hasta el sábado anterior/actual.
  const back = (d.getUTCDay() + 1) % 7; // Sáb(6)->0, Dom(0)->1, … Vie(5)->6
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back, H_INICIO_UTC, 0, 0, 0));
  // Si es sábado pero todavía antes de las 06:00 ART, la semana arrancó el sábado previo.
  if (inicio.getTime() > d.getTime()) inicio.setUTCDate(inicio.getUTCDate() - 7);
  return inicio;
}

/**
 * Rango [desde, hasta] de la semana `offset` (0 = actual, 1 = pasada, …).
 * Semana actual: hasta = min(ahora, viernes 17:00 ART). Semanas pasadas: viernes 17:00 ART.
 */
export function semanaRango(now = new Date(), offset = 0): { desde: Date; hasta: Date } {
  const desde = inicioSemana(now);
  desde.setUTCDate(desde.getUTCDate() - offset * 7);
  const finViernes = new Date(desde);
  finViernes.setUTCDate(desde.getUTCDate() + 6); // viernes
  finViernes.setUTCHours(H_FIN_UTC, 0, 0, 0);
  const hasta = offset <= 0
    ? (now.getTime() < finViernes.getTime() ? new Date(now) : finViernes)
    : finViernes;
  return { desde, hasta };
}
