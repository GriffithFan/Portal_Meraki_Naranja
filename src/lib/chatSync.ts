/**
 * Sincronización incremental de los mensajes de una conversación (página del chat y widget).
 *
 * Existe por un bucle que trababa el chat. El cliente pedía `?since=<createdAt del último
 * mensaje>` y el servidor devuelve lo que tenga `updatedAt` posterior. Pero editar, borrar o
 * reaccionar a un mensaje le mueve el `updatedAt` SIN crear uno nuevo, así que ese mensaje
 * volvía en cada pedido para siempre. Cada respuesta "con novedades" marcaba la conversación
 * como leída y avisaba por SSE a todos los que la tenían abierta, que volvían a pedir... El
 * 15/09/2026 a las 11:57 fueron 1.173 pedidos en un minuto a una sola conversación, con
 * rechazos 429 de nginx, y el recuento de no leídos de TODAS las pestañas conectadas.
 *
 * Tres reglas lo cortan:
 *  1. El cursor es el `updatedAt` más nuevo (no el `createdAt`): lo que ya llegó no vuelve.
 *  2. Fusionar lo que no cambió devuelve el MISMO arreglo, así React no vuelve a dibujar.
 *  3. Solo se marca como leída (y se avisa) si hay mensajes de otro posteriores a la última
 *     lectura: un pedido que no trae nada nuevo para leer no puede disparar más pedidos.
 */

type FechaIso = string | Date | null | undefined;

export type MensajeSync = {
  id: string;
  createdAt: FechaIso;
  updatedAt?: FechaIso;
  autorId?: string;
};

function ms(fecha: FechaIso): number {
  if (!fecha) return NaN;
  return typeof fecha === "string" ? Date.parse(fecha) : fecha.getTime();
}

/** Desde cuándo pedir novedades: el `updatedAt` más nuevo cargado (o el `createdAt` si falta). */
export function cursorDeMensajes(mensajes: MensajeSync[]): string | null {
  let max = 0;
  for (const m of mensajes) {
    const t = Math.max(ms(m.updatedAt) || 0, ms(m.createdAt) || 0);
    if (t > max) max = t;
  }
  return max > 0 ? new Date(max).toISOString() : null;
}

/**
 * Agrega o reemplaza mensajes por id y los deja en orden de creación. Si ninguno cambió
 * (mismo id y mismo `updatedAt`), devuelve `actuales` tal cual para no provocar un render.
 */
export function fusionarMensajes<T extends MensajeSync>(actuales: T[], nuevos: T[]): T[] {
  if (nuevos.length === 0) return actuales;
  const porId = new Map(actuales.map((m) => [m.id, m]));
  let cambio = false;
  for (const m of nuevos) {
    const previo = porId.get(m.id);
    const igual = previo && previo.updatedAt != null && m.updatedAt != null && ms(previo.updatedAt) === ms(m.updatedAt);
    if (igual) continue;
    porId.set(m.id, m);
    cambio = true;
  }
  if (!cambio) return actuales;
  return Array.from(porId.values()).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
}

/** ¿Hay mensajes de OTRA persona creados después de la última lectura de `userId`? */
export function haySinLeerDeOtro(mensajes: MensajeSync[], userId: string, leidoAt: FechaIso): boolean {
  const corte = ms(leidoAt);
  return mensajes.some((m) => m.autorId !== userId && (Number.isNaN(corte) || ms(m.createdAt) > corte));
}
