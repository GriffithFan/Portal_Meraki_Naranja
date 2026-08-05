"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSession } from "@/hooks/useSession";
import { provinciaDeCodigo, PROVINCIAS_META, PROVINCIAS_ORDEN, type ProvinciaClave } from "@/lib/provincias";
import { estadoVentana, type VentanaEstado } from "@/lib/cronogramaVentana";

const MapView = dynamic(() => import("@/components/mapa/MapView"), { ssr: false });

/* eslint-disable @typescript-eslint/no-explicit-any */

const VENTANA_UI: { key: VentanaEstado; label: string; color: string }[] = [
  { key: "en_ventana", label: "En ventana", color: "#10b981" },
  { key: "por_vencer", label: "Por vencer", color: "#f59e0b" },
  { key: "vencido", label: "Vencidos", color: "#ef4444" },
  { key: "futuro", label: "Futuro", color: "#3b82f6" },
  { key: "sin_fechas", label: "Sin fechas", color: "#94a3b8" },
];

type ColorBy = "ventana" | "estado" | "tecnico" | "provincia";
const COLOR_BY_UI: { key: ColorBy; label: string }[] = [
  { key: "ventana", label: "Ventana" },
  { key: "estado", label: "Estado" },
  { key: "tecnico", label: "Asignado" },
  { key: "provincia", label: "Provincia" },
];

const SIN_ASIGNAR = "__sin__";

