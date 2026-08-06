"use client";

import { useEffect, useState } from "react";

interface Data {
  regiones: number[];
  mapa: Record<string, string[]>;
  conteos: Record<string, number>;
}

/**
 * Config (solo ADMIN) de las regiones educativas de BA con LAC-R "estricto por
 * ventana": en ellas, para que el enriquecimiento marque LAC-R = SI, el predio
 * debe estar DENTRO del cronograma (desde-hasta), no basta con estar Activo.
 * Default {14, 15}. Reutiliza /api/enriquecimiento/regiones-estrictas.
 */
export default function RegionesEstrictasPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/enriquecimiento/regiones-estrictas", { credentials: "include", cache: "no-store" });
        if (!r.ok) return;
        const d: Data = await r.json();
        setData(d);
        setSel(new Set(d.regiones));
      } catch { /* noop */ }
    })();
  }, []);

  if (!data) return null;

  const original = new Set(data.regiones);
  const cambiado = sel.size !== original.size || Array.from(sel).some((n) => !original.has(n));

  const toggle = (n: number) => setSel((s) => {
    const x = new Set(s);
    if (x.has(n)) x.delete(n); else x.add(n);
    return x;
  });

  async function guardar() {
    setGuardando(true); setMsg("");
    try {
      const r = await fetch("/api/enriquecimiento/regiones-estrictas", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regiones: Array.from(sel).sort((a, b) => a - b) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudo guardar");
      setData({ ...data!, regiones: d.regiones });
      setSel(new Set(d.regiones));
      setMsg("Guardado ✓");
      setTimeout(() => setMsg(""), 2500);
    } catch (e) { setMsg((e as Error).message); }
    finally { setGuardando(false); }
  }

  const seleccionadas = Array.from(sel).sort((a, b) => a - b);
  const regionesOrden = Object.keys(data.mapa).map(Number).sort((a, b) => a - b);

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-sm mb-4 overflow-hidden">
      <button onClick={() => setAbierto((v) => !v)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-50/60 transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base">📍</span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-surface-700">Regla LAC-R por región (Buenos Aires)</h2>
            <p className="text-[11px] text-surface-500 truncate">
              {seleccionadas.length
                ? <>Estrictas por ventana: <b className="text-surface-700">Región {seleccionadas.join(", ")}</b> — ahí el SI exige estar dentro del cronograma.</>
                : "Ninguna región con restricción (regla normal: Activo manda)."}
            </p>
          </div>
        </div>
        <svg className={`w-4 h-4 shrink-0 text-surface-400 transition-transform ${abierto ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>

      {abierto && (
        <div className="px-4 pb-4 border-t border-surface-100">
          <p className="text-[11px] text-surface-500 my-3 leading-relaxed">
            En las regiones marcadas, el enriquecimiento marca <b>LAC-R = SI solo si el predio está dentro de la ventana</b> del
            cronograma (fecha desde–hasta). Si venció, queda en NO aunque el cronograma siga Activo. En el resto de las regiones
            rige la regla normal (Activo manda). Pasá el mouse por cada región para ver sus partidos.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
            {regionesOrden.map((n) => {
              const on = sel.has(n);
              const cuenta = data.conteos[String(n)] || 0;
              const partidos = (data.mapa[String(n)] || []).join(", ");
              return (
                <button
                  key={n}
                  onClick={() => toggle(n)}
                  title={partidos}
                  className={`flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${on ? "bg-primary-600 border-primary-600 text-white" : "bg-white border-surface-200 text-surface-600 hover:border-primary-300"}`}
                >
                  <span className="font-medium">Región {n}</span>
                  <span className={`tabular-nums text-[10px] ${on ? "text-white/80" : "text-surface-400"}`}>{cuenta}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={guardar}
              disabled={!cambiado || guardando}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
            {cambiado && !guardando && <span className="text-[11px] text-amber-600">Hay cambios sin guardar</span>}
            {msg && <span className={`text-[11px] ${msg.includes("✓") ? "text-emerald-600" : "text-red-600"}`}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
