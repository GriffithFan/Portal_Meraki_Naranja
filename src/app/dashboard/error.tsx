"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] error de render:", error);
    try {
      fetch("/api/operacion/error-cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        keepalive: true,
        body: JSON.stringify({
          mensaje: error?.message || "Error de render (dashboard)",
          stack: error?.stack,
          digest: error?.digest,
          ruta: typeof window !== "undefined" ? window.location.pathname : null,
        }),
      }).catch(() => {});
    } catch { /* ignore */ }
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center animate-fade-in-up">
      <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-100">Algo salió mal</h2>
      <p className="text-sm text-surface-400 mt-1 max-w-md">
        Ocurrió un error al mostrar esta sección. Podés reintentar; si persiste, recargá la página o avisá al equipo.
      </p>
      {error?.digest && (
        <p className="text-[11px] text-surface-300 mt-2 font-mono">ref: {error.digest}</p>
      )}
      <div className="flex items-center gap-2 mt-5">
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-surface-800 text-white hover:bg-surface-700 transition-colors"
        >
          Reintentar
        </button>
        <Link
          href="/dashboard"
          className="px-4 py-2 rounded-lg text-sm font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
