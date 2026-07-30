"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { fetchJson, mensajeError } from "@/lib/fetchJson";
import { toast } from "sonner";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Ventana { sin_fechas: number; futuro: number; en_ventana: number; por_vencer: number; vencido: number }
interface Provincia extends Ventana { clave: string; nombre: string; corto: string; objetivoLabel: string }
interface Tecnico {
  id: string; nombre: string; tecnicoActivo: boolean; tecnicoDesde: string | null;
  provincia: string; provinciaNombre: string; objetivo: number; esNuevo: boolean; semanaRamp: number | null;
  conformesSemana: number; ncSemana: number; conformidadPct: number | null; maxSemana: number;
  conformesPorSemana: number[]; predios: number; semaforo: string;
}
interface Ciudad { ciudad: string; provinciaCorto: string; en_ventana: number; por_vencer: number; vencido: number; futuro: number; sin_fechas: number; total: number }
interface TodosTec { id: string; nombre: string; email: string; activo: boolean; tecnicoActivo: boolean; tecnicoDesde: string | null }
interface Data {
  objetivoConformes: number; conformidadPct: number; conformesSemanaGlobal: number;
  ventanaGlobal: Ventana; porVencerHoyMan: number;
  provincias: Provincia[];
  capacidad: { tecnicosActivos: number; capacidadSemanal: number; mejorMaxSemana: number; objetivo: number; gap: number };
  pedidos: { conformidadPct: number; metaSemanal: number; visitasSemana: number; visitas2Semanas: number; enPipeline: number; pedir2Semanas: number; pedirEstaSemana: number; enVentana: number; porVencer: number; vencidos: number };
  ciudades: Ciudad[];
  tecnicos: Tecnico[];
  todosTecnicos: TodosTec[];
}

const SEMAFORO: Record<string, string> = { verde: "bg-emerald-500", amarillo: "bg-amber-400", rojo: "bg-red-500" };

