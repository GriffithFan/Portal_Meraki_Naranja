"use client";

import { useEffect } from "react";

/**
 * Recarga la página una sola vez cuando el navegador pide un chunk que ya no existe.
 *
 * Pasa después de cada deploy: el usuario tiene Carrot abierto con los hashes de la
 * versión vieja, navega a una sección que todavía no cargó, y ese archivo ya no está.
 * El síntoma es "Loading chunk N failed" y una pantalla rota hasta que hace Ctrl+Shift+R
 * — que nadie sabe que tiene que hacer, así que simplemente piensa que Carrot se rompió.
 * Fue el error de cliente más registrado.
 *
 * El build atómico de update.sh achica la ventana, pero no la elimina: si alguien dejó
 * la pestaña abierta desde ayer, sus chunks igual desaparecieron. Esto lo resuelve del
 * lado del navegador.
 *
 * Una sola vez, marcado en sessionStorage: si después de recargar el error persiste, es
 * otra cosa y recargar en loop solo lo empeora.
 */

const MARCA = "carrot:recarga-por-chunk";

function esErrorDeChunk(mensaje: string): boolean {
  return /Loading chunk .* failed|ChunkLoadError|Loading CSS chunk|Failed to fetch dynamically imported module/i.test(mensaje);
}

function recargarUnaVez() {
  try {
    if (sessionStorage.getItem(MARCA)) return; // ya se intento: no insistir
    sessionStorage.setItem(MARCA, String(Date.now()));
  } catch {
    // Sin sessionStorage (modo privado, cookies bloqueadas) se recarga igual: es
    // preferible una recarga de mas a dejar al tecnico con la pantalla rota.
  }
  window.location.reload();
}

export default function RecargarSiChunkViejo() {
  useEffect(() => {
    // Si la sesion arranco bien, se limpia la marca para que el proximo deploy
    // pueda volver a recargar.
    const limpiar = setTimeout(() => {
      try { sessionStorage.removeItem(MARCA); } catch { /* ignore */ }
    }, 10000);

    const onError = (e: ErrorEvent) => {
      if (esErrorDeChunk(e.message || "")) recargarUnaVez();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = typeof e.reason === "string" ? e.reason : (e.reason?.message || "");
      if (esErrorDeChunk(msg)) recargarUnaVez();
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      clearTimeout(limpiar);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
