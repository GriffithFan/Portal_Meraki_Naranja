"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";

/* eslint-disable @typescript-eslint/no-explicit-any */

const severityStyles: Record<string, string> = {
  alta: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
  media: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
  baja: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function openHref(row: any) {
  const query = row.codigo || row.nombre || row.incidencias || row.cue || row.id;
  return `/dashboard/tareas?open=${encodeURIComponent(query)}`;
}

export default function CalidadDatosPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/calidad-datos", { credentials: "include" });
      if (!res.ok) throw new Error(res.status === 403 ? "Sin permisos para ver calidad de datos" : "No se pudo cargar calidad de datos");
      const json = await res.json();
      setData(json);
      setActiveKey((current) => current || json.issues?.[0]?.key || null);
    } catch (err: any) {
      setError(err.message || "No se pudo cargar calidad de datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activeIssue = useMemo(() => {
    if (!data?.issues?.length) return null;
    return data.issues.find((item: any) => item.key === activeKey) || data.issues[0];
  }, [data, activeKey]);

  const sortedIssues = useMemo(() => {
    const severityRank: Record<string, number> = { alta: 0, media: 1, baja: 2 };
    return [...(data?.issues || [])].sort((a: any, b: any) => (severityRank[a.severity] - severityRank[b.severity]) || b.count - a.count);
  }, [data]);

  if (loading) {
    return (
      <div className="animate-fade-in-up space-y-5">
        <div className="h-7 w-64 rounded bg-surface-200 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, index) => <div key={index} className="h-24 rounded-lg border border-surface-200 bg-white animate-pulse" />)}
        </div>
        <div className="h-96 rounded-lg border border-surface-200 bg-white animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[360px] flex flex-col items-center justify-center text-center">
        <p className="text-sm text-red-500">{error || "Sin datos"}</p>
        <button onClick={fetchData} className="mt-3 rounded-md border border-surface-200 px-3 py-1.5 text-xs text-surface-600 hover:bg-surface-50">Reintentar</button>
      </div>
    );
  }

  const criticalCount = data.issues.filter((item: any) => item.severity === "alta" && item.count > 0).length;
  const affectedTotal = data.issues.reduce((acc: number, item: any) => acc + (item.count > 0 ? 1 : 0), 0);

  return (
    <div className="animate-fade-in-up space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 dark:text-surface-100">Calidad de datos</h1>
          <p className="text-xs text-surface-400">Panel read-only para detectar tareas incompletas, duplicadas o con fechas vencidas</p>
        </div>
        <button onClick={fetchData} className="w-fit rounded-md border border-surface-200 px-3 py-1.5 text-xs text-surface-600 hover:bg-surface-50 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800">Actualizar</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Calidad estimada" value={`${data.quality}%`} tone={data.quality < 70 ? "danger" : data.quality < 85 ? "warn" : "ok"} />
        <Stat label="Tareas revisadas" value={data.total.toLocaleString("es-AR")} />
        <Stat label="Reglas con hallazgos" value={affectedTotal} tone={affectedTotal > 0 ? "warn" : "ok"} />
        <Stat label="Alertas altas" value={criticalCount} tone={criticalCount > 0 ? "danger" : "ok"} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
        <section className="rounded-lg border border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-800">
          <div className="border-b border-surface-100 p-3 dark:border-surface-700">
            <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-100">Reglas de control</h2>
            <p className="text-[11px] text-surface-400">Ordenadas por severidad e impacto</p>
          </div>
          <div className="divide-y divide-surface-100 dark:divide-surface-700">
            {sortedIssues.map((item: any) => (
              <button
                key={item.key}
                onClick={() => setActiveKey(item.key)}
                className={clsx("w-full p-3 text-left transition hover:bg-surface-50 dark:hover:bg-surface-700/50", activeIssue?.key === item.key && "bg-primary-50 dark:bg-primary-900/20")}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-surface-700 dark:text-surface-200">{item.title}</span>
                  <span className="text-lg font-semibold tabular-nums text-surface-900 dark:text-surface-100">{item.count}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className={clsx("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", severityStyles[item.severity])}>{item.severity}</span>
                  {item.href && <Link href={item.href} onClick={(e) => e.stopPropagation()} className="text-[11px] text-primary-600 hover:underline">Ver filtro</Link>}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-800">
          {!activeIssue ? (
            <div className="p-8 text-center text-sm text-surface-400">Sin hallazgos</div>
          ) : (
            <>
              <div className="flex flex-col gap-2 border-b border-surface-100 p-4 dark:border-surface-700 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-surface-800 dark:text-surface-100">{activeIssue.title}</h2>
                    <span className={clsx("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", severityStyles[activeIssue.severity])}>{activeIssue.severity}</span>
                  </div>
                  <p className="text-xs text-surface-400">Muestra de hasta 24 registros. No modifica informacion.</p>
                </div>
                <Link href={activeIssue.href || "/dashboard/tareas"} className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700">Abrir en tareas</Link>
              </div>

              {activeIssue.groups?.length > 0 && (
                <div className="border-b border-surface-100 p-4 dark:border-surface-700">
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-surface-400">Grupos duplicados</h3>
                  <div className="flex flex-wrap gap-2">
                    {activeIssue.groups.map((group: any, index: number) => (
                      <span key={`${group.cue || group.cuePredio || index}`} className="rounded-full bg-surface-100 px-2 py-1 text-xs text-surface-600 dark:bg-surface-700 dark:text-surface-200">
                        {group.cue || group.cuePredio || "Sin valor"} · {group._count._all}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="divide-y divide-surface-100 p-3 dark:divide-surface-700 sm:hidden">
                {(activeIssue.sample || []).length === 0 ? (
                  <div className="p-6 text-center text-sm text-surface-400">Sin registros para esta regla</div>
                ) : activeIssue.sample.map((row: any) => (
                  <Link key={`${activeIssue.key}-mobile-${row.id}`} href={openHref(row)} className="block py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-primary-700 dark:text-primary-300">{row.codigo || row.nombre || "Sin codigo"}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-surface-500 dark:text-surface-300">{row.incidencias || row.nombre || row.provincia || "Sin detalle"}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-surface-100 px-2 py-0.5 text-[10px] text-surface-500 dark:bg-surface-700 dark:text-surface-300">{formatDate(row.fechaHasta || row.fechaProgramada)}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-surface-500 dark:text-surface-300">
                      <span><b className="font-medium text-surface-400">Equipo:</b> {row.equipoAsignado || "-"}</span>
                      <span><b className="font-medium text-surface-400">Estado:</b> {row.estado?.nombre || "-"}</span>
                      <span><b className="font-medium text-surface-400">Espacio:</b> {row.espacio?.nombre || "-"}</span>
                      <span><b className="font-medium text-surface-400">CUE:</b> {row.cue || row.cuePredio || "-"}</span>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="hidden overflow-x-auto sm:block">
                <table className="min-w-full divide-y divide-surface-100 text-sm dark:divide-surface-700">
                  <thead className="bg-surface-50 dark:bg-surface-900/40">
                    <tr>
                      <Th>Tarea</Th>
                      <Th>Equipo</Th>
                      <Th>Estado</Th>
                      <Th>Espacio</Th>
                      <Th>CUE</Th>
                      <Th>Fecha</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
                    {(activeIssue.sample || []).length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-sm text-surface-400">Sin registros para esta regla</td></tr>
                    ) : activeIssue.sample.map((row: any) => (
                      <tr key={`${activeIssue.key}-${row.id}`} className="hover:bg-surface-50 dark:hover:bg-surface-700/40">
                        <td className="max-w-[260px] px-3 py-2">
                          <Link href={openHref(row)} className="font-medium text-primary-700 hover:underline dark:text-primary-300">{row.codigo || row.nombre || "Sin codigo"}</Link>
                          <p className="truncate text-[11px] text-surface-400">{row.incidencias || row.nombre || row.provincia || "Sin detalle"}</p>
                        </td>
                        <td className="px-3 py-2 text-xs text-surface-600 dark:text-surface-300">{row.equipoAsignado || "-"}</td>
                        <td className="px-3 py-2 text-xs text-surface-600 dark:text-surface-300">{row.estado?.nombre || "-"}</td>
                        <td className="px-3 py-2 text-xs text-surface-600 dark:text-surface-300">{row.espacio?.nombre || "-"}</td>
                        <td className="px-3 py-2 text-xs text-surface-600 dark:text-surface-300">{row.cue || row.cuePredio || "-"}</td>
                        <td className="px-3 py-2 text-xs text-surface-600 dark:text-surface-300">{formatDate(row.fechaHasta || row.fechaProgramada)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      <p className="text-[11px] text-surface-400">Ultima lectura: {new Date(data.generatedAt).toLocaleString("es-AR")}</p>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "ok" | "warn" | "danger" }) {
  const toneClass = tone === "ok" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : tone === "danger" ? "text-red-600" : "text-surface-800 dark:text-surface-100";
  return (
    <div className="rounded-lg border border-surface-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-800">
      <p className="text-xs text-surface-400">{label}</p>
      <p className={clsx("mt-1 text-2xl font-semibold tabular-nums", toneClass)}>{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-400">{children}</th>;
}
