/**
 * Orden de la bandeja de Mesa de Ayuda.
 *
 * Antes la lista se ordenaba por última actividad. Con muchos técnicos escribiendo a la vez,
 * y en partes, cada mensaje nuevo subía su conversación arriba de todo: el que esperaba hacía
 * diez minutos quedaba enterrado debajo de los que seguían mandando partes, y se perdía.
 *
 * Ahora es una cola:
 *  1. **Sin tomar** — nadie de Mesa la agarró todavía.
 *  2. **Esperando respuesta** — el último mensaje es del técnico.
 *  3. **Respondidas** — el último mensaje es de Mesa; le toca al técnico.
 *  4. **Cerradas**.
 *
 * En las dos primeras manda quién espera hace más, contando desde el PRIMER mensaje sin
 * responder. Así, que el técnico mande otra parte no cambia su lugar en la cola: sigue
 * esperando desde el mismo momento.
 */

export type GrupoBandeja = "sin-tomar" | "esperando" | "respondidas" | "cerradas";

export const GRUPOS_BANDEJA: { grupo: GrupoBandeja; titulo: string }[] = [
  { grupo: "sin-tomar", titulo: "Sin tomar" },
  { grupo: "esperando", titulo: "Esperando respuesta" },
  { grupo: "respondidas", titulo: "Respondidas" },
  { grupo: "cerradas", titulo: "Cerradas" },
];

export type ConversacionBandeja = {
  estado: string;
  agenteId?: string | null;
  updatedAt: string | Date;
  /** Primer mensaje del técnico que todavía no tiene respuesta de Mesa (null si no hay). */
  esperandoDesde?: string | Date | null;
  /** Cuántos mensajes del técnico hay desde la última respuesta de Mesa. */
  pendientes?: number;
};

const t = (f: string | Date | null | undefined) => (f ? new Date(f).getTime() : NaN);

export function grupoBandeja(c: ConversacionBandeja): GrupoBandeja {
  if (c.estado === "CERRADA") return "cerradas";
  if (c.estado === "ABIERTA" && !c.agenteId) return "sin-tomar";
  return (c.pendientes ?? 0) > 0 ? "esperando" : "respondidas";
}

const RANGO: Record<GrupoBandeja, number> = { "sin-tomar": 0, esperando: 1, respondidas: 2, cerradas: 3 };

/** Ordena sin modificar el arreglo original. */
export function ordenarBandeja<T extends ConversacionBandeja>(convs: T[]): T[] {
  return [...convs].sort((a, b) => {
    const ga = grupoBandeja(a);
    const gb = grupoBandeja(b);
    if (ga !== gb) return RANGO[ga] - RANGO[gb];
    if (ga === "sin-tomar" || ga === "esperando") {
      // Quien espera hace más, primero. Sin dato de espera, por actividad (la más vieja arriba).
      const ea = t(a.esperandoDesde) || t(a.updatedAt);
      const eb = t(b.esperandoDesde) || t(b.updatedAt);
      return ea - eb;
    }
    return t(b.updatedAt) - t(a.updatedAt);
  });
}

export type NivelEspera = "reciente" | "atencion" | "urgente";

/** Verde hasta 5 minutos, ámbar hasta 15, rojo después. */
export function nivelEspera(desde: string | Date | null | undefined, ahora: number = Date.now()): NivelEspera | null {
  const inicio = t(desde);
  if (Number.isNaN(inicio)) return null;
  const minutos = (ahora - inicio) / 60000;
  return minutos < 5 ? "reciente" : minutos < 15 ? "atencion" : "urgente";
}

/** "ahora", "3 min", "1 h 20 min" */
export function duracionCorta(desde: string | Date | null | undefined, ahora: number = Date.now()): string {
  const inicio = t(desde);
  if (Number.isNaN(inicio)) return "";
  const minutos = Math.max(0, Math.floor((ahora - inicio) / 60000));
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}
