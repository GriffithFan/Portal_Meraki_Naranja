"use client";

import { useEffect, useRef, useState } from "react";
import { REGIONES_BA, REGIONES_ORDEN } from "@/lib/regionesBA";

/**
 * Filtro multi-selección por región educativa de BA para las listas de tareas.
 * Popover con checkboxes 1-25 (tooltip con los partidos de cada región). Controlado:
 * recibe `value` (números de región) y notifica cambios por `onChange`.
 */
export default function RegionFilter({
  value,
  onChange,
  className = "",
}: {
  value: number[];
  onChange: (v: number[]) => void;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [abierto]);

  const sel = new Set(value);
  const toggle = (n: number) => {
    const x = new Set(sel);
    if (x.has(n)) x.delete(n); else x.add(n);
    onChange(Array.from(x).sort((a, b) => a - b));
  };

  const activo = value.length > 0;
  const etiqueta = activo ? `Región · ${value.slice().sort((a, b) => a - b).join(", ")}` : "Región";

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        title={activo ? `Regiones ${value.join(", ")}` : "Filtrar por región (Buenos Aires)"}
        className={`w-full inline-flex items-center justify-between gap-1.5 px-3 py-2 border rounded-md text-xs bg-white transition-colors ${activo ? "border-primary-400 bg-primary-50 text-primary-700" : "border-surface-200 text-surface-600 hover:border-surface-400"}`}
      >
        <span className="truncate">{etiqueta}</span>
        <svg className={`w-3.5 h-3.5 shrink-0 opacity-60 transition-transform ${abierto ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>

      {abierto && (
        <div className="absolute z-30 mt-1 left-0 w-56 max-h-[60vh] overflow-auto rounded-lg border border-surface-200 bg-white shadow-lg p-2">
          <div className="flex items-center justify-between px-1 pb-1.5 mb-1 border-b border-surface-100">
            <span className="text-[11px] font-semibold text-surface-500">Región (Buenos Aires)</span>
            {activo && <button onClick={() => onChange([])} className="text-[11px] text-primary-600 hover:underline">Limpiar</button>}
          </div>
          <div className="grid grid-cols-2 gap-0.5">
            {REGIONES_ORDEN.map((n) => {
              const on = sel.has(n);
              return (
                <button
                  key={n}
                  onClick={() => toggle(n)}
                  title={(REGIONES_BA[n] || []).join(", ")}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs text-left transition-colors ${on ? "bg-primary-600 text-white" : "text-surface-600 hover:bg-surface-100"}`}
                >
                  <span className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${on ? "border-white bg-white/20" : "border-surface-300"}`}>
                    {on && <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </span>
                  Región {n}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
