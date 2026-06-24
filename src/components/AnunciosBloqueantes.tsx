"use client";

import { useCallback, useEffect, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Pendiente = {
  id: string;
  titulo: string;
  contenido: string;
  categoria: string;
  createdAt: string;
  autor: { nombre: string } | null;
};

/**
 * Popup bloqueante y persistente para anuncios de importancia "Muy alta".
 * Se monta a nivel del dashboard: consulta los anuncios bloqueantes pendientes
 * del usuario (al entrar, al volver el foco y cada 30s) y muestra un modal que
 * NO puede cerrarse hasta que el usuario acepta cada uno.
 */
export default function AnunciosBloqueantes() {
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [aceptando, setAceptando] = useState(false);
  const activo = pendientes[0] || null;

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/anuncios/pendientes", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setPendientes(Array.isArray(data.anuncios) ? data.anuncios : []);
    } catch {
      /* sin conexión: reintenta en el próximo ciclo */
    }
  }, []);

  useEffect(() => {
    cargar();
    const interval = window.setInterval(cargar, 30000);
    const onVisible = () => { if (!document.hidden) cargar(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", cargar);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", cargar);
    };
  }, [cargar]);

  // Bloquear el scroll del fondo mientras hay un anuncio por aceptar.
  useEffect(() => {
    if (!activo) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [activo]);

  const aceptar = async () => {
    if (!activo || aceptando) return;
    setAceptando(true);
    try {
      const res = await fetch(`/api/anuncios/${activo.id}/aceptar`, { method: "POST", credentials: "include" });
      if (res.ok) {
        setPendientes((prev) => prev.filter((p) => p.id !== activo.id));
      }
    } catch {
      /* reintenta el usuario */
    } finally {
      setAceptando(false);
    }
  };

  if (!activo) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-surface-900/80 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="anuncio-bloqueante-titulo"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border-2 border-red-400 bg-white shadow-2xl dark:border-red-800 dark:bg-surface-800">
        <div className="flex items-center gap-2 bg-red-600 px-5 py-3 text-white">
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-wide">Anuncio importante · requiere tu confirmación</span>
        </div>
        <div className="p-5">
          <h2 id="anuncio-bloqueante-titulo" className="text-lg font-semibold text-surface-800 dark:text-surface-100">{activo.titulo}</h2>
          {activo.autor?.nombre && (
            <p className="mt-0.5 text-[11px] text-surface-400">Publicado por {activo.autor.nombre}</p>
          )}
          <div className="mt-3 max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words text-sm text-surface-700 dark:text-surface-200">
            {activo.contenido}
          </div>
          {pendientes.length > 1 && (
            <p className="mt-3 text-[11px] font-medium text-red-600 dark:text-red-400">
              Tenés {pendientes.length} anuncios por confirmar.
            </p>
          )}
          <button
            onClick={aceptar}
            disabled={aceptando}
            className="mt-5 w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
          >
            {aceptando ? "Confirmando…" : "Acepto y entendí"}
          </button>
        </div>
      </div>
    </div>
  );
}