function Spark({ values }: { values: number[] }) {
  if (!values?.length) return null;
  const w = 84, h = 22, max = Math.max(...values, 1);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={pts} fill="none" stroke="#10b981" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function PlanificacionPage() {
  const { isAdmin, loading: sesLoading } = useSession();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [gestion, setGestion] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const d = await fetchJson<Data>("/api/planificacion");
      setData(d);
    } catch (e) { toast.error(mensajeError(e, "No se pudo cargar")); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isAdmin) cargar(); }, [isAdmin, cargar]);

  const patch = async (userId: string, body: any) => {
    setSavingId(userId);
    try {
      await fetchJson("/api/planificacion", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, ...body }) });
      await cargar();
    } catch (e) { toast.error(mensajeError(e, "No se pudo guardar")); }
    finally { setSavingId(null); }
  };

  if (sesLoading || loading) return <div className="flex justify-center py-24"><div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-200 border-t-primary-500" /></div>;
  if (!isAdmin) return <div className="py-24 text-center text-sm text-surface-400">Solo administradores.</div>;
  if (!data) return null;

  const v = data.ventanaGlobal;
  const p = data.pedidos;
  const cap = data.capacidad;

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up space-y-5 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800">Planificación de cronogramas</h1>
          <p className="text-xs text-surface-400">Ventana DESDE–HASTA · objetivo {data.objetivoConformes} conformes/sem · conformidad ~{data.conformidadPct}% · {data.conformesSemanaGlobal} conformes esta semana</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/dashboard/planificacion/mapa" className="inline-flex items-center gap-1.5 rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-medium text-primary-700 hover:bg-primary-100">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" /></svg>
            Ver mapa
          </a>
          <button onClick={cargar} className="rounded-md border border-surface-200 bg-white px-3 py-2 text-xs font-medium text-surface-600 hover:bg-surface-50">Actualizar</button>
        </div>
      </div>

      {/* Ventana global */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card label="En ventana" value={v.en_ventana} tone="emerald" hint="Visitables ahora" />
        <Card label="Por vencer" value={v.por_vencer} tone="amber" hint={`${data.porVencerHoyMan} vencen hoy/mañana`} />
        <Card label="Vencidos" value={v.vencido} tone="red" hint="Re-pedir cronograma" />
        <Card label="Futuro" value={v.futuro} tone="blue" hint="Ya pedidos, abren pronto" />
        <Card label="Sin fechas" value={v.sin_fechas} tone="slate" hint="Enriquecer para clasificar" />
      </div>

      {/* Capacidad + pedidos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-surface-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-surface-800">Capacidad vs objetivo</h2>
          <div className="mt-3 space-y-2 text-sm">
            <Row k="Técnicos activos" val={cap.tecnicosActivos} />
            <Row k="Capacidad estimada / semana" val={`~${cap.capacidadSemanal}`} sub="suma de objetivos por zona" />
            <Row k="Pico del mejor técnico" val={cap.mejorMaxSemana || "—"} sub="máx conformes en una semana" />
            <Row k="Objetivo" val={cap.objetivo} />
            <div className="mt-2 border-t border-surface-100 pt-2">
              <Row k={cap.gap > 0 ? "Falta para el objetivo" : "Sobre el objetivo"} val={`${cap.gap > 0 ? "" : "+"}${Math.abs(cap.gap)}`} tone={cap.gap > 0 ? "red" : "emerald"} />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <h2 className="text-sm font-semibold text-surface-800">¿Cuántos cronogramas pedir? <span className="text-[11px] font-normal text-surface-500">(tanda para 2 semanas)</span></h2>
          <p className="mt-2 text-3xl font-bold text-amber-700 tabular-nums">≈ {p.pedir2Semanas}</p>
          <p className="mt-1 text-[11px] text-surface-500">
            Los cronogramas nuevos tardan ~14 días, por eso se pide en <b>tandas para 2 semanas</b>. 2 sem de producción = ~{p.metaSemanal * 2} conformes → ~{p.visitas2Semanas} visitas (a {p.conformidadPct}% de conformidad) − ya en pipeline <b>{p.enPipeline}</b>.
          </p>
          <p className="mt-1 text-[11px] text-surface-400">Reposición semanal aproximada: ≈ {p.pedirEstaSemana}.</p>
          {p.pedir2Semanas === 0 && (
            <p className="mt-2 rounded-md bg-white/70 px-2 py-1.5 text-[11px] text-amber-800">Tenés pipeline de sobra para 2 semanas: no pidas en masa, enfocá en <b>visitar por HASTA</b> antes de que venzan.</p>
          )}
        </section>
      </div>

      {/* Por provincia */}
      <section className="rounded-xl border border-surface-200 bg-white overflow-hidden">
        <div className="border-b border-surface-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-surface-800">Por provincia (código: 6=BA · 8=SF · 3=ER)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-surface-100 text-[10px] uppercase tracking-wide text-surface-400">
                <th className="px-4 py-2 text-left font-semibold">Provincia</th>
                <th className="px-2 py-2 text-center font-semibold">Objetivo/téc</th>
                <th className="px-2 py-2 text-center font-semibold text-emerald-600">En ventana</th>
                <th className="px-2 py-2 text-center font-semibold text-amber-600">Por vencer</th>
                <th className="px-2 py-2 text-center font-semibold text-red-500">Vencidos</th>
                <th className="px-2 py-2 text-center font-semibold text-blue-500">Futuro</th>
                <th className="px-2 py-2 text-center font-semibold text-surface-400">Sin fechas</th>
              </tr>
            </thead>
            <tbody>
              {data.provincias.map((pr) => (
                <tr key={pr.clave} className="border-b border-surface-50 last:border-0">
                  <td className="px-4 py-2 font-medium text-surface-800">{pr.nombre}</td>
                  <td className="px-2 py-2 text-center text-surface-500">{pr.objetivoLabel}</td>
                  <td className="px-2 py-2 text-center font-semibold tabular-nums text-emerald-600">{pr.en_ventana}</td>
                  <td className="px-2 py-2 text-center font-semibold tabular-nums text-amber-600">{pr.por_vencer}</td>
                  <td className="px-2 py-2 text-center font-semibold tabular-nums text-red-500">{pr.vencido}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-blue-500">{pr.futuro}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-surface-400">{pr.sin_fechas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Por ciudad / zona (para organizar los pedidos por recorrido) */}
      {data.ciudades && data.ciudades.length > 0 && (
        <section className="rounded-xl border border-surface-200 bg-white overflow-hidden">
          <div className="border-b border-surface-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-surface-800">Por ciudad / zona <span className="text-surface-400 font-normal">(top {data.ciudades.length}, para ordenar los pedidos por recorrido)</span></h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-surface-100 text-[10px] uppercase tracking-wide text-surface-400">
                  <th className="px-4 py-2 text-left font-semibold">Ciudad</th>
                  <th className="px-2 py-2 text-center font-semibold">Prov.</th>
                  <th className="px-2 py-2 text-center font-semibold text-emerald-600">En ventana</th>
                  <th className="px-2 py-2 text-center font-semibold text-amber-600">Por vencer</th>
                  <th className="px-2 py-2 text-center font-semibold text-red-500">Vencidos</th>
                  <th className="px-2 py-2 text-center font-semibold text-blue-500">Futuro</th>
                  <th className="px-2 py-2 text-center font-semibold text-surface-400">Sin fechas</th>
                  <th className="px-2 py-2 text-center font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.ciudades.map((c) => (
                  <tr key={c.ciudad} className="border-b border-surface-50 last:border-0 hover:bg-surface-50/50">
                    <td className="px-4 py-2 font-medium text-surface-800 truncate max-w-[220px]">{c.ciudad}</td>
                    <td className="px-2 py-2 text-center text-surface-400">{c.provinciaCorto}</td>
                    <td className="px-2 py-2 text-center font-semibold tabular-nums text-emerald-600">{c.en_ventana || ""}</td>
                    <td className="px-2 py-2 text-center font-semibold tabular-nums text-amber-600">{c.por_vencer || ""}</td>
                    <td className="px-2 py-2 text-center font-semibold tabular-nums text-red-500">{c.vencido || ""}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-blue-500">{c.futuro || ""}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-surface-400">{c.sin_fechas || ""}</td>
                    <td className="px-2 py-2 text-center tabular-nums font-semibold text-surface-700">{c.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Técnicos activos */}
      <section className="rounded-xl border border-surface-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-surface-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-surface-800">Técnicos activos <span className="text-surface-400 font-normal">({data.tecnicos.filter(t=>t.tecnicoActivo).length})</span></h2>
          <button onClick={() => setGestion((g) => !g)} className="rounded-md border border-surface-200 px-2.5 py-1 text-[11px] font-medium text-surface-600 hover:bg-surface-50">{gestion ? "Cerrar gestión" : "Gestionar técnicos"}</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-surface-100 text-[10px] uppercase tracking-wide text-surface-400">
                <th className="px-4 py-2 text-left font-semibold">Técnico</th>
                <th className="px-2 py-2 text-center font-semibold">Zona</th>
                <th className="px-2 py-2 text-center font-semibold">Objetivo</th>
                <th className="px-2 py-2 text-center font-semibold">Conf. sem</th>
                <th className="px-2 py-2 text-center font-semibold">NC</th>
                <th className="px-2 py-2 text-center font-semibold">% Conf</th>
                <th className="px-2 py-2 text-center font-semibold">Máx</th>
                <th className="px-2 py-2 text-center font-semibold">Tendencia</th>
                <th className="px-2 py-2 text-center font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.tecnicos.filter((t) => t.tecnicoActivo).map((t) => (
                <tr key={t.id} className="border-b border-surface-50 last:border-0 hover:bg-surface-50/50">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-surface-800">{t.nombre}</span>
                      {t.esNuevo && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700" title={`Nuevo · semana ${t.semanaRamp} de ramp`}>NUEVO S{t.semanaRamp}</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center text-surface-500">{t.provinciaNombre}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-surface-600">{t.objetivo}</td>
                  <td className="px-2 py-2 text-center"><span className={`font-semibold tabular-nums ${t.conformesSemana >= t.objetivo ? "text-emerald-600" : "text-surface-700"}`}>{t.conformesSemana}</span></td>
                  <td className="px-2 py-2 text-center tabular-nums text-red-500">{t.ncSemana || ""}</td>
                  <td className="px-2 py-2 text-center tabular-nums"><span className={t.conformidadPct == null ? "text-surface-300" : t.conformidadPct >= 85 ? "text-emerald-600" : t.conformidadPct >= 70 ? "text-amber-600" : "text-red-500"}>{t.conformidadPct == null ? "—" : `${t.conformidadPct}%`}</span></td>
                  <td className="px-2 py-2 text-center tabular-nums text-surface-500">{t.maxSemana || "—"}</td>
                  <td className="px-2 py-2"><div className="flex justify-center"><Spark values={t.conformesPorSemana} /></div></td>
                  <td className="px-2 py-2"><div className="flex justify-center"><span className={`h-3 w-3 rounded-full ${SEMAFORO[t.semaforo]}`} title={t.semaforo} /></div></td>
                </tr>
              ))}
              {data.tecnicos.filter((t) => t.tecnicoActivo).length === 0 && (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-xs text-surface-400">No hay técnicos marcados como activos. Usá &quot;Gestionar técnicos&quot;.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Panel de gestión */}
        {gestion && (
          <div className="border-t border-surface-200 bg-surface-50/50 p-4">
            <p className="mb-2 text-[11px] text-surface-500">Marcá los técnicos que <b>trabajan hoy</b> (los demás se conservan para estadística). Para un técnico <b>nuevo</b>, poné su <b>fecha de inicio productivo</b> para evaluar el ramp (6+ 1ª semana, 7+ desde la 2ª).</p>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-surface-200 bg-white divide-y divide-surface-100">
              {data.todosTecnicos.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <label className="flex flex-1 min-w-[160px] items-center gap-2">
                    <input type="checkbox" checked={t.tecnicoActivo} disabled={savingId === t.id} onChange={(e) => patch(t.id, { tecnicoActivo: e.target.checked })} className="h-4 w-4 accent-primary-600" />
                    <span className="text-sm text-surface-800">{t.nombre}</span>
                    {!t.activo && <span className="text-[9px] text-surface-400">(cuenta inactiva)</span>}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-surface-400">Inicio productivo:</span>
                    <input
                      type="date"
                      value={t.tecnicoDesde ? t.tecnicoDesde.slice(0, 10) : ""}
                      disabled={savingId === t.id}
                      onChange={(e) => patch(t.id, { tecnicoDesde: e.target.value || null })}
                      className="rounded border border-surface-200 px-2 py-1 text-xs"
                    />
                    {t.tecnicoDesde && <button onClick={() => patch(t.id, { tecnicoDesde: null })} className="text-[10px] text-surface-400 hover:text-red-500" title="Quitar fecha">✕</button>}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-surface-400">¿Falta un técnico nuevo sin cuenta? Creá su usuario en <b>Administración → Usuarios</b> (rol Técnico) y después marcalo acá.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ label, value, tone, hint }: { label: string; value: number; tone: string; hint?: string }) {
  const color: Record<string, string> = { emerald: "text-emerald-600", amber: "text-amber-600", red: "text-red-600", blue: "text-blue-600", slate: "text-surface-500" };
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-surface-400">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold tabular-nums ${color[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-surface-400">{hint}</p>}
    </div>
  );
}

function Row({ k, val, sub, tone }: { k: string; val: any; sub?: string; tone?: string }) {
  const color = tone === "red" ? "text-red-600" : tone === "emerald" ? "text-emerald-600" : "text-surface-800";
  return (
    <div className="flex items-center justify-between">
      <span className="text-surface-500">{k}{sub && <span className="ml-1 text-[10px] text-surface-400">· {sub}</span>}</span>
      <span className={`font-semibold tabular-nums ${color}`}>{val}</span>
    </div>
  );
}
