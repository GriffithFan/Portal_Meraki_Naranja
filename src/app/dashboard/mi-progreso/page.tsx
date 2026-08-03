"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/hooks/useSession";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Cell } from "recharts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const VERDE = "#10b981";
const ROJO = "#ef4444";
const AMBAR = "#f59e0b";

function StatTile({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4">
      <p className="text-[11px] text-surface-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold mt-0.5" style={color ? { color } : undefined}>{value}</p>
      {sub && <p className="text-[11px] text-surface-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function MiProgresoPage() {
  const { loading: sesLoading } = useSession();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/mi-progreso", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (sesLoading || loading) return <div className="py-24 text-center text-sm text-surface-400">Cargando tu progreso…</div>;
  if (!data) return <div className="py-24 text-center text-sm text-surface-400">No se pudo cargar tu progreso.</div>;

  const { objetivoSemanal, semana, totales, porcentajeConformidad, evolucionSemanal, evolucionMensual, promedios, motivosNC } = data;
  const pct = Math.min(100, Math.round((semana.conformes / objetivoSemanal) * 100));
  const estadoSemana = semana.conformes >= objetivoSemanal
    ? { txt: "¡En objetivo! 🎉", color: VERDE }
    : semana.conformes >= objetivoSemanal * 0.6
    ? { txt: "En camino 💪", color: AMBAR }
    : { txt: "A darle 🚀", color: ROJO };

  const sinDatos = totales.conformes + totales.noConformes + totales.instaladosAuditar === 0;

  return (
    <div className="animate-fade-in-up max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-surface-800 dark:text-surface-100">Mi progreso</h1>
        <p className="text-xs text-surface-400">Tu rendimiento semanal, conformes, no conformes y evolución.</p>
      </div>

      {sinDatos ? (
        <div className="py-16 text-center text-surface-400 border border-dashed border-surface-200 dark:border-surface-700 rounded-xl">
          <p className="text-sm font-medium">Todavía no hay datos de tus predios</p>
          <p className="text-xs mt-1">Cuando tengas predios conformes / no conformes asignados, vas a ver tu progreso acá.</p>
        </div>
      ) : (
        <>
          {/* Hero: esta semana */}
          <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-5">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs text-surface-400 uppercase tracking-wide">Conformes esta semana</p>
                <p className="text-3xl font-bold text-surface-800 dark:text-surface-100">
                  {semana.conformes} <span className="text-lg text-surface-400 font-normal">/ {objetivoSemanal}</span>
                </p>
              </div>
              <span className="text-sm font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: estadoSemana.color + "1a", color: estadoSemana.color }}>{estadoSemana.txt}</span>
            </div>
            <div className="h-2.5 bg-surface-100 dark:bg-surface-700 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: estadoSemana.color }} />
            </div>
            <p className="text-[11px] text-surface-400 mt-1.5">Objetivo: {objetivoSemanal} conformidades/semana. Esta semana también: {semana.noConformes} no conformes · {semana.instaladosAuditar} instalados/auditar.</p>
          </div>

          {/* Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Conformes (total)" value={totales.conformes} color={VERDE} />
            <StatTile label="No conformes" value={totales.noConformes} color={ROJO} />
            <StatTile label="% conformidad" value={porcentajeConformidad != null ? `${porcentajeConformidad}%` : "—"} sub="conformes vs (conf + NC)" />
            <StatTile label="Instalados / Auditar" value={totales.instaladosAuditar} sub="en proceso" />
          </div>

          {/* Promedios */}
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Promedio semanal" value={promedios.conformesPorSemana} sub="conformes por semana" />
            <StatTile label="Tu mejor semana" value={promedios.mejorSemana} sub="conformes en una semana" />
          </div>

          {/* Evolución semanal */}
          <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4">
            <p className="text-sm font-medium text-surface-700 dark:text-surface-200 mb-3">Evolución semanal (conformes)</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evolucionSemanal} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "#94a3b81a" }} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} formatter={(v: any) => [v, "Conformes"]} labelFormatter={(l) => `Semana del ${l}`} />
                  <ReferenceLine y={objetivoSemanal} stroke={AMBAR} strokeDasharray="4 4" label={{ value: `objetivo ${objetivoSemanal}`, position: "insideTopRight", fontSize: 10, fill: AMBAR }} />
                  <Bar dataKey="conformes" radius={[4, 4, 0, 0]} maxBarSize={38}>
                    {evolucionSemanal.map((d: any, i: number) => (
                      <Cell key={i} fill={d.conformes >= objetivoSemanal ? VERDE : "#93c5a8"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Evolución mensual */}
          <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4">
            <p className="text-sm font-medium text-surface-700 dark:text-surface-200 mb-3">Evolución mensual (conformes)</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evolucionMensual} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "#94a3b81a" }} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} formatter={(v: any) => [v, "Conformes"]} />
                  <Bar dataKey="conformes" fill={VERDE} radius={[4, 4, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Motivos de NC */}
          <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4">
            <p className="text-sm font-medium text-surface-700 dark:text-surface-200">Motivos de tus no conformes</p>
            <p className="text-[11px] text-surface-400 mb-3">Para saber qué corregir y evitar rechazos.</p>
            {motivosNC.total === 0 ? (
              <p className="text-xs text-emerald-600 py-3 text-center">Sin no conformes registrados 🎉</p>
            ) : (
              <>
                <div className="space-y-1.5 mb-3">
                  {motivosNC.categorias.map((c: any) => {
                    const w = Math.round((c.count / motivosNC.total) * 100);
                    return (
                      <div key={c.categoria} className="flex items-center gap-2 text-xs">
                        <span className="w-44 flex-shrink-0 text-surface-600 dark:text-surface-300 truncate">{c.categoria}</span>
                        <div className="flex-1 h-4 bg-surface-100 dark:bg-surface-700 rounded overflow-hidden">
                          <div className="h-full bg-red-400 rounded" style={{ width: `${Math.max(w, 6)}%` }} />
                        </div>
                        <span className="w-6 text-right text-surface-500 tabular-nums">{c.count}</span>
                      </div>
                    );
                  })}
                </div>
                {motivosNC.ejemplos.length > 0 && (
                  <div className="border-t border-surface-100 dark:border-surface-700 pt-2 space-y-1">
                    <p className="text-[10px] text-surface-400 uppercase tracking-wide">Ejemplos</p>
                    {motivosNC.ejemplos.map((e: any, i: number) => (
                      <p key={i} className="text-[11px] text-surface-500 dark:text-surface-400">
                        <span className="font-medium text-surface-600 dark:text-surface-300">{e.predio}</span> · {e.motivo}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
