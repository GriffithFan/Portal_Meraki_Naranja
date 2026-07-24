import { EventEmitter } from "events";

/**
 * Bus de eventos en proceso para notificar cambios del chat en tiempo real (SSE).
 * Es válido porque la app corre en UNA sola instancia PM2 (fork mode): todas las
 * rutas comparten el mismo proceso Node y, por ende, el mismo EventEmitter.
 *
 * Si algún día se escala a varias instancias/PM2 cluster, habría que reemplazar
 * este bus por un pub/sub externo (Redis, Postgres LISTEN/NOTIFY, etc.).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const g = globalThis as unknown as { __chatBus?: EventEmitter };
const bus = g.__chatBus || (g.__chatBus = new EventEmitter());
// Un listener por conexión SSE abierta; sin tope para no ver warnings con muchos chats.
bus.setMaxListeners(0);

function canal(conversacionId: string) {
  return `chat:${conversacionId}`;
}

/** Notifica un cambio (mensaje nuevo, edición, borrado o reacción) en una conversación. */
export function publicarCambioChat(conversacionId: string, meta?: Record<string, unknown>) {
  try {
    bus.emit(canal(conversacionId), { conversacionId, at: Date.now(), ...(meta || {}) });
  } catch { /* nunca debe romper el flujo que lo llama */ }
}

/** Suscribe un callback a los cambios de una conversación. Devuelve la función para desuscribir. */
export function suscribirChat(conversacionId: string, cb: (data: any) => void): () => void {
  const c = canal(conversacionId);
  bus.on(c, cb);
  return () => { bus.off(c, cb); };
}
