"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function EspacioOverviewPage() {
  const params = useParams();
  const espacioId = params.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/espacios/${espacioId}`, { credentials: "include" });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [espacioId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="animate-fade-in-up space-y-6">
        <div className="h-7 w-48 bg-surface-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-surface-200 h-64 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-surface-400">
        Espacio no encontrado
      </div>
    );
  }

  const { espacio, stats } = data;
  const hasHijos = espacio.hijos?.length > 0;
  const tareasDirectas = espacio._count?.predios || 0;
  const tareasSubEspacios = Math.max((stats.totalPredios || 0) - tareasDirectas, 0);

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: espacio.color + "20" }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke={espacio.color} strokeWidth={1.7} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-surface-800">{espacio.nombre}</h1>
        </div>
        {espacio.descripcion && (
          <p className="text-xs text-surface-400">{espacio.descripcion}</p>
        )}
        <div className="flex items-center gap-4 mt-3 border-b border-surface-200">
          <span className="text-xs font-medium text-primary-600 border-b-2 border-primary-600 pb-2 px-1">
            Resumen
          </span>
          <Link
            href={`/dashboard/tareas/espacio/${espacio.id}/tareas`}
            className="text-xs text-surface-400 hover:text-surface-600 pb-2 px-1 transition-colors"
            title={tareasSubEspacios > 0 ? `${tareasDirectas} directas; ${tareasSubEspacios} en sub-espacios` : `${tareasDirectas} directas`}
          >
            Tareas directas ({tareasDirectas})
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-5 sm:mb-6">
        <KPICard label={hasHijos ? "Total con sub-espacios" : "Total tareas"} value={stats.totalPredios} color="primary" />
        <KPICard
          label="Estados"
          value={stats.byEstado.length}
          color="accent"
        />
        <KPICard
          label="Equipos"
          value={stats.byEquipo.filter((e: any) => e.nombre !== "Sin asignar").length}
          color="green"
        />
        <KPICard
          label="Provincias"
          value={stats.byProvincia.filter((p: any) => p.nombre !== "Sin provincia").length}
          color="blue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 mb-5 sm:mb-6">
        {/* Distribución por estado */}
        <div className="bg-white rounded-lg border border-surface-200 p-3 sm:p-5">
          <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-4">
            Distribución por estado
          </h3>
          {stats.byEstado.length === 0 ? (
            <EmptyMsg />
          ) : (
            <div className="space-y-3">
              {stats.byEstado.map((e: any) => (
                <BarRow
                  key={e.nombre}
                  label={e.nombre}
                  count={e.count}
                  total={stats.totalPredios}
                  color={e.color}
                />
              ))}
            </div>
          )}
        </div>

        {/* Distribución por equipo/técnico */}
        <div className="bg-white rounded-lg border border-surface-200 p-3 sm:p-5">
          <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-4">
            Por equipo / técnico
          </h3>
          {stats.byEquipo.length === 0 ? (
            <EmptyMsg />
          ) : (
            <div className="space-y-3">
              {stats.byEquipo.slice(0, 10).map((e: any) => (
                <BarRow
                  key={e.nombre}
                  label={e.nombre}
                  count={e.count}
                  total={stats.totalPredios}
                  color="#3b82f6"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 mb-5 sm:mb-6">
        {/* Por provincia */}
        <div className="bg-white rounded-lg border border-surface-200 p-3 sm:p-5">
          <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-4">
            Por provincia / zona
          </h3>
          {stats.byProvincia.length === 0 ? (
            <EmptyMsg />
          ) : (
            <div className="space-y-3">
              {stats.byProvincia.slice(0, 10).map((p: any) => (
                <BarRow
                  key={p.nombre}
                  label={p.nombre}
                  count={p.count}
                  total={stats.totalPredios}
                  color="#f97316"
                />
              ))}
            </div>
          )}
        </div>

        {/* Por ámbito */}
        <div className="bg-white rounded-lg border border-surface-200 p-3 sm:p-5">
          <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-4">
            Por ámbito
          </h3>
          {stats.byAmbito.length === 0 ? (
            <EmptyMsg />
          ) : (
            <div className="space-y-2">
              {stats.byAmbito.map((a: any) => {
                const pct = stats.totalPredios > 0 ? Math.round((a.count / stats.totalPredios) * 100) : 0;
                return (
                  <div key={a.nombre} className="flex items-center justify-between p-3 rounded-lg bg-surface-50">
                    <span className="text-sm text-surface-700">{a.nombre}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-surface-800">{a.count}</span>
                      <span className="text-[10px] text-surface-400">({pct}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sub-espacios */}
      {hasHijos && (
        <div className="bg-white rounded-lg border border-surface-200 p-5">
          <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-4">
            Sub-espacios
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {espacio.hijos.map((hijo: any) => {
              const count = hijo._count?.predios || 0;
              return (
                <Link
                  key={hijo.id}
                  href={`/dashboard/tareas/espacio/${hijo.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg border border-surface-100 hover:border-surface-300 hover:bg-surface-50 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: hijo.color + "15" }}>
                    <svg className="w-4 h-4" fill="none" stroke={hijo.color} strokeWidth={1.7} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-700 truncate group-hover:text-primary-600 transition-colors">
                      {hijo.nombre}
                    </p>
                    <p className="text-[10px] text-surface-400">{count} tarea{count !== 1 ? "s" : ""}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componentes auxiliares ────────────────────────────
function KPICard({ label, value }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white rounded-lg border border-surface-200 p-4">
      <p className="text-[10px] text-surface-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-surface-800">{value}</p>
    </div>
  );
}

function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-surface-600 truncate">{label}</span>
        </div>
        <span className="text-surface-500 font-medium tabular-nums">
          {count} <span className="text-surface-300 font-normal">({Math.round(pct)}%)</span>
        </span>
      </div>
      <div className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function EmptyMsg() {
  return <p className="text-xs text-surface-400 py-4 text-center">Sin datos</p>;
}
