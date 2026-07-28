"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */

interface Foto { rel: string; hora: string }
interface Punto { clave: string; label: string; fotos: Foto[] }
interface Envio { carpetaRel: string; nombre: string; draft: boolean | null; tecnico: string; cron: string; fecha: string; total: number; puntos: Punto[] }

export default function EvidenciasPage() {
  const { archivoId } = useParams<{ archivoId: string }>();
  const [data, setData] = useState<{ nombre: string; envios: Envio[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [full, setFull] = useState<{ rel: string; label: string } | null>(null);

  const fotoUrl = useCallback((rel: string) => `/api/evidencias/${archivoId}/foto?e=${encodeURIComponent(rel)}`, [archivoId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/evidencias/${archivoId}`, { credentials: "include" });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "No se pudo abrir el paquete"); }
        setData(await res.json());
      } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
    })();
  }, [archivoId]);

  useEffect(() => {
    if (data?.nombre) document.title = `Evidencias · ${data.nombre}`;
  }, [data]);

  if (loading) return <div className="flex justify-center py-24"><div className="w-6 h-6 border-2 border-surface-200 border-t-primary-500 rounded-full animate-spin" /></div>;
  if (error) return <div className="py-24 text-center text-sm text-red-500">{error}</div>;
  if (!data) return null;

  const envios = data.envios || [];
  const totalFotos = envios.reduce((n, e) => n + e.total, 0);

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up pb-16">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-surface-800 dark:text-surface-100">Evidencias por punto</h1>
        <p className="text-xs text-surface-400 mt-0.5">{data.nombre} · {envios.length} tarea(s) · {totalFotos} foto(s) · más recientes primero</p>
      </div>

      {/* Índice */}
      {envios.length > 1 && (
        <div className="rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-3 mb-4 text-xs">
          <span className="font-semibold text-surface-500">Ir a:</span>{" "}
          {envios.map((e, i) => (
            <a key={i} href={`#env-${i}`} className="text-primary-600 hover:underline mr-3 inline-block">{e.nombre} ({e.total})</a>
          ))}
        </div>
      )}

      {envios.length === 0 && <p className="text-sm text-surface-400 py-10 text-center">El paquete no tiene envíos con fotos.</p>}

      {envios.map((env, i) => (
        <section key={i} id={`env-${i}`} className="mb-5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 overflow-hidden scroll-mt-4">
          <div className="px-4 py-3 border-b border-surface-100 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-700/30 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-100">{env.nombre}</h2>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${env.draft ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{env.draft ? "BORRADOR" : "ENVIADO"}</span>
            <span className="text-[11px] text-surface-400">{env.total} fotos · Téc: {env.tecnico || "—"} · {env.cron} · {env.fecha}</span>
          </div>
          {env.puntos.length === 0 ? (
            <p className="px-4 py-4 text-xs text-surface-400">Sin fotos catalogadas.</p>
          ) : env.puntos.map((p) => (
            <div key={p.clave} className="px-4 pt-2 pb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-surface-600 dark:text-surface-300 border-l-[3px] border-primary-500 pl-2 my-2">
                {p.label} <span className="text-surface-400 font-normal normal-case">· {p.fotos.length} foto(s)</span>
              </h3>
              <div className="flex flex-wrap gap-2.5">
                {p.fotos.map((f, j) => (
                  <button key={j} onClick={() => setFull({ rel: f.rel, label: p.label })} className="w-[180px] rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden bg-surface-50 dark:bg-surface-700/40 hover:border-primary-300 transition-colors" title={p.label}>
                    <img loading="lazy" src={fotoUrl(f.rel)} alt={p.label} className="w-full h-[150px] object-cover block bg-surface-100" />
                    <div className="px-2 py-1 text-[10px] text-surface-400 text-left">{f.hora}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}

      {/* Lightbox */}
      {full && (
        <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4" onClick={() => setFull(null)}>
          <div className="mb-2 text-white text-xs font-medium max-w-[90vw] text-center">{full.label}</div>
          <img src={fotoUrl(full.rel)} alt={full.label} className="max-h-[82vh] max-w-[92vw] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
          <div className="mt-3 flex gap-2">
            <a href={fotoUrl(full.rel)} download onClick={(e) => e.stopPropagation()} className="px-3 py-1.5 text-xs font-medium rounded-md bg-white/90 text-surface-800 hover:bg-white">Descargar</a>
            <button onClick={() => setFull(null)} className="px-3 py-1.5 text-xs font-medium rounded-md bg-white/20 text-white hover:bg-white/30">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
