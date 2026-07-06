"use client";

import { useEffect } from "react";

/**
 * Error boundary raíz: solo se activa si falla el render del layout raíz.
 * Reemplaza al <html>/<body>, por eso los incluye.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global] error de render:", error);
    // Reportar al registro de errores (best-effort, no bloquea la UI).
    try {
      fetch("/api/operacion/error-cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        keepalive: true,
        body: JSON.stringify({
          mensaje: error?.message || "Error de render (global)",
          stack: error?.stack,
          digest: error?.digest,
          ruta: typeof window !== "undefined" ? window.location.pathname : null,
        }),
      }).catch(() => {});
    } catch { /* ignore */ }
  }, [error]);

  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1rem", textAlign: "center", background: "#f8fafc", color: "#1e293b" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>La aplicación encontró un error</h1>
          <p style={{ fontSize: "0.875rem", color: "#64748b", marginTop: "0.25rem", maxWidth: "28rem" }}>
            Ocurrió un error inesperado. Probá recargar la página.
          </p>
          <button
            onClick={reset}
            style={{ marginTop: "1.25rem", padding: "0.5rem 1rem", borderRadius: "0.5rem", border: "none", background: "#1e293b", color: "#fff", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer" }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
