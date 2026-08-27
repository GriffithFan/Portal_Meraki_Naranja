/**
 * Caché de lecturas GET compartida entre componentes.
 *
 * El problema: varios componentes montados en la misma pantalla piden lo mismo, cada uno
 * por su cuenta. Medido al abrir una carpeta de tareas: `campos-personalizados` tres
 * veces, `espacios/<id>` dos veces, `/api/espacios` tres veces. Son respuestas chicas,
 * pero cada una es un viaje de ida y vuelta antes de que la pantalla quede usable.
 *
 * Resuelve las dos formas del problema:
 *  - **Simultáneas**: si ya hay un pedido en vuelo para esa URL, los siguientes esperan
 *    ESE en lugar de abrir otro.
 *  - **Seguidas**: la respuesta se reusa unos segundos.
 *
 * Es solo para catálogos que cambian poco (carpetas, campos, estados). Nada que el
 * usuario acabe de modificar debe leerse de acá sin invalidar primero.
 */

const TTL_MS = 15_000;

const enVuelo = new Map<string, Promise<unknown>>();
const cache = new Map<string, { data: unknown; expiraEn: number }>();

/** GET con deduplicación. `url` es también la clave de caché. */
export function getCacheado<T = unknown>(url: string): Promise<T> {
  const ahora = Date.now();
  const guardado = cache.get(url);
  if (guardado && guardado.expiraEn > ahora) return Promise.resolve(guardado.data as T);

  const yaVa = enVuelo.get(url);
  if (yaVa) return yaVa as Promise<T>;

  const p = fetch(url, { credentials: "include" })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      // Un `null` (respuesta con error) NO se cachea: la próxima vuelve a intentar.
      if (data != null) cache.set(url, { data, expiraEn: Date.now() + TTL_MS });
      return data;
    })
    .catch(() => null)
    .finally(() => { enVuelo.delete(url); });

  enVuelo.set(url, p);
  return p as Promise<T>;
}

/** Descarta lo cacheado. Sin argumento, todo; con prefijo, solo lo que empieza así. */
export function invalidarCache(prefijo?: string) {
  if (!prefijo) { cache.clear(); return; }
  for (const clave of Array.from(cache.keys())) {
    if (clave.startsWith(prefijo)) cache.delete(clave);
  }
}
