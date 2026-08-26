"use client";

import { useCallback, useEffect, useState } from "react";
import { useReportarUbicacion } from "@/hooks/useReportarUbicacion";

/**
 * Pide el consentimiento para compartir ubicación y, si está dado, mantiene el reporte.
 *
 * Va montado en el layout del dashboard. Para todo el que no sea técnico activo no hace
 * absolutamente nada: `aplica` viene en false y el componente no renderiza ni pide GPS.
 *
 * El aviso existe porque el permiso del navegador NO es un consentimiento: es un permiso
 * técnico que el sistema operativo pide sin explicar para qué. Acá se dice qué se guarda,
 * en qué horario y quién lo ve, y queda registrado quién aceptó y cuándo.
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
        <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
          <h2 className="text-base font-semibold text-surface-900">Compartir tu ubicación durante la jornada</h2>
          <p className="mt-2 text-sm text-surface-600">
            Carrot puede registrar dónde estás para coordinar el trabajo del día. Antes de activarlo,
            esto es exactamente lo que pasa:
          </p>
          <ul className="mt-3 space-y-2 text-sm text-surface-600">
            <li className="flex gap-2">
              <span className="text-primary-600">•</span>
              <span>Solo <b>{estado.ventana}</b>. Fuera de ese horario no se registra nada.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary-600">•</span>
              <span>Solo mientras tenés Carrot abierto. Si cerrás la app, deja de registrarse.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary-600">•</span>
              <span>Lo ve <b>únicamente administración</b>. No lo ven los otros técnicos ni tu coordinador.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary-600">•</span>
              <span>Se borra solo a los <b>30 días</b>.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary-600">•</span>
              <span>Podés desactivarlo cuando quieras desde tu perfil.</span>
            </li>
          </ul>
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => responder(true)}
              disabled={guardando}
              className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Aceptar y compartir"}
            </button>
            <button
              onClick={() => responder(false)}
              disabled={guardando}
              className="rounded-lg border border-surface-300 px-4 py-2.5 text-sm font-medium text-surface-600 hover:bg-surface-50 disabled:opacity-50"
            >
              Ahora no
            </button>
          </div>
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
