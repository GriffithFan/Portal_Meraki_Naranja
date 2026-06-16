/**
 * Helper de carga para la UI: hace fetch con cookies, valida la respuesta y
 * devuelve el JSON tipado. Si falla, lanza un Error con el mensaje del backend
 * (`{ error }`) para poder mostrarlo en un toast / estado de "Reintentar".
 *
 * Pensado para cargas y guardados de la interfaz (donde el usuario debe enterarse
 * si algo falla). NO usar para llamadas fire-and-forget (logs de auditoría, etc.),
 * que deben seguir silenciosas.
 *
 * Ejemplo:
 *   try {
 *     const data = await fetchJson<{ predios: Tarea[] }>("/api/tareas");
 *   } catch (e) {
 *     toast.error(mensajeError(e, "No se pudieron cargar las tareas"));
 *   }
 */
export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "include", ...init });
  } catch {
    // Error de red / sin conexión
    throw new Error("Sin conexión. Revisá tu red e intentá de nuevo.");
  }

  if (!res.ok) {
    let mensaje = `Error ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) mensaje = String(data.error);
    } catch {
      /* la respuesta de error no era JSON; se usa el mensaje por defecto */
    }
    throw new Error(mensaje);
  }

  // Algunas respuestas (204) no traen cuerpo.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Extrae un mensaje legible de un error desconocido, con un texto por defecto. */
export function mensajeError(error: unknown, fallback = "Ocurrió un error"): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}
