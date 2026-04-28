"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function MisTareasPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("todos");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/tareas/mis", { credentials: "include" });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    const tareas = data?.predios || [];
    const q = search.trim().toLowerCase();
    return tareas.filter((t: any) => {
      const estadoKey = t.estado?.id || "sin-estado";
      if (estado !== "todos" && estadoKey !== estado) return false;
      if (!q) return true;
      return [t.nombre, t.codigo, t.ciudad, t.provincia, t.equipoAsignado, t.espacio?.nombre]
        .filter(Boolean)
        .some((value: string) => value.toLowerCase().includes(q));
    });
  }, [data, search, estado]);

  if (loading) {
    return (
      <div className="animate-fade-in-up space-y-5">
        <div className="h-7 w-44 bg-surface-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, index) => <div key={index} className="h-24 bg-white border border-surface-200 rounded-lg animate-pulse" />)}
        </div>
        <div className="h-80 bg-white border border-surface-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800">Mis tareas</h1>
          <p className="text-xs text-surface-400">Tareas asignadas, creadas o vinculadas a tu equipo</p>
        </div>
        <button onClick={fetchData} className="px-3 py-1.5 text-xs rounded-md border border-surface-200 text-surface-600 hover:bg-surface-50">Actualizar</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Total visibles" value={data?.total || 0} />
        <SummaryCard label="Mostradas" value={filtered.length} />
        <SummaryCard label="Estados" value={data?.byEstado?.length || 0} />
      </div>

      <div className="bg-white border border-surface-200 rounded-lg overflow-hidden">
        <div className="p-3 border-b border-surface-100 flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por predio, codigo, provincia, equipo o espacio"
            className="flex-1 px-3 py-2 text-sm border border-surface-200 rounded-md focus:outline-none focus:border-surface-400"
          />
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="px-3 py-2 text-sm border border-surface-200 rounded-md bg-white focus:outline-none focus:border-surface-400"
          >
            <option value="todos">Todos los estados</option>
            {(data?.byEstado || []).map((item: any) => <option key={item.estadoId} value={item.estadoId}>{item.nombre} ({item.count})</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center text-surface-400">
            <p className="text-sm font-medium">No hay tareas para mostrar</p>
            <p className="text-xs mt-1">Probá ajustar la búsqueda o el estado.</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100">
            {filtered.map((tarea: any) => (
              <Link key={tarea.id} href={`/dashboard/tareas?open=${encodeURIComponent(tarea.codigo || tarea.nombre)}`} className="block px-4 py-3 hover:bg-surface-50 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-surface-800 truncate">{tarea.nombre}</span>
                      {tarea.codigo && <span className="text-[11px] text-surface-400">{tarea.codigo}</span>}
                    </div>
                    <p className="text-xs text-surface-500 mt-1">
                      {tarea.provincia || "Sin provincia"} · {tarea.equipoAsignado || "Sin equipo"} · {tarea.espacio?.nombre || "Sin espacio"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] rounded-full px-2 py-0.5" style={{ backgroundColor: `${tarea.estado?.color || "#94a3b8"}20`, color: tarea.estado?.color || "#64748b" }}>
                      {tarea.estado?.nombre || "Sin estado"}
                    </span>
                    <span className="text-[11px] text-surface-400">{tarea._count?.comentarios || 0} com.</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-surface-200 rounded-lg p-4">
      <p className="text-xs text-surface-400">{label}</p>
      <p className="text-2xl font-semibold text-surface-800 mt-1 tabular-nums">{value}</p>
    </div>
  );
}
