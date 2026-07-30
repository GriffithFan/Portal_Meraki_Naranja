"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PendientePage() {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  const cerrarSesion = async () => {
    setSaliendo(true);
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch { /* ignore */ }
    router.replace("/login");
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-surface-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-surface-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
        </div>
        <h1 className="text-lg font-semibold text-surface-800">Cuenta pendiente de habilitación</h1>
        <p className="mt-2 text-sm text-surface-500">
          Tu cuenta está creada pero todavía no tiene permisos asignados. Un administrador debe habilitarte
          (asignarte el rol de Técnico) para poder usar el sistema.
        </p>
        <button
          onClick={cerrarSesion}
          disabled={saliendo}
          className="mt-6 w-full rounded-lg bg-surface-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-surface-900 disabled:opacity-60"
        >
          {saliendo ? "Cerrando…" : "Cerrar sesión"}
        </button>
      </div>
    </div>
  );
}
