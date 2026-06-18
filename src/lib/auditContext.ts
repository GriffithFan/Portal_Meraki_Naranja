import { AsyncLocalStorage } from "async_hooks";

/**
 * Contexto de auditoría por request: guarda quién está ejecutando la operación
 * para que el interceptor de Prisma (src/lib/prisma.ts) pueda atribuir cada
 * modificación a un usuario. Se setea en getSession() (que se llama al inicio de
 * casi todas las rutas) y se lee en el interceptor.
 *
 * Solo corre en Node (rutas API), no en el edge/middleware.
 */
export interface AuditActor {
  userId: string;
  nombre?: string;
  rol?: string;
}

const storage = new AsyncLocalStorage<AuditActor>();

/** Fija el actor para el resto del request actual. */
export function setAuditActor(actor: AuditActor) {
  try {
    storage.enterWith(actor);
  } catch {
    /* enterWith no disponible: el interceptor simplemente no atribuirá actor */
  }
}

/** Devuelve el actor del request actual (o undefined si no hay sesión). */
export function getAuditActor(): AuditActor | undefined {
  return storage.getStore();
}
