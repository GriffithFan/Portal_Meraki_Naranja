"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useAnuncios, type AnuncioAviso } from "@/contexts/AnunciosContext";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Toast NO invasivo para anuncios de prioridad alta: emerge en la topbar, se
// muestra UNA sola vez por anuncio (recordado en localStorage) y desaparece a
// los 10s. No marca el anuncio como leído — de eso se encarga el tablero.
const KEY = "anuncios_toast_vistos";
const DURACION_MS = 10_000;

function getVistos(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { return new Set(); }
}
function addVisto(id: string) {
  try {
    const s = getVistos(); s.add(id);
    localStorage.setItem(KEY, JSON.stringify(Array.from(s).slice(-300))); // acotar tamaño
  } catch { /* ignore */ }
}

export default function AnunciosToast() {
  const { avisos } = useAnuncios();
  const [activos, setActivos] = useState<AnuncioAviso[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setActivos((prev) => prev.filter((a) => a.id !== id));
    const t = timers.current[id];
    if (t) { clearTimeout(t); delete timers.current[id]; }
  }, []);

  useEffect(() => {
    const vistos = getVistos();
    const nuevos = avisos.filter((a) => !vistos.has(a.id));
    if (nuevos.length === 0) return;
    setActivos((prev) => {
      const ids = new Set(prev.map((p) => p.id));
      return [...prev, ...nuevos.filter((n) => !ids.has(n.id))];
    });
    for (const n of nuevos) {
      addVisto(n.id);
      if (!timers.current[n.id]) {
        timers.current[n.id] = setTimeout(() => dismiss(n.id), DURACION_MS);
      }
    }
  }, [avisos, dismiss]);

  // Limpieza de timers al desmontar
  useEffect(() => {
    const map = timers.current;
    return () => { Object.values(map).forEach((t) => clearTimeout(t)); };
  }, []);

  if (activos.length === 0) return null;

  return (
    <div className="fixed left-1/2 -translate-x-1/2 top-16 sm:top-[72px] z-[60] w-[calc(100vw-1.5rem)] max-w-md space-y-2 pointer-events-none">
      {activos.map((a) => (
        <div key={a.id} className="pointer-events-auto animate-fade-in-up rounded-xl border border-amber-200 bg-white shadow-lg">
          <div className="flex items-start gap-3 p-3">
            <div className="mt-0.5 w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Anuncio · Prioridad alta</span>
              <p className="text-sm font-semibold text-surface-800 truncate">{a.titulo}</p>
              <p className="text-xs text-surface-500 line-clamp-2 mt-0.5">{a.contenido}</p>
              <Link href="/dashboard/anuncios" onClick={() => dismiss(a.id)} className="inline-block mt-1.5 text-xs font-medium text-primary-600 hover:underline">
                Ver anuncio
              </Link>
            </div>
            <button onClick={() => dismiss(a.id)} className="shrink-0 text-surface-400 hover:text-surface-600" aria-label="Cerrar">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
