"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function SupervisorEquiposPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("todos");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/supervisor/equipos", { credentials: "include" });
      if (!res.ok) throw new Error(res.status === 403 ? "Sin permisos para ver este panel" : "No se pudo cargar el panel supervisor");
      setData(await res.json());
    } catch (err: any) {
      setError(err.message || "No se pudo cargar el panel supervisor");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const equipos = useMemo(() => {
    const all = data?.equipos || [];
    if (filter === "vencidas") return all.filter((item: any) => item.vencidas > 0);
    if (filter === "hoy") return all.filter((item: any) => item.hoy > 0);
    if (filter === "alertas") return all.filter((item: any) => item.sinGPS > 0 || item.sinEstado > 0 || item.alta > 0);
    return all;
  }, [data, filter]);

  if (loading) {
    return (
      <div className="animate-fade-in-up space-y-5">
        <div className="h-7 w-56 bg-surface-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, index) => <div key={index} className="h-24 bg-white border border-surface-200 rounded-lg animate-pulse" />)}
        </div>
        <div className="h-96 bg-white border border-surface-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[360px] flex flex-col items-center justify-center text-surface-400">
        <p className="text-sm text-red-500">{error || "Sin datos"}</p>
        <button onClick={fetchData} className="mt-3 text-xs text-primary-600 hover:underline">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800">Supervisor por equipo</h1>
          <p className="text-xs text-surface-400">Carga de trabajo, vencidas, avance y pendientes por tecnico/equipo</p>
        </div>
        <button onClick={fetchData} className="px-3 py-1.5 text-xs rounded-md border border-surface-200 text-surface-600 hover:bg-surface-50">Actualizar</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <Stat label="Tareas" value={data.resumen.total} />
        <Stat label="Para hoy" value={data.resumen.hoy} tone="primary" />
        <Stat label="Vencidas" value={data.resumen.vencidas} tone="warn" />
        <Stat label="Alta/Urgente" value={data.resumen.alta} tone="danger" />
        <Stat label="Sin GPS" value={data.resumen.sinGPS} tone="warn" />
        <Stat label="Sin estado" value={data.resumen.sinEstado} tone="warn" />
      </div>

      <div className="bg-white border border-surface-200 rounded-lg p-3 flex flex-wrap gap-2">
        {[
          { key: "todos", label: "Todos", count: data.equipos.length },
          { key: "hoy", label: "Con tareas hoy", count: data.equipos.filter((item: any) => item.hoy > 0).length },
          { key: "vencidas", label: "Con vencidas", count: data.equipos.filter((item: any) => item.vencidas > 0).length },
          { key: "alertas", label: "Con alertas", count: data.equipos.filter((item: any) => item.sinGPS > 0 || item.sinEstado > 0 || item.alta > 0).length },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key)}
            className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${filter === item.key ? "bg-primary-600 border-primary-600 text-white" : "border-surface-200 text-surface-600 hover:bg-surface-50"}`}
          >
            {item.label} <span className="tabular-nums opacity-80">{item.count}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {equipos.map((equipo: any) => (
          <section key={equipo.key} className="bg-white border border-surface-200 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-surface-100">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold text-surface-800">{equipo.display}</h2>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-surface-100 text-surface-500 font-medium">{equipo.key}</span>
                  </div>
                  <p className="text-[11px] text-surface-400 mt-0.5">{equipo.actualizadasSemana} actualizadas en los ultimos 7 dias</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-semibold text-surface-800 tabular-nums">{equipo.total}</p>
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider">tareas</p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <MiniMetric label="Hoy" value={equipo.hoy} tone="primary" />
                <MiniMetric label="Vencidas" value={equipo.vencidas} tone="warn" />
                <MiniMetric label="Alta" value={equipo.alta} tone="danger" />
                <MiniMetric label="Sin GPS" value={equipo.sinGPS} tone="warn" />
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-surface-400">Avance operativo</span>
                  <span className="font-medium text-surface-700">{Math.max(0, Math.min(equipo.avance, 100))}%</span>
                </div>
                <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(equipo.avance, 100))}%` }} />
                </div>
              </div>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider mb-2">Estados principales</h3>
                <div className="space-y-2">
                  {equipo.byEstado.length === 0 ? (
                    <p className="text-xs text-surface-400">Sin estados registrados</p>
                  ) : equipo.byEstado.map((estado: any) => (
                    <div key={estado.estadoId} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: estado.color }} />
                        <span className="text-surface-600 truncate">{estado.nombre}</span>
                      </span>
                      <span className="font-semibold text-surface-800 tabular-nums">{estado.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider mb-2">Pendientes recientes</h3>
                <div className="space-y-2">
                  {equipo.recientes.length === 0 ? (
                    <p className="text-xs text-surface-400">Sin tareas recientes</p>
                  ) : equipo.recientes.map((tarea: any) => (
                    <Link key={tarea.id} href={`/dashboard/tareas?open=${encodeURIComponent(tarea.codigo || tarea.nombre || "")}`} className="block rounded-md border border-surface-100 px-2 py-1.5 hover:bg-surface-50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-surface-700 truncate">{tarea.codigo || tarea.nombre || "Sin codigo"}</span>
                        <span className="text-[10px] text-surface-400 shrink-0">{tarea._count?.comentarios || 0} com.</span>
                      </div>
                      <p className="text-[11px] text-surface-400 truncate mt-0.5">{tarea.incidencias || tarea.nombre || tarea.provincia || "Sin detalle"}</p>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "primary" | "warn" | "danger" }) {
  const toneClass = tone === "primary" ? "text-primary-600" : tone === "warn" ? "text-amber-600" : tone === "danger" ? "text-red-600" : "text-surface-800";
  return (
    <div className="bg-white border border-surface-200 rounded-lg p-4">
      <p className="text-xs text-surface-400">{label}</p>
      <p className={`text-2xl font-semibold mt-1 tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: number; tone: "primary" | "warn" | "danger" }) {
  const toneClass = tone === "primary" ? "text-primary-600 bg-primary-50" : tone === "danger" ? "text-red-600 bg-red-50" : "text-amber-600 bg-amber-50";
  return (
    <div className="rounded-md bg-surface-50 p-2">
      <p className={`inline-flex px-1.5 py-0.5 rounded text-sm font-semibold tabular-nums ${toneClass}`}>{value}</p>
      <p className="text-[10px] text-surface-400 mt-1">{label}</p>
    </div>
  );
}