export default function PlanificacionMapaPage() {
  const { isAdmin, loading: sesLoading } = useSession();
  const [predios, setPredios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [prov, setProv] = useState<"todas" | ProvinciaClave>("todas");
  const [ciudad, setCiudad] = useState("todas");
  const [ventanas, setVentanas] = useState<Set<VentanaEstado>>(new Set(VENTANA_UI.map((v) => v.key)));
  const [estadoSel, setEstadoSel] = useState("todos");
  const [asignadoSel, setAsignadoSel] = useState("todos");
  const [lacrSel, setLacrSel] = useState("todos");
  const [colorBy, setColorBy] = useState<ColorBy>("ventana");

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/mapa", { credentials: "include", cache: "no-store" });
      if (res.ok) setPredios(await res.json());
    } catch { /* noop */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (isAdmin) cargar(); }, [isAdmin, cargar]);

  // Ciudades disponibles según la provincia elegida.
  const ciudades = useMemo(() => {
    const set = new Set<string>();
    for (const p of predios) {
      if (prov !== "todas" && provinciaDeCodigo(p.codigo) !== prov) continue;
      const c = (p.ciudad || "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [predios, prov]);

  const estadosDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const p of predios) { const n = p.estado?.nombre; if (n) set.add(n); }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [predios]);

  const asignadosDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const p of predios) for (const a of (p.asignaciones || [])) { const n = a.usuario?.nombre; if (n) set.add(n); }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [predios]);

  const toggleVentana = (k: VentanaEstado) => setVentanas((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  const filtrados = useMemo(() => {
    return predios.filter((p) => {
      if (prov !== "todas" && provinciaDeCodigo(p.codigo) !== prov) return false;
      if (ciudad !== "todas" && (p.ciudad || "").trim() !== ciudad) return false;
      if (!ventanas.has(estadoVentana(p.fechaDesde, p.fechaHasta).estado)) return false;
      if (estadoSel !== "todos" && (p.estado?.nombre || "") !== estadoSel) return false;
      const asigs = p.asignaciones || [];
      if (asignadoSel === SIN_ASIGNAR) { if (asigs.length > 0) return false; }
      else if (asignadoSel !== "todos" && !asigs.some((a: any) => a.usuario?.nombre === asignadoSel)) return false;
      if (lacrSel !== "todos") {
        const l = (p.lacR || "").toUpperCase();
        if (lacrSel === "SI" ? l !== "SI" : l === "SI") return false;
      }
      return true;
    });
  }, [predios, prov, ciudad, ventanas, estadoSel, asignadoSel, lacrSel]);

  const conteos = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of filtrados) { const e = estadoVentana(p.fechaDesde, p.fechaHasta).estado; c[e] = (c[e] || 0) + 1; }
    return c;
  }, [filtrados]);

  const hayFiltros = prov !== "todas" || ciudad !== "todas" || estadoSel !== "todos" || asignadoSel !== "todos" || lacrSel !== "todos" || ventanas.size !== VENTANA_UI.length;
  function limpiar() {
    setProv("todas"); setCiudad("todas"); setEstadoSel("todos"); setAsignadoSel("todos"); setLacrSel("todos");
    setVentanas(new Set(VENTANA_UI.map((v) => v.key)));
  }

  if (sesLoading) return <div className="flex justify-center py-24"><div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-200 border-t-primary-500" /></div>;
  if (!isAdmin) return <div className="py-24 text-center text-sm text-surface-400">Solo administradores.</div>;

  const selCls = "rounded-md border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-800 dark:text-surface-200 px-3 py-1.5 text-xs";

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up space-y-3 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 dark:text-surface-100">Mapa de planificación</h1>
          <p className="text-xs text-surface-400">{filtrados.length} predios en el mapa{predios.length ? ` · de ${predios.length} con GPS` : ""}</p>
        </div>
        <Link href="/dashboard/planificacion" className="rounded-md border border-surface-200 bg-white px-3 py-2 text-xs font-medium text-surface-600 hover:bg-surface-50">← Volver a Planificación</Link>
      </div>

      {/* Filtros */}
      <div className="space-y-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={prov} onChange={(e) => { setProv(e.target.value as any); setCiudad("todas"); }} className={selCls}>
            <option value="todas">Todas las provincias</option>
            {PROVINCIAS_ORDEN.map((k) => <option key={k} value={k}>{PROVINCIAS_META[k].nombre}</option>)}
          </select>
          <select value={ciudad} onChange={(e) => setCiudad(e.target.value)} className={`${selCls} max-w-[220px]`}>
            <option value="todas">Todas las ciudades</option>
            {ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={estadoSel} onChange={(e) => setEstadoSel(e.target.value)} className={selCls}>
            <option value="todos">Todos los estados</option>
            {estadosDisponibles.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select value={asignadoSel} onChange={(e) => setAsignadoSel(e.target.value)} className={`${selCls} max-w-[200px]`}>
            <option value="todos">Todos los asignados</option>
            <option value={SIN_ASIGNAR}>Sin asignar</option>
            {asignadosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={lacrSel} onChange={(e) => setLacrSel(e.target.value)} className={selCls}>
            <option value="todos">LAC-R: todos</option>
            <option value="SI">LAC-R: Sí</option>
            <option value="NO">LAC-R: No</option>
          </select>
          {hayFiltros && (
            <button onClick={limpiar} className="rounded-md px-2.5 py-1.5 text-xs text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700">Limpiar</button>
          )}
        </div>

        {/* Chips de ventana (filtro + conteo) */}
        <div className="flex flex-wrap gap-1.5">
          {VENTANA_UI.map((v) => {
            const on = ventanas.has(v.key);
            return (
              <button key={v.key} onClick={() => toggleVentana(v.key)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${on ? "text-white" : "text-surface-500 bg-white dark:bg-surface-800"}`}
                style={on ? { background: v.color, borderColor: v.color } : { borderColor: v.color + "80" }}>
                <span className="h-2 w-2 rounded-full" style={{ background: on ? "#fff" : v.color }} />
                {v.label} <span className="tabular-nums opacity-80">{conteos[v.key] || 0}</span>
              </button>
            );
          })}
        </div>

        {/* Selector de coloreo del mapa */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-surface-100 dark:border-surface-700 pt-2">
          <span className="text-[11px] text-surface-400">Colorear por:</span>
          {COLOR_BY_UI.map((c) => (
            <button key={c.key} onClick={() => setColorBy(c.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${colorBy === c.key ? "bg-primary-600 text-white" : "text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700"}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-200 border-t-primary-500" /></div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-lg border border-surface-200 bg-white py-16 text-center text-sm text-surface-400">
          Sin predios con GPS para estos filtros.
        </div>
      ) : (
        <div className="h-[65vh] overflow-hidden rounded-xl border border-surface-200">
          <MapView predios={filtrados} colorBy={colorBy} />
        </div>
      )}
    </div>
  );
}
