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
 * El mismo tramo de la semana PASADA que lleva transcurrido la actual: desde su inicio
 * hasta exactamente una semana antes de `now`.
 *
 * Es contra lo que hay que comparar una semana en curso. Compararla con la semana pasada
 * completa la hace ver siempre peor (un martes nunca alcanza a un viernes), y comparar las
 * dos últimas semanas cerradas —lo que se mostraba antes— habla de otra cosa: el martes
 * 15/09/2026 decía "▲21 vs semana previa" (W36 contra W35) cuando W37 iba 48 contra 52.
 */
export function mismoMomentoSemanaPrevia(now = new Date()): { desde: Date; hasta: Date } {
  const desde = new Date(inicioSemana(now).getTime() - SEMANA_MS);
  return { desde, hasta: new Date(now.getTime() - SEMANA_MS) };
}

/** "YYYY-MM-DD" del día calendario argentino (UTC-3) que contiene `d`. */
export function fechaAR(d: Date): string {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Los 7 días calendario (sábado a viernes, "YYYY-MM-DD" en hora argentina) de la semana
 * de negocio que contiene el día `fecha`. Se toma el mediodía del día para ubicarlo: así
 * un sábado cae en la semana que empieza ese sábado y no en la anterior.
 */
export function diasDeSemanaAR(fecha: string): string[] {
  const [y, m, d] = fecha.split("-").map(Number);
  const mediodia = new Date(Date.UTC(y, m - 1, d, 15, 0, 0)); // 12:00 ART
  const sabado = inicioSemana(mediodia);
  return Array.from({ length: 7 }, (_, i) => fechaAR(new Date(sabado.getTime() + i * 24 * 60 * 60 * 1000)));
}

/** Día de la semana (Dom=0 … Sáb=6) de un "YYYY-MM-DD". */
function diaDeSemana(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Suma `n` días calendario a un "YYYY-MM-DD". */
export function sumarDiasFecha(fecha: string, n: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * Sábados y domingos no se trabaja ni se audita, así que la vista diaria no los muestra:
 * un sábado o domingo se lleva al viernes anterior.
 */
export function ultimoDiaHabilAR(fecha: string): string {
  const dow = diaDeSemana(fecha);
  return dow === 6 ? sumarDiasFecha(fecha, -1) : dow === 0 ? sumarDiasFecha(fecha, -2) : fecha;
}

/** Avanza (n > 0) o retrocede (n < 0) `n` días hábiles, salteando sábados y domingos. */
export function sumarDiasHabiles(fecha: string, n: number): string {
  let actual = ultimoDiaHabilAR(fecha);
  const paso = n > 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(n); i++) {
    do actual = sumarDiasFecha(actual, paso);
    while (diaDeSemana(actual) === 0 || diaDeSemana(actual) === 6);
  }
  return actual;
}

/** Lunes a viernes de la semana de negocio que contiene el día hábil `fecha`. */
export function diasHabilesDeSemanaAR(fecha: string): string[] {
  return diasDeSemanaAR(ultimoDiaHabilAR(fecha)).slice(2);
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
