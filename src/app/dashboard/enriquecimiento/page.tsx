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
  const [excluirYaEnriquecidos, setExcluirYaEnriquecidos] = useState(true);
  const [excluirConforme, setExcluirConforme] = useState(true);

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
      excluirConforme,
    }),
    [espacioId, incluyeSubcarpetas, estadosSel, provincia, ciudad, tecnicoId, excluirYaEnriquecidos, excluirConforme]
  );

  const cargarHistorial = useCallback(async () => {
    const res = await fetch("/api/enriquecimiento", { credentials: "include" });
    if (res.ok) setHistorial((await res.json()).jobs || []);
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

  const espaciosArbol = useMemo(() => (opciones ? ordenarArbol(opciones.espacios) : []), [opciones]);

  if (!esAdmin) {
    return <div className="p-6 text-sm text-surface-500">Esta sección es solo para administradores.</div>;
  }

  return (
    <div className="animate-fade-in-up max-w-4xl mx-auto pb-10">
      <h1 className="text-xl font-semibold text-surface-800 mb-1">Enriquecimiento de datos</h1>
      <p className="text-xs text-surface-400 mb-4">
        Generá el Excel de entrada de un alcance, corré el extractor de Salesforce, subí el resultado
        y Carrot rellena los datos faltantes sin tocar estados ni asignados.
      </p>

      {error && <div className="mb-3 px-3 py-2 rounded-md bg-red-50 text-red-700 text-sm">{error}</div>}

      {/* Paso 1: alcance */}
      <div className="bg-white rounded-lg border border-surface-200 p-4 mb-4">
        <h2 className="text-sm font-semibold text-surface-700 mb-3">1 · Elegí el alcance</h2>
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
        <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-surface-100">
          <label className="text-xs text-surface-600 flex items-center gap-2">
            <input type="checkbox" checked={excluirConforme} onChange={(e) => setExcluirConforme(e.target.checked)} />
            Excluir CONFORME (recomendado)
          </label>
          <label className="text-xs text-surface-600 flex items-center gap-2">
            <input type="checkbox" checked={excluirYaEnriquecidos} onChange={(e) => setExcluirYaEnriquecidos(e.target.checked)} />
            Excluir ya enriquecidos
          </label>
        </div>

        {conteos && (
          <div className="mt-3 text-xs text-surface-600 bg-surface-50 rounded-md px-3 py-2">
            <b>{conteos.prediosEnAlcance}</b> predios en el alcance · <b>{conteos.conIncidencia}</b> con incidencia
            {conteos.sinIncidencia > 0 && <> · {conteos.sinIncidencia} sin incidencia (no enriquecibles)</>}
            {conteos.conforme > 0 && <> · {conteos.conforme} en CONFORME{excluirConforme ? " (se saltean)" : ""}</>}
            {conteos.yaEnriquecidos > 0 && <> · {conteos.yaEnriquecidos} ya enriquecidos{excluirYaEnriquecidos ? " (se saltean)" : ""}</>}
            <div className="mt-1 font-medium text-brand-700">→ {conteos.efectivos} predios entrarían en el Excel {cargandoConteos && "…"}</div>
          </div>
        )}

        <button onClick={generarEntrada} disabled={generando || !conteos || conteos.efectivos === 0}
          className="mt-3 px-4 py-2 bg-brand-600 text-white rounded-md text-sm font-medium disabled:opacity-50 hover:bg-brand-700 transition-colors">
          {generando ? "Generando…" : "Generar Excel de entrada"}
        </button>
      </div>

      {/* Paso 2: subir resultado */}
      <div className={`bg-white rounded-lg border border-surface-200 p-4 mb-4 ${!jobId ? "opacity-50 pointer-events-none" : ""}`}>
        <h2 className="text-sm font-semibold text-surface-700 mb-3">2 · Subí el resultado del extractor</h2>
        {!jobId && <p className="text-xs text-surface-400">Primero generá el Excel de entrada.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={(e) => { setArchivo(e.target.files?.[0] || null); setPreview(null); setResultado(null); }}
            className="text-xs" />
          <button onClick={previsualizar} disabled={!archivo}
            className="px-3 py-1.5 bg-surface-100 text-surface-700 rounded-md text-sm font-medium disabled:opacity-50 hover:bg-surface-200 transition-colors">
            Previsualizar
          </button>
        </div>

        {preview && (
          <div className="mt-3 text-xs bg-surface-50 rounded-md px-3 py-2 text-surface-700">
            <div className="font-medium mb-1">Se actualizarían <b>{preview.prediosAActualizar}</b> predios:</div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
              {Object.entries(preview.detallePorCampo).filter(([, v]) => (v as number) > 0).map(([k, v]) => (
                <span key={k}>{k}: <b>{v as number}</b></span>
              ))}
            </div>
            <div className="mt-1 text-surface-500">
              {preview.conflictos?.length > 0 && <div className="text-amber-700">⚠ {preview.conflictos.length} conflicto(s) de ubicación (se saltean)</div>}
              {preview.sinVerificar > 0 && <>· {preview.sinVerificar} sin verificar </>}
              {preview.salteadosConforme > 0 && <>· {preview.salteadosConforme} en CONFORME </>}
              {preview.salteadosYaEnriquecidos > 0 && <>· {preview.salteadosYaEnriquecidos} ya enriquecidos </>}
              {preview.sinMatch > 0 && <>· {preview.sinMatch} sin match </>}
            </div>
            <button onClick={aplicar} disabled={aplicando || preview.prediosAActualizar === 0}
              className="mt-2 px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium disabled:opacity-50 hover:bg-green-700 transition-colors">
              {aplicando ? "Aplicando…" : `Aplicar a ${preview.prediosAActualizar} predios`}
            </button>
          </div>
        )}

        {resultado && (
          <div className="mt-3 text-xs bg-green-50 rounded-md px-3 py-2 text-green-800">
            ✓ Enriquecimiento aplicado a <b>{resultado.aplicados}</b> predios.
          </div>
        )}
      </div>

      {/* Historial */}
      <div className="bg-white rounded-lg border border-surface-200 p-4">
        <h2 className="text-sm font-semibold text-surface-700 mb-3">Historial</h2>
        {historial.length === 0 ? (
          <p className="text-xs text-surface-400">Sin corridas todavía.</p>
        ) : (
          <div className="space-y-1.5">
            {historial.map((j) => (
              <div key={j.id} className="flex items-center justify-between text-xs border border-surface-100 rounded-md px-3 py-2">
                <div>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mr-2 ${
                    j.estado === "APLICADO" ? "bg-green-100 text-green-700" :
                    j.estado === "REVERTIDO" ? "bg-surface-200 text-surface-600" :
                    j.estado === "ERROR" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                  }`}>{j.estado}</span>
                  <span className="text-surface-600">{new Date(j.createdAt).toLocaleString("es-AR")}</span>
                  {j.resumen?.prediosAActualizar != null && <span className="text-surface-400 ml-2">· {j.resumen.prediosAActualizar} predios</span>}
                  <span className="text-surface-400 ml-2">· {j.creadoPor?.nombre}</span>
                </div>
                {j.estado === "APLICADO" && (
                  <button onClick={() => revertir(j.id)} className="text-red-600 hover:underline">Revertir</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
