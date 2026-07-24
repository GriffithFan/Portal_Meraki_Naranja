"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { DocsAPI?: any }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("No se pudo cargar el editor de documentos"));
    document.head.appendChild(s);
  });
}

export default function EditarActaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const editorRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/actas/${id}/onlyoffice/config`, { credentials: "include" });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "No se pudo abrir el editor");
        }
        const { config, ooUrl, nombre: nom } = await res.json();
        if (cancelled) return;
        setNombre(nom || "");
        await loadScript(`${ooUrl}/web-apps/apps/api/documents/api.js`);
        if (cancelled) return;
        if (!window.DocsAPI) throw new Error("No se pudo inicializar el editor");
        editorRef.current = new window.DocsAPI.DocEditor("oo-editor", {
          ...config,
          width: "100%",
          height: "100%",
          type: "desktop",
          events: {
            onDocumentReady: () => setLoading(false),
            onError: (e: any) => console.error("OnlyOffice error", e),
            onRequestClose: () => router.push("/dashboard/actas"),
          },
        });
      } catch (e) {
        if (!cancelled) { setError((e as Error).message); setLoading(false); }
      }
    })();
    return () => {
      cancelled = true;
      try { editorRef.current?.destroyEditor?.(); } catch { /* noop */ }
    };
  }, [id, router]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-900">
      <div className="flex items-center gap-3 border-b border-surface-700 bg-surface-800 px-3 py-2 text-surface-100">
        <button onClick={() => router.push("/dashboard/actas")} className="rounded-lg px-2 py-1 text-sm font-medium hover:bg-surface-700">← Volver a Actas</button>
        <span className="truncate text-sm font-medium">{nombre || "Editando acta"}</span>
        <span className="ml-auto hidden text-[11px] text-surface-400 sm:block">Para PDF: <b>Archivo → Descargar como → PDF</b></span>
      </div>
      <div className="relative flex-1">
        {error ? (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <div>
              <p className="font-medium text-red-400">{error}</p>
              <button onClick={() => router.push("/dashboard/actas")} className="mt-3 rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700">Volver a Actas</button>
            </div>
          </div>
        ) : (
          <>
            {loading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-900 text-surface-300">Cargando editor…</div>}
            <div id="oo-editor" className="h-full w-full" />
          </>
        )}
      </div>
    </div>
  );
}
