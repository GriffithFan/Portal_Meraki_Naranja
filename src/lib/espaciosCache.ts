/**
 * Caché compartida del árbol de carpetas.
 *
 * El problema: varios componentes montados en la misma pantalla piden `/api/espacios`
 * cada uno por su cuenta. En `/dashboard/tareas` medimos **tres llamadas idénticas** en
 * una sola carga. No es mucho peso, pero son tres viajes de ida y vuelta contra el
 * servidor antes de que el técnico pueda tocar nada, y en 4G cada viaje se paga.
 *
 * Esto resuelve las dos formas del problema:
 *  - **Simultáneas**: si ya hay un pedido en vuelo, los siguientes esperan ESE pedido
 *    en lugar de abrir uno nuevo.
 *  - **Seguidas**: la respuesta se reusa durante unos segundos.
 *
 * El árbol de carpetas cambia poco —crear o mover una carpeta es una acción manual y
 * rara—, así que unos segundos de desactualización no se notan. Igual, quien crea o
 * borra una carpeta debe llamar a `invalidarEspacios()` para que la próxima lectura
 * traiga lo nuevo.
 */

const TTL_MS = 15_000;

let enVuelo: Promise<unknown> | null = null;
let cache: { data: unknown; expiraEn: number } | null = null;

/** Trae el árbol de carpetas, reusando el pedido en curso o la respuesta reciente. */
export function getEspacios<T = unknown>(): Promise<T> {
  const ahora = Date.now();
  if (cache && cache.expiraEn > ahora) return Promise.resolve(cache.data as T);
  if (enVuelo) return enVuelo as Promise<T>;

  enVuelo = fetch("/api/espacios", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : []))
    .then((data) => {
      cache = { data, expiraEn: Date.now() + TTL_MS };
      return data;
    })
    .catch(() => {
      // Un error no se cachea: la proxima llamada vuelve a intentar.
      return [];
    })
    .finally(() => {
      enVuelo = null;
    });

  return enVuelo as Promise<T>;
}

/** Descarta lo cacheado. Llamar después de crear, mover, renombrar o borrar una carpeta. */
export function invalidarEspacios() {
  cache = null;
}
