"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type AnuncioAviso = {
  id: string;
  titulo: string;
  contenido: string;
  prioridad: string;
  categoria?: string;
  createdAt: string;
  autor?: { nombre: string } | null;
};

type AnunciosCtx = { noLeidos: number; avisos: AnuncioAviso[]; refetch: () => void };

const AnunciosContext = createContext<AnunciosCtx>({ noLeidos: 0, avisos: [], refetch: () => {} });

export function useAnuncios() {
  return useContext(AnunciosContext);
}

export function AnunciosProvider({ children }: { children: React.ReactNode }) {
  const [noLeidos, setNoLeidos] = useState(0);
  const [avisos, setAvisos] = useState<AnuncioAviso[]>([]);
  const loadingRef = useRef(false);

  const refetch = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const res = await fetch("/api/anuncios/novedades", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setNoLeidos(data.noLeidos || 0);
        setAvisos(Array.isArray(data.avisos) ? data.avisos : []);
      }
    } catch { /* silencioso */ }
    finally { loadingRef.current = false; }
  }, []);

  useEffect(() => {
    refetch();
    const onVisible = () => { if (document.visibilityState === "visible") refetch(); };
    const iv = setInterval(() => { if (document.visibilityState === "visible") refetch(); }, 45_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVisible); };
  }, [refetch]);

  return (
    <AnunciosContext.Provider value={{ noLeidos, avisos, refetch }}>
      {children}
    </AnunciosContext.Provider>
  );
}
