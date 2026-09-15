"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import Modal from "@/components/ui/Modal";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Tecnico = {
  id: string;
  nombre: string;
  rol: string;
  activas: { id: string; estado: string; updatedAt: string }[];
};

function normalizar(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Mesa le escribe primero a un técnico. Si esa persona ya tiene conversaciones abiertas,
 * se muestran para seguir ahí en vez de abrir otra: dos hilos del mismo tema son la forma
 * más fácil de que un mensaje se pierda.
 */
export default function NuevaConversacionTecnico({
  open,
  onClose,
  onCreada,
  onAbrirExistente,
}: {
  open: boolean;
  onClose: () => void;
  onCreada: (conversacion: any) => void;
  onAbrirExistente: (id: string) => void;
}) {
  const [tecnicos, setTecnicos] = useState<Tecnico[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState<Tecnico | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusqueda("");
    setElegido(null);
    setMensaje("");
    const controller = new AbortController();
    fetch("/api/chat/tecnicos", { credentials: "include", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json();
        setTecnicos(data.tecnicos || []);
      })
      .catch(() => { if (!controller.signal.aborted) toast.error("No se pudo cargar la lista de técnicos"); });
    return () => controller.abort();
  }, [open]);

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    const lista = tecnicos || [];
    return q ? lista.filter((t) => normalizar(t.nombre).includes(q)) : lista;
  }, [tecnicos, busqueda]);

  const enviar = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!elegido || !mensaje.trim() || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mensaje: mensaje.trim(), tecnicoId: elegido.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "No se pudo iniciar la conversación");
        return;
      }
      toast.success(`Conversación iniciada con ${elegido.nombre}`);
      onCreada(data);
      onClose();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Escribir a un técnico" maxWidth="max-w-lg">
      {!elegido ? (
        <div className="space-y-3">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre…"
            aria-label="Buscar técnico"
            className="w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-surface-800 outline-none focus:ring-2 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-700 dark:text-surface-100"
          />
          <div className="max-h-80 overflow-y-auto rounded-lg border border-surface-200 dark:border-surface-700">
            {tecnicos === null ? (
              <p className="p-4 text-center text-sm text-surface-400">Cargando técnicos…</p>
            ) : filtrados.length === 0 ? (
              <p className="p-4 text-center text-sm text-surface-400">Nadie coincide con “{busqueda}”</p>
            ) : (
              filtrados.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setElegido(t)}
                  className="flex w-full items-center justify-between gap-2 border-b border-surface-100 px-3 py-2 text-left last:border-0 hover:bg-surface-50 focus-visible:bg-surface-50 focus-visible:outline-none dark:border-surface-700/60 dark:hover:bg-surface-700/50"
                >
                  <span className="truncate text-sm font-medium text-surface-800 dark:text-surface-100">{t.nombre}</span>
                  {t.activas.length > 0 && (
                    <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      {t.activas.length === 1 ? "1 conversación abierta" : `${t.activas.length} conversaciones abiertas`}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-surface-600 dark:text-surface-300">
              Para <span className="font-semibold text-surface-800 dark:text-surface-100">{elegido.nombre}</span>
            </p>
            <button type="button" onClick={() => setElegido(null)} className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
              Cambiar
            </button>
          </div>

          {elegido.activas.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/60 dark:bg-amber-900/20">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                Ya tiene {elegido.activas.length === 1 ? "una conversación abierta" : `${elegido.activas.length} conversaciones abiertas`}. Si es el mismo tema, seguí ahí.
              </p>
              <div className="mt-2 flex flex-col gap-1">
                {elegido.activas.slice(0, 3).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { onAbrirExistente(c.id); onClose(); }}
                    className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5 text-left text-xs text-surface-700 hover:bg-amber-100 dark:bg-surface-800 dark:text-surface-200 dark:hover:bg-amber-900/30"
                  >
                    <span>{c.estado === "ABIERTA" ? "Sin tomar" : "En curso"} · actividad {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true, locale: es })}</span>
                    <span className="font-semibold text-amber-700 dark:text-amber-300">Abrir</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(e); }}
            rows={4}
            maxLength={2000}
            placeholder="Escribí el primer mensaje…"
            aria-label="Primer mensaje"
            className="w-full resize-none rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-surface-800 outline-none focus:ring-2 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-700 dark:text-surface-100"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-surface-400">Le llega un aviso y la ve en su chat como “Mesa de Ayuda”.</span>
            <button
              type="submit"
              disabled={!mensaje.trim() || enviando}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
