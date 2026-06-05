"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function MisTareasPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("todos");
  const [quickFilter, setQuickFilter] = useState("todas");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/tareas/mis", { credentials: "include" });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalActivas = data?.total || 0;
  const noConformesCount = data?.quickCounts?.noConformes || 0;
  const avanceOperativo = totalActivas > 0
    ? Math.round(((totalActivas - noConformesCount) / totalActivas) * 100)
    : 100;

  const filtered = useMemo(() => {
    const tareas = data?.predios || [];
    const q = search.trim().toLowerCase();
    return tareas.filter((t: any) => {
      const estadoKey = t.estado?.id || "sin-estado";
      if (estado !== "todos" && estadoKey !== estado) return false;
      if (!matchesQuickFilter(t, quickFilter)) return false;
      if (!q) return true;
      const asignados = t.asignaciones?.map((a: any) => a.usuario?.nombre).filter(Boolean).join(" ");
      return [t.nombre, t.codigo, t.ciudad, t.provincia, asignados, t.espacio?.nombre, t.motivoNoConforme, t.incidencias]
        .filter(Boolean)
        .some((value: string) => value.toLowerCase().includes(q));
    });
  }, [data, search, estado, quickFilter]);

  const noConformesFiltradas = useMemo(
    () => filtered.filter((t: any) => t.isNoConforme),
    [filtered],
  );

  const noConformesConMotivo = useMemo(
    () => noConformesFiltradas.filter((t: any) => Boolean(t.motivoNoConforme)).length,
    [noConformesFiltradas],
  );

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
          <p className="text-xs text-surface-400">Seguimiento de tareas asignadas activas (sin conformes)</p>
        </div>
        <button onClick={fetchData} className="px-3 py-1.5 text-xs rounded-md border border-surface-200 text-surface-600 hover:bg-surface-50">Actualizar</button>
      </div>

      <div className="bg-white border border-surface-200 rounded-lg p-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-surface-500">Progreso operativo</p>
          <p className="text-xs text-surface-500">
            {totalActivas - noConformesCount} en curso estable · {noConformesCount} no conformes
          </p>
        </div>
        <div className="h-2.5 bg-surface-100 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(avanceOperativo, 100))}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px]">
          <span className="text-surface-400">Sin conformes en el panel</span>
          <span className="font-semibold text-surface-700 tabular-nums">{avanceOperativo}%</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <SummaryCard label="Asignadas activas" value={totalActivas} />
        <SummaryCard label="Mostradas" value={filtered.length} />
        <SummaryCard label="No conformes" value={noConformesCount} tone="danger" />
        <SummaryCard label="NC con motivo" value={noConformesConMotivo} tone="danger" />
        <SummaryCard label="Estados" value={data?.byEstado?.length || 0} />
        <SummaryCard label="Vencidas" value={data?.quickCounts?.vencidas || 0} tone="warn" />
        <SummaryCard label="Sin GPS" value={data?.quickCounts?.sinGPS || 0} tone="warn" />
        <SummaryCard label="Alta prioridad" value={data?.quickCounts?.prioridadAlta || 0} tone="primary" />
      </div>

      <div className="bg-white border border-surface-200 rounded-lg overflow-hidden">
        <div className="p-3 border-b border-surface-100 space-y-3">
          <div className="flex flex-wrap gap-2">
            {[
              { key: "todas", label: "Todas", count: totalActivas },
              { key: "no-conformes", label: "No conformes", count: noConformesCount },
              { key: "hoy", label: "Hoy", count: data?.quickCounts?.hoy || 0 },
              { key: "vencidas", label: "Vencidas", count: data?.quickCounts?.vencidas || 0 },
              { key: "sin-gps", label: "Sin GPS", count: data?.quickCounts?.sinGPS || 0 },
              { key: "sin-estado", label: "Sin estado", count: data?.quickCounts?.sinEstado || 0 },
              { key: "sin-espacio", label: "Sin espacio", count: data?.quickCounts?.sinEspacio || 0 },
              { key: "alta", label: "Alta", count: data?.quickCounts?.prioridadAlta || 0 },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setQuickFilter(item.key)}
                className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${quickFilter === item.key ? "bg-primary-600 border-primary-600 text-white" : "border-surface-200 text-surface-600 hover:bg-surface-50"}`}
              >
                {item.label} <span className="tabular-nums opacity-80">{item.count}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por predio, codigo, motivo, provincia, asignado o espacio"
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
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center text-surface-400">
            <p className="text-sm font-medium">No hay tareas para mostrar</p>
            <p className="text-xs mt-1">Probá ajustar la búsqueda o el estado.</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100">
            {filtered.map((tarea: any) => (
              <Link
                key={tarea.id}
                href={`/dashboard/tareas?open=${encodeURIComponent(tarea.codigo || tarea.nombre)}`}
                className={`block px-4 py-3 transition-colors ${tarea.isNoConforme ? "bg-red-50/40 hover:bg-red-50" : "hover:bg-surface-50"}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-surface-800 truncate">{tarea.nombre}</span>
                      {tarea.codigo && <span className="text-[11px] text-surface-400">{tarea.codigo}</span>}
                      {tarea.isNoConforme && <Badge tone="red">No conforme</Badge>}
                    </div>
                    <p className="text-xs text-surface-500 mt-1">
                      {tarea.provincia || "Sin provincia"} · {formatAsignados(tarea)} · {tarea.espacio?.nombre || "Sin espacio"}
                    </p>
                    {tarea.isNoConforme && (
                      <div className="mt-2 rounded-md border border-red-100 bg-white/80 p-2">
                        <p className="text-[11px] font-semibold text-red-600 uppercase tracking-wide">Motivo no conforme</p>
                        <p className="text-xs text-surface-700 mt-0.5 line-clamp-2">
                          {tarea.motivoNoConforme || "Sin motivo cargado"}
                        </p>
                        {tarea.motivoFuente && (
                          <p className="text-[10px] text-surface-400 mt-1">Fuente: {formatReasonSource(tarea.motivoFuente)}</p>
                        )}
                        {tarea.comentarioReciente?.autor && (
                          <p className="text-[10px] text-surface-400">Ultimo comentario: {tarea.comentarioReciente.autor}</p>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {tarea.prioridad === "ALTA" && <Badge tone="red">Alta prioridad</Badge>}
                      {isDueToday(tarea) && <Badge tone="blue">Hoy</Badge>}
                      {isOverdue(tarea) && <Badge tone="amber">Vencida</Badge>}
                      {isMissingGps(tarea) && <Badge tone="amber">Sin GPS</Badge>}
                      {!tarea.espacio && <Badge tone="gray">Sin espacio</Badge>}
                    </div>
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

function SummaryCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warn" | "primary" | "danger" }) {
  const valueClass = tone === "warn"
    ? "text-amber-600"
    : tone === "primary"
      ? "text-primary-600"
      : tone === "danger"
        ? "text-red-600"
        : "text-surface-800";
  return (
    <div className="bg-white border border-surface-200 rounded-lg p-4">
      <p className="text-xs text-surface-400">{label}</p>
      <p className={`text-2xl font-semibold mt-1 tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function formatAsignados(tarea: any) {
  const nombres = tarea.asignaciones?.map((a: any) => a.usuario?.nombre).filter(Boolean) || [];
  return nombres.length > 0 ? nombres.join(", ") : "Sin asignar";
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "red" | "blue" | "amber" | "gray" }) {
  const classes = {
    red: "bg-red-50 text-red-600 border-red-100",
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    gray: "bg-surface-50 text-surface-500 border-surface-100",
  };
  return <span className={`text-[10px] border rounded px-1.5 py-0.5 ${classes[tone]}`}>{children}</span>;
}

function matchesQuickFilter(tarea: any, filter: string) {
  if (filter === "todas") return true;
  if (filter === "no-conformes") return Boolean(tarea.isNoConforme);
  if (filter === "hoy") return isDueToday(tarea);
  if (filter === "vencidas") return isOverdue(tarea);
  if (filter === "sin-gps") return isMissingGps(tarea);
  if (filter === "sin-estado") return !tarea.estado;
  if (filter === "sin-espacio") return !tarea.espacio;
  if (filter === "alta") return tarea.prioridad === "ALTA";
  return true;
}

function isMissingGps(tarea: any) {
  return !tarea.gpsPredio && (tarea.latitud == null || tarea.longitud == null);
}

function isOverdue(tarea: any) {
  const date = tarea.fechaHasta || tarea.fechaProgramada;
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(date) < today;
}

function isDueToday(tarea: any) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const fechaProgramada = tarea.fechaProgramada ? new Date(tarea.fechaProgramada) : null;
  if (fechaProgramada && fechaProgramada >= start && fechaProgramada <= end) return true;
  const desde = tarea.fechaDesde ? new Date(tarea.fechaDesde) : null;
  const hasta = tarea.fechaHasta ? new Date(tarea.fechaHasta) : null;
  return Boolean(desde && hasta && desde <= end && hasta >= start);
}

function formatReasonSource(source: string) {
  if (source === "incidencia") return "Incidencia";
  if (source === "nota-tecnico") return "Nota tecnico";
  if (source === "nota") return "Nota general";
  if (source === "comentario") return "Comentario";
  return source;
}
