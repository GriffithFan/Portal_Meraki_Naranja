/**
 * Pausa de fin de semana para el enriquecimiento AUTOMÁTICO.
 *
 * Regla: la última corrida de la semana es el **viernes a las 06:00 ART** y la
 * siguiente el **lunes a las 06:00 ART**. En el medio no corre nada.
 *
 * Por qué: el enriquecimiento trae conformidades desde Salesforce. Si corre sábado o
 * domingo, entran conformes del fin de semana que nadie revisó, y quedan contadas en
 * el ranking, el indicador y la facturación sin que el equipo esté al tanto.
 *
 * Vive acá y no solo en el crontab a propósito: el crontab no está en el repo y se
 * pierde si se reconstruye el servidor. Con el guard en el endpoint, aunque el cron
 * dispare igual, la corrida se saltea sola.
 *
 * NO afecta al enriquecimiento manual ("Enriquecer ahora"): si alguien decide correrlo
 * un sábado es una decisión consciente.
 */

/** Argentina es UTC-3 todo el año (no tiene horario de verano). */
const ART_OFFSET_MS = 3 * 60 * 60 * 1000;

export interface EstadoPausa {
  pausado: boolean;
  /** Motivo legible, para el log y la respuesta del cron. */
  motivo: string;
  /** Día y hora en ART al momento de evaluar, para poder auditar la decisión. */
  art: string;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/**
 * ¿Está el enriquecimiento automático en pausa de fin de semana?
 *
 * La ventana se abre el viernes a las 07:00 ART —una hora de gracia después de la
 * corrida de las 06:00, para que un cron demorado no se saltee a sí mismo— y se
 * cierra el lunes a las 06:00 ART.
 */
export function pausaFinDeSemana(ahora: Date = new Date()): EstadoPausa {
  const art = new Date(ahora.getTime() - ART_OFFSET_MS);
  const dia = art.getUTCDay();          // 0 domingo … 6 sábado
  const hora = art.getUTCHours();
  const sello = `${DIAS[dia]} ${String(hora).padStart(2, "0")}:${String(art.getUTCMinutes()).padStart(2, "0")} ART`;

  const esViernesTarde = dia === 5 && hora >= 7;
  const esFinde = dia === 6 || dia === 0;
  const esLunesTemprano = dia === 1 && hora < 6;

  if (esViernesTarde || esFinde || esLunesTemprano) {
    return {
      pausado: true,
      motivo: "Pausa de fin de semana: el enriquecimiento automático corre por última vez "
        + "el viernes a las 06:00 ART y se retoma el lunes a las 06:00 ART, para no incorporar "
        + "conformidades del fin de semana sin revisar.",
      art: sello,
    };
  }
  return { pausado: false, motivo: "", art: sello };
}
