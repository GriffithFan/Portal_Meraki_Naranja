/**
 * Store en memoria de "escribiendo…" para el chat.
 *
 * El portal corre en un único proceso PM2 (fork, 1 instancia), por lo que un
 * Map a nivel de módulo es suficiente y evita escribir en la base por cada
 * tecla. Se guarda en globalThis para sobrevivir al HMR en desarrollo.
 *
 * Estructura: conversacionId -> (userId -> timestamp del último "estoy escribiendo").
 * Una entrada se considera activa si el último ping fue hace menos de TYPING_TTL_MS.
 */

const TYPING_TTL_MS = 7000;

type TypingStore = Map<string, Map<string, number>>;

const globalForTyping = globalThis as unknown as { __chatTypingStore?: TypingStore };
const store: TypingStore = globalForTyping.__chatTypingStore ?? new Map();
if (!globalForTyping.__chatTypingStore) globalForTyping.__chatTypingStore = store;

/** Registra que `userId` está escribiendo en `conversacionId` (ahora). */
export function markTyping(conversacionId: string, userId: string) {
  let conv = store.get(conversacionId);
  if (!conv) {
    conv = new Map();
    store.set(conversacionId, conv);
  }
  conv.set(userId, Date.now());
}

/** Quita el estado "escribiendo" de un usuario (p. ej. al enviar el mensaje). */
export function clearTyping(conversacionId: string, userId: string) {
  const conv = store.get(conversacionId);
  if (!conv) return;
  conv.delete(userId);
  if (conv.size === 0) store.delete(conversacionId);
}

/**
 * Devuelve true si alguien distinto de `excludeUserId` está escribiendo en la
 * conversación dentro de la ventana TTL. De paso limpia entradas vencidas.
 */
export function isSomeoneTyping(conversacionId: string, excludeUserId: string): boolean {
  const conv = store.get(conversacionId);
  if (!conv) return false;
  const now = Date.now();
  let activo = false;
  Array.from(conv.entries()).forEach(([userId, ts]) => {
    if (now - ts > TYPING_TTL_MS) {
      conv.delete(userId);
      return;
    }
    if (userId !== excludeUserId) activo = true;
  });
  if (conv.size === 0) store.delete(conversacionId);
  return activo;
}
