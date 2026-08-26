/**
 * Ventana en la que se registra la ubicación de los técnicos.
 *
 * Regla: **lunes a viernes, de 07:00 a 20:00 ART**. Fuera de eso no se guarda nada.
 *
 * Por qué: la ubicación de una persona es dato personal, y lo que justifica guardarla
 * es la operación del día de trabajo. Registrar de noche o un domingo no aporta nada
 * operativo y convierte una herramienta de coordinación en seguimiento personal — que
 * además es la forma más rápida de que el equipo revoque el permiso y el mapa quede vacío.
 *
 * Se valida en el SERVIDOR además del cliente: el cliente puede tener mal la hora, o
 * alguien puede llamar al endpoint a mano. La fuente de verdad es esta función.
 */

/** Argentina es UTC-3 todo el año (no tiene horario de verano). */
const ART_OFFSET_MS = 3 * 60 * 60 * 1000;

export const HORA_DESDE = 7;   // 07:00 ART
export const HORA_HASTA = 20;  // 20:00 ART (a las 20:00 en punto ya no se registra)

export interface EstadoHorario {
  dentro: boolean;
  /** Motivo legible, para devolverlo en la respuesta y poder auditar la decisión. */
  motivo: string;
  /** Día y hora en ART al momento de evaluar. */
  art: string;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** ¿Estamos dentro de la ventana laboral en la que se registra ubicación? */
export function dentroDeHorarioLaboral(ahora: Date = new Date()): EstadoHorario {
  const art = new Date(ahora.getTime() - ART_OFFSET_MS);
  const dia = art.getUTCDay();   // 0 domingo … 6 sábado
  const hora = art.getUTCHours();
  const sello = `${DIAS[dia]} ${String(hora).padStart(2, "0")}:${String(art.getUTCMinutes()).padStart(2, "0")} ART`;

  if (dia === 0 || dia === 6) {
    return { dentro: false, motivo: "Fuera de la jornada: la ubicación solo se registra de lunes a viernes.", art: sello };
  }
  if (hora < HORA_DESDE || hora >= HORA_HASTA) {
    return {
      dentro: false,
      motivo: `Fuera de la jornada: la ubicación solo se registra de ${HORA_DESDE}:00 a ${HORA_HASTA}:00 ART.`,
      art: sello,
    };
  }
  return { dentro: true, motivo: "", art: sello };
}

/** Texto corto para mostrarle al técnico qué ventana se registra. */
export const VENTANA_LEGIBLE = `lunes a viernes de ${HORA_DESDE}:00 a ${HORA_HASTA}:00`;

/**
 * Version del aviso de consentimiento. Si cambia el TEXTO del aviso hay que subirla:
 * quien acepto la version anterior vuelve a verlo, porque acepto otra cosa.
 *
 * Vive aca y no en el route porque un route de Next solo puede exportar handlers.
 */
export const VERSION_AVISO = "2026-08-v1";
