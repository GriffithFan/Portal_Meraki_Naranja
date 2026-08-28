"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useSession";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Indicador semanal de técnicos activos en incidencias de mantenimiento.
 * Es el informe que se publica a dirección (Alberto / Fernando): acá se ve la
 * evolución, se descarga el Excel y se copia el texto del correo.
 */
export default function IndicadorPage() {
  const { isAdmin, loading: sesLoading } = useSession();
  const [datos, setDatos] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [semanas, setSemanas] = useState(3);
  const [bajando, setBajando] = useState(false);

  const cargar = useCallback(async (n: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kpi-mantenimiento?semanas=${n}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error();
      setDatos(await res.json());
    } catch {
      toast.error("No se pudo cargar el indicador");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) cargar(semanas); }, [isAdmin, semanas, cargar]);

  async function descargarExcel() {
    setBajando(true);
    try {
      const res = await fetch(`/api/kpi-mantenimiento?excel=1&semanas=${semanas}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Indicador_Tecnicos_Mantenimiento_${datos?.ultima?.desde || ""}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Excel descargado — adjuntalo al correo");
    } catch {
      toast.error("No se pudo generar el Excel");
    } finally {
      setBajando(false);
    }
  }

  async function copiarCorreo() {
    try {
      await navigator.clipboard.writeText(datos?.correo || "");
      toast.success("Texto del correo copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  if (sesLoading) return <div className="flex justify-center py-24"><div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-200 border-t-primary-500" /></div>;
  if (!isAdmin) return <div className="py-24 text-center text-sm text-surface-400">Solo administradores.</div>;

  const u = datos?.ultima;
  const sem: any[] = datos?.semanas || [];
  const tec: any[] = datos?.tecnicos || [];
  const maxInc = Math.max(1, ...sem.map((s) => s.incidencias));

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up space-y-4 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 dark:text-surface-100">Indicador semanal</h1>
          <p className="text-xs text-surface-400">
            Técnicos de pisos activos en incidencias de mantenimiento · se publica a dirección los viernes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={semanas} onChange={(e) => setSemanas(Number(e.target.value))}
            className="rounded-md border border-surface-200 bg-white px-3 py-2 text-xs dark:bg-surface-800 dark:text-surface-200 dark:border-surface-600">
            {[3, 4, 6, 8, 12].map((n) => <option key={n} value={n}>Últimas {n} semanas</option>)}
          </select>
          <button onClick={copiarCorreo} disabled={!datos}
            className="rounded-md border border-surface-200 bg-white px-3 py-2 text-xs font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-50">
            Copiar texto del correo
          </button>
          <button onClick={descargarExcel} disabled={bajando || !datos}
            className="rounded-md bg-primary-600 px-3 py-2 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50">
            {bajando ? "Generando…" : "Descargar Excel"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-200 border-t-primary-500" /></div>
      ) : !datos ? (
        <div className="rounded-lg border border-surface-200 bg-white py-16 text-center text-sm text-surface-400">Sin datos.</div>
      ) : (
        <>
          {/* Tarjetas */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { t: "Técnicos activos", v: u?.tecnicos, s: `semana del ${u?.etiqueta}` },
              { t: "Incidencias finalizadas", v: u?.incidencias, s: "última semana cerrada" },
              { t: "Total del período", v: datos.totalPeriodo, s: `${sem.length} semanas` },
            ].map((c) => (
              <div key={c.t} className="rounded-xl border border-surface-200 bg-white p-4 dark:bg-surface-800 dark:border-surface-700">
                <div className="text-[11px] uppercase tracking-wider text-surface-400">{c.t}</div>
                <div className="mt-1 text-3xl font-semibold text-primary-600 tabular-nums">{c.v ?? "—"}</div>
                <div className="text-[11px] text-surface-400">{c.s}</div>
              </div>
            ))}
          </div>

          {/* Evolución */}
          <div className="rounded-xl border border-surface-200 bg-white p-4 dark:bg-surface-800 dark:border-surface-700">
            <h2 className="mb-3 text-sm font-medium text-surface-700 dark:text-surface-200">Evolución semanal</h2>
            <div className="space-y-2">
              {sem.map((s) => (
                <div key={s.desde} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 text-xs text-surface-500 tabular-nums">{s.etiqueta}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded bg-surface-100 dark:bg-surface-700">
                    <div className="flex h-full items-center justify-end rounded bg-primary-500 pr-2 text-[11px] font-medium text-white transition-all"
                      style={{ width: `${Math.max(8, (s.incidencias / maxInc) * 100)}%` }}>
                      {s.incidencias}
                    </div>
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs text-surface-500">{s.tecnicos} técnicos</span>
                </div>
              ))}
            </div>
          </div>

          {/* Detalle por técnico */}
          <div className="overflow-x-auto rounded-xl border border-surface-200 bg-white dark:bg-surface-800 dark:border-surface-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-200 text-surface-400 dark:border-surface-700">
                  <th className="px-3 py-2 text-left font-medium">TH</th>
                  <th className="px-3 py-2 text-left font-medium">Técnico</th>
                  {sem.map((s) => <th key={s.desde} className="px-3 py-2 text-center font-medium tabular-nums">{s.etiqueta}</th>)}
                  <th className="px-3 py-2 text-center font-medium">Total</th>
                  <th className="px-3 py-2 text-center font-medium">Prom.</th>
                </tr>
              </thead>
              <tbody>
                {tec.map((t) => {
                  const vals = sem.map((s) => t.porSemana[s.desde] || 0);
                  const ini = vals[0], fin = vals[vals.length - 1];
                  const sube = ini && fin && fin > ini, baja = ini && fin && fin < ini;
                  return (
                    <tr key={t.nombre} className="border-b border-surface-50 hover:bg-surface-50 dark:border-surface-700/50 dark:hover:bg-surface-700/40">
                      <td className="px-3 py-1.5 text-surface-400 tabular-nums">{t.thNumero ? `TH${String(t.thNumero).padStart(2, "0")}` : ""}</td>
                      <td className="px-3 py-1.5 font-medium text-surface-700 dark:text-surface-200">{t.nombre}</td>
                      {vals.map((v, i) => (
                        <td key={i} className={`px-3 py-1.5 text-center tabular-nums ${i === vals.length - 1 && sube ? "font-semibold text-emerald-600" : i === vals.length - 1 && baja ? "text-red-500" : "text-surface-600 dark:text-surface-300"}`}>
                          {v || "·"}
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-center font-semibold text-primary-600 tabular-nums">{t.total}</td>
                      <td className="px-3 py-1.5 text-center text-surface-500 tabular-nums">{t.promedio}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-surface-50 font-medium dark:bg-surface-700/50">
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-surface-700 dark:text-surface-200">Total</td>
                  {sem.map((s) => <td key={s.desde} className="px-3 py-2 text-center tabular-nums text-surface-700 dark:text-surface-200">{s.incidencias}</td>)}
                  <td className="px-3 py-2 text-center tabular-nums text-primary-600">{datos.totalPeriodo}</td>
                  <td />
                </tr>
                <tr className="text-surface-500">
                  <td className="px-3 py-1.5" />
                  <td className="px-3 py-1.5">Técnicos activos</td>
                  {sem.map((s) => <td key={s.desde} className="px-3 py-1.5 text-center tabular-nums">{s.tecnicos}</td>)}
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Conformidad y NC: por semana, por zona y por técnico. Es otra medida que el
              indicador de arriba (que cuenta técnicos activos en mantenimiento): acá se
              sigue a los predios trabajados en cada semana hasta su desenlace. */}
          <TablaDesenlace
            titulo="Conformidad por semana"
            ayuda="A cada predio se le imputa la semana en que se trabajó, con el resultado que terminó teniendo. El % de NC se calcula sobre lo ya revisado."
            filas={sem.map((x: any) => ({ nombre: x.etiqueta, d: x }))}
            total={datos.volumenTotal}
          />
          <TablaDesenlace
            titulo="Conformidad por zona"
            ayuda="Acumulado del período por provincia."
            filas={(datos.volumenZonas || []).map((z: any) => ({ nombre: z.zona, d: z }))}
            total={datos.volumenTotal}
          />
          <TablaDesenlace
            titulo="Conformidad por técnico"
            ayuda="Acumulado del período. Con menos de 3 predios revisados el porcentaje no se muestra: un solo NC lo mueve demasiado."
            filas={(datos.volumenTecnicos || []).map((t: any) => ({
              nombre: t.thNumero ? `TH${String(t.thNumero).padStart(2, "0")} · ${t.nombre}` : t.nombre,
              d: t.total,
            }))}
            total={datos.volumenTotal}
            minRevisados={3}
          />

          {/* Texto del correo */}
          <div className="rounded-xl border border-surface-200 bg-white p-4 dark:bg-surface-800 dark:border-surface-700">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium text-surface-700 dark:text-surface-200">Texto para el correo</h2>
              <button onClick={copiarCorreo} className="text-xs font-medium text-primary-600 hover:underline">Copiar</button>
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-50 p-3 text-[11px] leading-relaxed text-surface-700 dark:bg-surface-900 dark:text-surface-300">
{datos.correo}
            </pre>
          </div>

          <p className="text-[11px] text-surface-400">
            Se genera solo los viernes a las 17:30. Se contabiliza al técnico que cerró al menos una incidencia de
            mantenimiento en la semana operativa (sábado a viernes).
          </p>
        </>
      )}
    </div>
  );
}

/** NC sobre lo REVISADO (no sobre lo realizado): lo pendiente no es culpa de nadie. */
function tasaNc(d: { conformes: number; noConformes: number }): number | null {
  const rev = d.conformes + d.noConformes;
  return rev > 0 ? Math.round((d.noConformes / rev) * 1000) / 10 : null;
}

function TablaDesenlace({
  titulo, ayuda, filas, total, minRevisados = 0,
}: {
  titulo: string;
  ayuda: string;
  filas: Array<{ nombre: string; d: any }>;
  total: any;
  /** Debajo de este umbral se muestra el conteo pero no el porcentaje. */
  minRevisados?: number;
}) {
  if (!filas.length) return null;
  const celda = (d: any) => {
    const t = tasaNc(d);
    const rev = (d.conformes || 0) + (d.noConformes || 0);
    if (t === null || rev < minRevisados) return <span className="text-surface-300">—</span>;
    const color = t <= 10 ? "text-emerald-600" : t <= 20 ? "text-amber-600" : "text-red-600";
    return <span className={`font-semibold ${color}`}>{t}%</span>;
  };
  return (
    <div className="overflow-hidden rounded-xl border border-surface-200 bg-white dark:bg-surface-800 dark:border-surface-700">
      <div className="border-b border-surface-100 px-4 py-3 dark:border-surface-700">
        <h2 className="text-sm font-medium text-surface-700 dark:text-surface-200">{titulo}</h2>
        <p className="mt-0.5 text-[11px] text-surface-400">{ayuda}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-xs">
          <thead className="bg-surface-50 text-surface-500 dark:bg-surface-900/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Nombre</th>
              <th className="px-3 py-2 text-center font-medium">Realizados</th>
              <th className="px-3 py-2 text-center font-medium">Conformes</th>
              <th className="px-3 py-2 text-center font-medium">No conformes</th>
              <th className="px-3 py-2 text-center font-medium">Sin revisar</th>
              <th className="px-3 py-2 text-center font-medium">% NC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
            {filas.map((f) => (
              <tr key={f.nombre}>
                <td className="px-3 py-2 text-surface-700 dark:text-surface-200">{f.nombre}</td>
                <td className="px-3 py-2 text-center tabular-nums">{f.d.realizados || "·"}</td>
                <td className="px-3 py-2 text-center tabular-nums text-emerald-600">{f.d.conformes || "·"}</td>
                <td className="px-3 py-2 text-center tabular-nums text-red-500">{f.d.noConformes || "·"}</td>
                <td className="px-3 py-2 text-center tabular-nums text-surface-400">{f.d.sinRevisar || "·"}</td>
                <td className="px-3 py-2 text-center tabular-nums">{celda(f.d)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-surface-50 font-medium dark:bg-surface-900/40">
            <tr>
              <td className="px-3 py-2 text-surface-700 dark:text-surface-200">Total</td>
              <td className="px-3 py-2 text-center tabular-nums">{total?.realizados ?? 0}</td>
              <td className="px-3 py-2 text-center tabular-nums text-emerald-600">{total?.conformes ?? 0}</td>
              <td className="px-3 py-2 text-center tabular-nums text-red-500">{total?.noConformes ?? 0}</td>
              <td className="px-3 py-2 text-center tabular-nums text-surface-400">{total?.sinRevisar ?? 0}</td>
              <td className="px-3 py-2 text-center tabular-nums">{total ? celda(total) : null}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
