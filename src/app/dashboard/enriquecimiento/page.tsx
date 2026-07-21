"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSession } from "@/hooks/useSession";
import { useConfirm } from "@/contexts/ConfirmContext";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Opciones {
  espacios: { id: string; nombre: string; parentId: string | null }[];
  estados: { id: string; nombre: string }[];
  tecnicos: { id: string; nombre: string }[];
  provincias: string[];
}

interface Conteos {
  prediosEnAlcance: number;
  conIncidencia: number;
  sinIncidencia: number;
  conforme: number;
  yaEnriquecidos: number;
  efectivos: number;
}

// Ordena los espacios como árbol con sangría por profundidad.
function ordenarArbol(espacios: Opciones["espacios"]): { id: string; label: string }[] {
  const hijos = new Map<string | null, Opciones["espacios"]>();
  for (const e of espacios) {
    const arr = hijos.get(e.parentId ?? null) || [];
    arr.push(e);
    hijos.set(e.parentId ?? null, arr);
  }
  const out: { id: string; label: string }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const e of hijos.get(parentId) || []) {
      out.push({ id: e.id, label: `${"  ".repeat(depth)}${depth > 0 ? "└ " : ""}${e.nombre}` });
      walk(e.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

// Etiquetas legibles para el detalle por campo del resumen.
const CAMPO_LABELS: Record<string, string> = {
  ciudad: "Departamento", nombreInstitucion: "Institución", cuePredio: "CUE del predio",
  telefono: "Teléfono", lab: "Proveedor LAB", labPlaceholder: "LAB (reemplazo)",
  ambito: "Ámbito", gpsPredio: "GPS", latlong: "Lat / Long",
  fechaDesde: "Fecha DESDE", fechaHasta: "Fecha HASTA",
  aps: "Cant. APs", utm: "Cant. UTM", switch: "Cant. Switch", z3: "Cant. Z3",
  notas: "Notas / comentarios", lacRSi: "LAC-R → SI", lacRNo: "LAC-R → NO",
};

export default function EnriquecimientoPage() {
  const { session } = useSession();
  const confirm = useConfirm();
  const esAdmin = session?.rol === "ADMIN";

  const [opciones, setOpciones] = useState<Opciones | null>(null);
  const [espacioId, setEspacioId] = useState("");
  const [incluyeSubcarpetas, setIncluyeSubcarpetas] = useState(true);
  const [estadosSel, setEstadosSel] = useState<string[]>([]);
  const [provincia, setProvincia] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [tecnicoId, setTecnicoId] = useState("");
  // Por defecto se enriquecen TODOS los predios del alcance (menos CONFORME), incluidos
  // los ya enriquecidos, para refrescar fechas de cronograma. El toggle solo permite
  // opcionalmente saltar los ya hechos (corrida más rápida).
  const [excluirYaEnriquecidos, setExcluirYaEnriquecidos] = useState(false);

  const [conteos, setConteos] = useState<Conteos | null>(null);
  const [cargandoConteos, setCargandoConteos] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [error, setError] = useState("");
  const [historial, setHistorial] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fase 2 (automático en el servidor)
  const [ejecJobId, setEjecJobId] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<any>(null);
  const [ejecResultado, setEjecResultado] = useState<any>(null);
  const [lanzando, setLanzando] = useState(false);

  const alcance = useMemo(
    () => ({
      espacioId: espacioId || null,
      incluyeSubcarpetas,
      filtros: {
        estados: estadosSel,
        provincia: provincia || undefined,
        ciudad: ciudad.trim() || undefined,
        tecnicoId: tecnicoId || undefined,
      },
      excluirYaEnriquecidos,
      excluirConforme: true, // CONFORME siempre excluido (nunca se enriquece)
    }),
    [espacioId, incluyeSubcarpetas, estadosSel, provincia, ciudad, tecnicoId, excluirYaEnriquecidos]
  );

  const cargarHistorial = useCallback(async () => {
    const res = await fetch("/api/enriquecimiento", { credentials: "include" });
    if (!res.ok) return;
    const jobs = (await res.json()).jobs || [];
    setHistorial(jobs);
    // Retomar una corrida EN CURSO para poder ver el progreso desde cualquier
    // pestaña o al reabrir la página (el trabajo corre en el servidor, no acá).
    const enCurso = jobs.find((j: any) => j.estado === "EJECUTANDO");
    if (enCurso) {
      setEjecJobId(enCurso.id);
      setProgreso((prev: any) => prev || enCurso.resumen?.progreso || { fase: "En curso", hechos: 0, total: 0 });
    }
  }, []);

  useEffect(() => {
    if (!esAdmin) return;
    fetch("/api/enriquecimiento/opciones", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOpciones(d));
    cargarHistorial();
  }, [esAdmin, cargarHistorial]);

  // Recalcular conteos cuando cambia el alcance (con debounce).
  useEffect(() => {
    if (!esAdmin) return;
    setCargandoConteos(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/enriquecimiento/resolver-alcance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(alcance),
        });
        if (res.ok) setConteos(await res.json());
      } finally {
        setCargandoConteos(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [alcance, esAdmin]);

  const generarEntrada = async () => {
    setError("");
    setGenerando(true);
    setResultado(null);
    setPreview(null);
    try {
      const res = await fetch("/api/enriquecimiento/generar-entrada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(alcance),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "No se pudo generar el Excel");
        return;
      }
      const nuevoJobId = res.headers.get("X-Job-Id");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Entrada_Enriquecimiento_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (nuevoJobId) setJobId(nuevoJobId);
      cargarHistorial();
    } catch {
      setError("Error de conexión al generar el Excel");
    } finally {
      setGenerando(false);
    }
  };

  const previsualizar = async () => {
    if (!jobId || !archivo) return;
    setError("");
    setPreview(null);
    setResultado(null);
    const fd = new FormData();
    fd.append("file", archivo);
    const res = await fetch(`/api/enriquecimiento/${jobId}/previsualizar`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error || "Error al previsualizar"); return; }
    setPreview(d.resumen);
  };

  const aplicar = async () => {
    if (!jobId || !archivo || !preview) return;
    const ok = await confirm({
      title: "Aplicar enriquecimiento",
      message: `Se actualizarán ${preview.prediosAActualizar} predios. No se tocan estados ni asignados. ¿Continuar?`,
      confirmLabel: "Aplicar",
    });
    if (!ok) return;
    setError("");
    setAplicando(true);
    try {
      const fd = new FormData();
      fd.append("file", archivo);
      const res = await fetch(`/api/enriquecimiento/${jobId}/aplicar`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "Error al aplicar"); return; }
      setResultado(d);
      setPreview(null);
      cargarHistorial();
    } finally {
      setAplicando(false);
    }
  };

  const revertir = async (id: string) => {
    const ok = await confirm({
      title: "Revertir corrida",
      message: "Se restaurarán los valores anteriores de los predios de esta corrida. ¿Continuar?",
      confirmLabel: "Revertir",
    });
    if (!ok) return;
    const res = await fetch(`/api/enriquecimiento/${id}/revertir`, { method: "POST", credentials: "include" });
    if (res.ok) cargarHistorial();
    else setError("No se pudo revertir");
  };

  // ── Fase 2: enriquecer automáticamente en el servidor ──
  const enriquecerAhora = async () => {
    setError("");
    setEjecResultado(null);
    setProgreso(null);
    setLanzando(true);
    try {
      const res = await fetch("/api/enriquecimiento/ejecutar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(alcance),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "No se pudo iniciar el enriquecimiento"); return; }
      setEjecJobId(d.jobId);
      setProgreso({ fase: "En cola", hechos: 0, total: d.pares });
    } finally {
      setLanzando(false);
    }
  };

  // Polling del estado mientras corre.
  useEffect(() => {
    if (!ejecJobId) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/enriquecimiento/${ejecJobId}/estado`, { credentials: "include" });
      if (!res.ok) return;
      const j = await res.json();
      if (j.estado === "EJECUTANDO") {
        setProgreso(j.resumen?.progreso || null);
      } else if (j.estado === "APLICADO") {
        setEjecResultado(j.resumen);
        setProgreso(null);
        setEjecJobId(null);
        cargarHistorial();
      } else if (j.estado === "ERROR") {
        setError("La extracción falló: " + (j.resumen?.error || "error desconocido"));
        setProgreso(null);
        setEjecJobId(null);
        cargarHistorial();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [ejecJobId, cargarHistorial]);

  const espaciosArbol = useMemo(() => (opciones ? ordenarArbol(opciones.espacios) : []), [opciones]);

  // Errores/avisos a revisar tras una corrida (extracción + no verificados + LAC-R).
  const renderProblemas = (res: any) => {
    if (!res) return null;
    const erroresExt = res.erroresExtraccion || [];
    const sinVer = res.sinVerificarCodigos || [];
    if (erroresExt.length === 0 && sinVer.length === 0 && !res.lacRSi && !res.lacRNo) return null;
    return (
      <div className="mt-2 text-[11px] space-y-1">
        {res.lacRSi > 0 && <div className="text-surface-600">🏷️ {res.lacRSi} predio(s) marcados LAC-R = SI (cronograma vigente)</div>}
        {res.lacRNo > 0 && <div className="text-surface-600">🏷️ {res.lacRNo} predio(s) marcados LAC-R = NO (cronograma de 29+ días)</div>}
        {erroresExt.length > 0 && (
          <details className="text-red-700">
            <summary className="cursor-pointer">⚠ {erroresExt.length} error(es) de extracción en Salesforce</summary>
            <ul className="mt-1 ml-4 list-disc text-surface-600">
              {erroresExt.slice(0, 20).map((e: any, i: number) => (
                <li key={i}><b>{e.codigo || "—"}</b> {e.incidencia}: {e.error}</li>
              ))}
              {erroresExt.length > 20 && <li>…y {erroresExt.length - 20} más</li>}
            </ul>
          </details>
        )}
        {sinVer.length > 0 && (
          <details className="text-amber-700">
            <summary className="cursor-pointer">⚠ {res.sinVerificar} predio(s) no verificados en Salesforce (no se tocaron)</summary>
            <div className="mt-1 ml-4 text-surface-600 break-words">{sinVer.slice(0, 60).join(", ")}{sinVer.length > 60 ? "…" : ""}</div>
          </details>
        )}
      </div>
    );
  };

  // Detalle por campo como chips con etiquetas legibles (fechas y LAC-R primero).
  const renderResumenCampos = (res: any) => {
    const campos = res.detallePorCampo || {};
    const items = Object.entries(campos).filter(([, v]) => (v as number) > 0) as [string, number][];
    if (items.length === 0) return null;
    const orden = ["fechaDesde", "fechaHasta", "lacRSi", "lacRNo"];
    items.sort((a, b) => (orden.indexOf(a[0]) + 1 || 99) - (orden.indexOf(b[0]) + 1 || 99));
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map(([k, v]) => {
          const esClave = k.startsWith("lacR") || k.startsWith("fecha");
          return (
            <span key={k} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${esClave ? "bg-brand-100 text-brand-700 font-medium" : "bg-white border border-surface-200 text-surface-600"}`}>
              {CAMPO_LABELS[k] || k} <b>{v}</b>
            </span>
          );
        })}
      </div>
    );
  };

  if (!esAdmin) {
    return <div className="p-6 text-sm text-surface-500">Esta sección es solo para administradores.</div>;
  }

  return (
    <div className="animate-fade-in-up max-w-4xl mx-auto pb-10">
      {/* Encabezado */}
      <div className="flex items-start gap-3 mb-5">
        <div className="shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shadow-sm">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-semibold text-surface-800 leading-tight">Enriquecimiento de datos</h1>
          <p className="text-xs text-surface-400 mt-0.5 max-w-xl">
            Elegí un alcance y el servidor baja los datos actualizados de Salesforce y los aplica solo —
            fechas de cronograma, GPS, teléfono, LAC-R y más. <b>Nunca toca estados ni asignados</b>, y CONFORME queda intacto.
          </p>
        </div>
      </div>

      {error && <div className="mb-3 px-3 py-2 rounded-md bg-red-50 text-red-700 text-sm flex items-center gap-2"><span>⚠</span>{error}</div>}

      {/* Paso 1: alcance */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm p-4 sm:p-5 mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
          <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-[11px] flex items-center justify-center font-bold">1</span>
          Elegí el alcance
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-surface-500">
            Espacio / carpeta
            <select value={espacioId} onChange={(e) => setEspacioId(e.target.value)} className="mt-1 w-full px-2 py-1.5 border border-surface-200 rounded-md text-sm">
              <option value="">Todos los espacios</option>
              {espaciosArbol.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-surface-500 flex items-end gap-2 pb-1">
            <input type="checkbox" checked={incluyeSubcarpetas} onChange={(e) => setIncluyeSubcarpetas(e.target.checked)} />
            Incluir subcarpetas
          </label>
          <label className="text-xs text-surface-500">
            Provincia
            <select value={provincia} onChange={(e) => setProvincia(e.target.value)} className="mt-1 w-full px-2 py-1.5 border border-surface-200 rounded-md text-sm">
              <option value="">Todas</option>
              {opciones?.provincias.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-xs text-surface-500">
            Departamento / Ciudad
            <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="(exacto, opcional)" className="mt-1 w-full px-2 py-1.5 border border-surface-200 rounded-md text-sm" />
          </label>
          <label className="text-xs text-surface-500">
            Técnico asignado
            <select value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)} className="mt-1 w-full px-2 py-1.5 border border-surface-200 rounded-md text-sm">
              <option value="">Todos</option>
              {opciones?.tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </label>
          <div className="text-xs text-surface-500">
            Estados
            <div className="mt-1 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {opciones?.estados.map((e) => {
                const on = estadosSel.includes(e.id);
                return (
                  <button key={e.id} type="button"
                    onClick={() => setEstadosSel((prev) => on ? prev.filter((x) => x !== e.id) : [...prev, e.id])}
                    className={`px-2 py-0.5 rounded text-[11px] border ${on ? "bg-brand-50 border-brand-300 text-brand-700" : "border-surface-200 text-surface-500"}`}>
                    {e.nombre}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-surface-100">
          <span className="text-xs text-surface-500">Se enriquecen <b>todos</b> los estados del alcance. CONFORME nunca se enriquece.</span>
          <label className="text-xs text-surface-600 flex items-center gap-2">
            <input type="checkbox" checked={excluirYaEnriquecidos} onChange={(e) => setExcluirYaEnriquecidos(e.target.checked)} />
            Saltar los ya enriquecidos (más rápido, no refresca sus fechas)
          </label>
        </div>

        {/* Resumen del alcance en tarjetas */}
        {conteos && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { n: conteos.prediosEnAlcance, l: "en el alcance", big: false },
              { n: conteos.conIncidencia, l: "con incidencia", big: false },
              { n: conteos.conforme, l: "en CONFORME (intactos)", big: false },
              { n: conteos.efectivos, l: "se enriquecen", big: true },
            ].map((s, i) => (
              <div key={i} className={`rounded-lg px-3 py-2 ${s.big ? "bg-brand-50 border border-brand-200" : "bg-surface-50"}`}>
                <div className={`text-lg font-bold tabular-nums ${s.big ? "text-brand-700" : "text-surface-700"}`}>
                  {s.n}{s.big && cargandoConteos && <span className="text-xs font-normal text-surface-400"> …</span>}
                </div>
                <div className="text-[10px] text-surface-500 leading-tight">{s.l}</div>
              </div>
            ))}
          </div>
        )}
        {conteos && (conteos.sinIncidencia > 0 || conteos.yaEnriquecidos > 0) && (
          <div className="mt-2 text-[11px] text-surface-400">
            {conteos.sinIncidencia > 0 && <>{conteos.sinIncidencia} sin incidencia (no enriquecibles). </>}
            {conteos.yaEnriquecidos > 0 && <>{conteos.yaEnriquecidos} ya enriquecidos {excluirYaEnriquecidos ? "(se saltean)" : "(se refrescan)"}.</>}
          </div>
        )}

        {/* Acción principal */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <button onClick={enriquecerAhora} disabled={lanzando || !!ejecJobId || !conteos || conteos.efectivos === 0}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-green-700 active:scale-[.98] transition shadow-sm">
            {ejecJobId ? (<><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Enriqueciendo…</>)
              : lanzando ? "Iniciando…"
              : <>🚀 Enriquecer ahora{conteos ? ` · ${conteos.efectivos}` : ""}</>}
          </button>
          <span className="text-[11px] text-surface-400">Corre en el servidor: podés cerrar la pestaña, sigue solo.</span>
        </div>

        {/* Progreso */}
        {progreso && (() => {
          const pct = progreso.total ? Math.round((progreso.hechos / progreso.total) * 100) : null;
          return (
            <div className="mt-4 bg-surface-50 rounded-lg px-3 py-3 border border-surface-100">
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="font-medium text-surface-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />{progreso.fase}…
                </span>
                <span className="text-surface-500 tabular-nums">
                  {progreso.total ? `${progreso.hechos}/${progreso.total}` : ""}{pct != null && ` · ${pct}%`}
                </span>
              </div>
              <div className="h-2 bg-surface-200 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 transition-all duration-500" style={{ width: pct != null ? `${Math.max(pct, 3)}%` : "12%" }} />
              </div>
            </div>
          );
        })()}

        {/* Resultado */}
        {ejecResultado && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-green-800">
              <span className="w-5 h-5 rounded-full bg-green-600 text-white flex items-center justify-center text-xs">✓</span>
              Aplicado a {ejecResultado.prediosAActualizar} predios
            </div>
            {renderResumenCampos(ejecResultado)}
            {(ejecResultado.gpsOmitido?.length > 0 || ejecResultado.conflictos?.length > 0) && (
              <div className="mt-2 text-[11px] text-surface-500">
                {ejecResultado.gpsOmitido?.length > 0 && <span>ℹ {ejecResultado.gpsOmitido.length} con GPS dudoso (se enriqueció el resto). </span>}
                {ejecResultado.conflictos?.length > 0 && <span className="text-amber-700">⚠ {ejecResultado.conflictos.length} con departamento distinto (salteados).</span>}
              </div>
            )}
            {renderProblemas(ejecResultado)}
          </div>
        )}

        {/* Alternativa manual (avanzado) */}
        <details className="mt-4">
          <summary className="text-[11px] text-surface-400 cursor-pointer hover:text-surface-600 select-none">
            ⚙ Alternativa avanzada: generar el Excel y correr el extractor a mano
          </summary>
          <button onClick={generarEntrada} disabled={generando || !conteos || conteos.efectivos === 0}
            className="mt-2 px-3 py-1.5 bg-surface-100 text-surface-700 rounded-md text-sm font-medium disabled:opacity-50 hover:bg-surface-200 transition-colors">
            {generando ? "Generando…" : "Generar Excel de entrada"}
          </button>
        </details>
      </div>

      {/* Paso 2: subir resultado (flujo manual) */}
      <div className={`bg-white rounded-xl border border-surface-200 shadow-sm p-4 sm:p-5 mb-4 ${!jobId ? "opacity-60" : ""}`}>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-surface-700 mb-3">
          <span className="w-5 h-5 rounded-full bg-surface-200 text-surface-600 text-[11px] flex items-center justify-center font-bold">2</span>
          Subí el resultado del extractor <span className="text-[10px] font-normal text-surface-400">(solo flujo manual)</span>
        </h2>
        {!jobId ? <p className="text-xs text-surface-400">Este paso es solo para el flujo manual. Con &quot;Enriquecer ahora&quot; no hace falta.</p> : (
        <>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={(e) => { setArchivo(e.target.files?.[0] || null); setPreview(null); setResultado(null); }}
            className="text-xs file:mr-2 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-surface-100 file:text-surface-700 file:text-xs file:font-medium hover:file:bg-surface-200 file:cursor-pointer" />
          <button onClick={previsualizar} disabled={!archivo}
            className="px-3 py-1.5 bg-surface-100 text-surface-700 rounded-md text-sm font-medium disabled:opacity-50 hover:bg-surface-200 transition-colors">
            Previsualizar
          </button>
        </div>

        {preview && (
          <div className="mt-3 rounded-lg border border-surface-200 bg-surface-50 p-3">
            <div className="text-xs font-medium text-surface-700 mb-1">Se actualizarían <b>{preview.prediosAActualizar}</b> predios:</div>
            {renderResumenCampos(preview)}
            <div className="mt-2 text-[11px] text-surface-500 space-y-0.5">
              {preview.conflictos?.length > 0 && <div className="text-amber-700">⚠ {preview.conflictos.length} con departamento distinto (se saltea el predio)</div>}
              {preview.gpsOmitido?.length > 0 && <div>ℹ {preview.gpsOmitido.length} con GPS dudoso: se enriqueció todo menos el GPS</div>}
              <div>
                {preview.sinVerificar > 0 && <>{preview.sinVerificar} sin verificar · </>}
                {preview.salteadosConforme > 0 && <>{preview.salteadosConforme} en CONFORME · </>}
                {preview.salteadosYaEnriquecidos > 0 && <>{preview.salteadosYaEnriquecidos} ya enriquecidos · </>}
                {preview.sinMatch > 0 && <>{preview.sinMatch} sin match</>}
              </div>
            </div>
            {renderProblemas(preview)}
            <button onClick={aplicar} disabled={aplicando || preview.prediosAActualizar === 0}
              className="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-green-700 active:scale-[.98] transition shadow-sm">
              {aplicando ? "Aplicando…" : `Aplicar a ${preview.prediosAActualizar} predios`}
            </button>
          </div>
        )}

        {resultado && (
          <div className="mt-3 text-xs bg-green-50 rounded-lg px-3 py-2 text-green-800 border border-green-200">
            ✓ Enriquecimiento aplicado a <b>{resultado.aplicados}</b> predios.
          </div>
        )}
        </>
        )}
      </div>

      {/* Historial */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-sm p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-surface-700 mb-3">Historial de corridas</h2>
        {historial.length === 0 ? (
          <p className="text-xs text-surface-400">Sin corridas todavía.</p>
        ) : (
          <div className="space-y-1.5">
            {historial.map((j) => {
              const estilo: Record<string, string> = {
                APLICADO: "bg-green-100 text-green-700", REVERTIDO: "bg-surface-200 text-surface-600",
                ERROR: "bg-red-100 text-red-700", EJECUTANDO: "bg-amber-100 text-amber-700",
              };
              const r = j.resumen || {};
              return (
                <div key={j.id} className="flex items-center justify-between gap-2 text-xs border border-surface-100 rounded-lg px-3 py-2 hover:bg-surface-50 transition-colors">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${estilo[j.estado] || "bg-amber-100 text-amber-700"}`}>
                      {j.estado === "EJECUTANDO" && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}{j.estado}
                    </span>
                    <span className="text-surface-600 whitespace-nowrap">{new Date(j.createdAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    {r.prediosAActualizar != null && <span className="text-surface-500">· {r.prediosAActualizar} predios</span>}
                    {(r.lacRSi > 0 || r.lacRNo > 0) && <span className="text-brand-600">· LAC-R {r.lacRSi || 0}↑/{r.lacRNo || 0}↓</span>}
                    <span className="text-surface-400 truncate">· {j.creadoPor?.nombre}</span>
                  </div>
                  {j.estado === "APLICADO" && (
                    <button onClick={() => revertir(j.id)} className="shrink-0 text-red-600 hover:bg-red-50 rounded px-2 py-0.5 transition-colors">Revertir</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
