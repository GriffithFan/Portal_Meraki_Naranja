"use client";

import { useState, useEffect, useCallback } from "react";
import { ListSkeleton } from "@/components/ui/Skeletons";

/* eslint-disable @typescript-eslint/no-explicit-any */

const TIPO_COLORS: Record<string, string> = {
  TAREA: "bg-blue-500",
  GENERAL: "bg-surface-400",
  ALERTA: "bg-red-500",
  RECORDATORIO: "bg-yellow-500",
  CHANGELOG: "bg-emerald-500",
  ALERTA_MONITOREO: "bg-orange-500",
  MONITOREO_OK: "bg-emerald-500",
};

export default function BandejaPage() {
  const [notificaciones, setNotificaciones] = useState<any[]>([]);
  const [sinLeer, setSinLeer] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"todas" | "noLeidas">("todas");

  const fetchNotificaciones = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filtro === "noLeidas") params.set("noLeidas", "true");
    const res = await fetch(`/api/notificaciones?${params}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setNotificaciones(data.notificaciones || []);
      setSinLeer(data.sinLeer || 0);
    }
    setLoading(false);
  }, [filtro]);

  useEffect(() => { fetchNotificaciones(); }, [fetchNotificaciones]);

  async function marcarLeida(id: string) {
    await fetch("/api/notificaciones", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ids: [id] }),
    });
    fetchNotificaciones();
  }

  async function marcarTodas() {
    await fetch("/api/notificaciones", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ marcarTodas: true }),
    });
    fetchNotificaciones();
  }

  return (
    <div className="animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800">Bandeja</h1>
          <p className="text-xs text-surface-400">
            Mensajes y notificaciones
            {sinLeer > 0 && <span className="ml-2 px-1.5 py-0.5 bg-red-500 text-white rounded text-[10px] font-bold">{sinLeer}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as "todas" | "noLeidas")}
            className="px-3 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
          >
            <option value="todas">Todas</option>
            <option value="noLeidas">Sin leer</option>
          </select>
          {sinLeer > 0 && (
            <button onClick={marcarTodas} className="px-3 py-1.5 text-xs text-surface-600 hover:bg-surface-100 rounded-md transition-colors font-medium">
              Marcar todas leídas
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-surface-200">
        {loading ? (
          <ListSkeleton items={6} />
        ) : notificaciones.length === 0 ? (
          <div className="text-center py-16 text-surface-400">
            <svg className="w-10 h-10 mx-auto mb-3 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.981l7.5-4.039a2.25 2.25 0 012.134 0l7.5 4.039a2.25 2.25 0 011.183 1.98V19.5z" /></svg>
            <p className="text-sm font-medium mb-1">Sin notificaciones</p>
            <p className="text-xs">Tu bandeja está vacía</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100">
            {notificaciones.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-5 py-4 transition-colors cursor-pointer ${n.leida ? "bg-white hover:bg-surface-50" : "bg-primary-50/30 hover:bg-primary-50/50"}`}
                onClick={() => !n.leida && marcarLeida(n.id)}
              >
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${TIPO_COLORS[n.tipo] || "bg-surface-300"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm ${n.leida ? "text-surface-700" : "text-surface-900 font-semibold"}`}>{n.titulo}</p>
                    {!n.leida && <span className="w-2 h-2 rounded-full bg-accent-500 shrink-0" />}
                  </div>
                  <p className="text-xs text-surface-500 mt-0.5">{n.mensaje}</p>
                  <span className="text-xs text-surface-400 mt-1 block">
                    {new Date(n.createdAt).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
