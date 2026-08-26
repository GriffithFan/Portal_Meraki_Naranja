"use client";

import { useCallback, useEffect, useState } from "react";
import { useReportarUbicacion } from "@/hooks/useReportarUbicacion";

/**
 * Dispara el permiso de ubicación y, una vez dado, mantiene el reporte.
 *
 * Va montado en el layout del dashboard. Para todo el que no sea técnico activo no hace
 * absolutamente nada: `aplica` viene en false y el componente no renderiza ni pide GPS.
 *
 * El cartel es corto y tiene un solo botón a propósito: la explicación ya se dio en
 * persona, uno por uno, antes de activar esto. Acá no se vuelve a explicar ni se ofrece
 * "ahora no" — lo único que falta es el permiso del navegador, que el sistema operativo
 * pide aparte. Igual queda registrado quién aceptó y cuándo: eso no es la conversación,
 * es el respaldo de que existió.
 *
 * Si el técnico rechaza el permiso del sistema operativo no queda atrapado: el
 * consentimiento ya se guardó, el cartel se cierra y simplemente no hay señal.
 *
 * Mientras comparte, el indicador de abajo a la izquierda queda visible siempre. Que esto
 * no sea silencioso es parte del trato.
 */

interface EstadoConsentimiento {
  aplica: boolean;
  vigente: boolean;
  debePreguntar: boolean;
  revocado: boolean;
  ventana: string;
}

export default function UbicacionGate() {
  const [estado, setEstado] = useState<EstadoConsentimiento | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/ubicacion/consentimiento", { credentials: "include", cache: "no-store" });
      if (res.ok) setEstado(await res.json());
    } catch { /* si falla, no se muestra nada */ }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const reporte = useReportarUbicacion(Boolean(estado?.aplica && estado.vigente));

  const responder = async (aceptar: boolean) => {
    setGuardando(true);
    try {
      await fetch("/api/ubicacion/consentimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ aceptar }),
      });
      await cargar();
    } finally {
      setGuardando(false);
    }
  };

  if (!estado?.aplica) return null;

  if (estado.debePreguntar) {
    return (
      <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center">
        <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
          <h2 className="text-base font-semibold text-surface-900">Compartir ubicación</h2>
          <p className="mt-1.5 text-sm text-surface-600">
            Como hablamos, Carrot registra tu ubicación durante la jornada. Al aceptar, el teléfono
            te va a pedir permiso: tocá <b>Permitir</b>.
          </p>
          <button
            onClick={() => responder(true)}
            disabled={guardando}
            className="mt-4 w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Aceptar y compartir"}
          </button>
        </div>
      </div>
    );
  }

  if (!estado.vigente || !reporte.activo) return null;

  return (
    <div
      className="fixed bottom-3 left-3 z-40 flex items-center gap-1.5 rounded-full border border-emerald-200
                 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 shadow-sm"
      title={reporte.ultimoEnvio ? `Última señal: ${reporte.ultimoEnvio.toLocaleTimeString("es-AR")}` : "Compartiendo ubicación"}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      Compartiendo ubicación
    </div>
  );
}
