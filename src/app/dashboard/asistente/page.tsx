"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useSession";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Msg = {
  id: string;
  rol: "user" | "assistant";
  contenido: string;
  fuente?: string | null;
  feedbackId?: string | null;
  voto?: number;
  replyToId?: string | null;
  replyTo?: { id: string; rol: string; contenido: string } | null;
};

const SUGERENCIAS = [
  "¿Qué reviso antes de ir a un predio?",
  "El AP quedó a 100 Mbps, ¿qué hago?",
  "¿Cuáles son los motivos más frecuentes de no conformidad?",
  "¿Qué fotos necesita un AP para no ser rechazado?",
];

function fechaCorta(d: string) {
  const dt = new Date(d);
  const hoy = new Date();
  const mismoDia = dt.toDateString() === hoy.toDateString();
  return mismoDia
    ? dt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    : dt.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

export default function AsistentePage() {
  const { isAdmin, loading: sesLoading } = useSession();
  const [convs, setConvs] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pensando, setPensando] = useState(false);
  const [cargandoConv, setCargandoConv] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const fetchConvs = useCallback(async () => {
    const res = await fetch("/api/asistente/conversaciones", { credentials: "include" });
    if (res.ok) setConvs(await res.json());
  }, []);

  useEffect(() => { if (isAdmin) fetchConvs(); }, [isAdmin, fetchConvs]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [mensajes, pensando]);

  async function abrir(id: string) {
    if (id === activeId) { setSidebarOpen(false); return; }
    setCargandoConv(true);
    setActiveId(id);
    setReplyTo(null);
    setSidebarOpen(false);
    try {
      const res = await fetch(`/api/asistente/conversaciones/${id}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMensajes(data.mensajes || []);
      } else {
        toast.error("No se pudo abrir la conversación");
      }
    } finally { setCargandoConv(false); }
  }

  function nueva() {
    setActiveId(null);
    setMensajes([]);
    setReplyTo(null);
    setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function enviar(texto?: string) {
    const contenido = (texto ?? input).trim();
    if (!contenido || pensando) return;

    const replyId = replyTo?.id || null;
    const optimista: Msg = { id: "tmp-" + Date.now(), rol: "user", contenido, replyToId: replyId, replyTo: replyTo ? { id: replyTo.id, rol: replyTo.rol, contenido: replyTo.contenido } : null };
    setMensajes((prev) => [...prev, optimista]);
    setInput("");
    setReplyTo(null);
    setPensando(true);
    try {
      const res = await fetch("/api/asistente", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversacionId: activeId, texto: contenido, replyToId: replyId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "El asistente no pudo responder");
        // reemplazar el optimista por el persistido (si lo hay) para poder reintentar
        if (data?.userMensaje) setMensajes((prev) => prev.map((m) => (m.id === optimista.id ? data.userMensaje : m)));
        if (data?.conversacionId && !activeId) { setActiveId(data.conversacionId); fetchConvs(); }
        return;
      }
      if (!activeId) setActiveId(data.conversacionId);
      setMensajes((prev) => prev.map((m) => (m.id === optimista.id ? data.userMensaje : m)).concat(data.mensaje));
      fetchConvs();
    } catch {
      toast.error("Error de red al consultar el asistente");
    } finally {
      setPensando(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function votar(idx: number, voto: number) {
    const m = mensajes[idx];
    if (!m?.feedbackId) return;
    const nuevo = m.voto === voto ? 0 : voto;
    setMensajes((prev) => prev.map((x, i) => (i === idx ? { ...x, voto: nuevo } : x)));
    try {
      await fetch("/api/asistente/feedback", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.feedbackId, voto: nuevo }),
      });
    } catch { /* no crítico */ }
  }

  async function renombrar(c: any) {
    const titulo = prompt("Nuevo título de la conversación:", c.titulo || "");
    if (titulo == null) return;
    const t = titulo.trim();
    if (!t) return;
    const res = await fetch(`/api/asistente/conversaciones/${c.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo: t }) });
    if (res.ok) fetchConvs(); else toast.error("No se pudo renombrar");
  }

  async function borrar(c: any) {
    if (!confirm(`¿Eliminar la conversación "${c.titulo || "sin título"}"?`)) return;
    const res = await fetch(`/api/asistente/conversaciones/${c.id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      if (c.id === activeId) nueva();
      fetchConvs();
      toast.success("Conversación eliminada");
    } else toast.error("No se pudo eliminar");
  }

  function copiar(texto: string) {
    navigator.clipboard.writeText(texto).then(() => toast.success("Copiado")).catch(() => {});
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
    if (e.key === "Escape") setReplyTo(null);
  }

  if (sesLoading) return <div className="py-24 text-center text-sm text-surface-400">Cargando…</div>;
  if (!isAdmin) return <div className="py-24 text-center text-sm text-surface-400">El asistente está en pruebas: solo administradores.</div>;

  return (
    <div className="animate-fade-in-up flex gap-3 h-[calc(100vh-7rem)]">
      {/* ── Sidebar de conversaciones ── */}
      <aside className={`${sidebarOpen ? "flex" : "hidden"} sm:flex flex-col w-64 flex-shrink-0 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 overflow-hidden absolute sm:relative z-20 h-[calc(100vh-7rem)] sm:h-auto`}>
        <div className="p-2 border-b border-surface-100 dark:border-surface-700">
          <button onClick={nueva} className="w-full px-3 py-2 bg-accent-600 text-white rounded-lg text-xs font-medium hover:bg-accent-700 transition-colors flex items-center justify-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Nueva conversación
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {convs.length === 0 ? (
            <p className="text-[11px] text-surface-400 text-center py-6">Sin conversaciones aún</p>
          ) : convs.map((c) => (
            <div key={c.id} className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${c.id === activeId ? "bg-accent-50 dark:bg-accent-900/20" : "hover:bg-surface-100 dark:hover:bg-surface-700"}`} onClick={() => abrir(c.id)}>
              <div className="flex-1 min-w-0">
                <p className={`text-xs truncate ${c.id === activeId ? "text-accent-700 dark:text-accent-300 font-medium" : "text-surface-700 dark:text-surface-200"}`}>{c.titulo || "Sin título"}</p>
                <p className="text-[10px] text-surface-400">{c._count?.mensajes || 0} msgs · {fechaCorta(c.updatedAt)}</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); renombrar(c); }} title="Renombrar" className="opacity-0 group-hover:opacity-100 p-1 text-surface-400 hover:text-surface-700 rounded">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
              </button>
              <button onClick={(e) => { e.stopPropagation(); borrar(c); }} title="Eliminar" className="opacity-0 group-hover:opacity-100 p-1 text-surface-400 hover:text-red-500 rounded">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Panel del chat ── */}
      <div className="flex-1 flex flex-col min-w-0 max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => setSidebarOpen((v) => !v)} className="sm:hidden p-1.5 rounded-md text-surface-500 hover:bg-surface-100" title="Conversaciones">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
          </button>
          <div className="w-8 h-8 rounded-lg bg-accent-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-accent-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-surface-800 dark:text-surface-100 flex items-center gap-2 truncate">
              Asistente IA
              <span className="text-[9px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex-shrink-0">BETA</span>
            </h1>
          </div>
        </div>

        {/* Conversación */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4 space-y-4">
          {cargandoConv ? (
            <div className="h-full flex items-center justify-center text-sm text-surface-400">Cargando conversación…</div>
          ) : mensajes.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-8">
              <div className="w-14 h-14 rounded-2xl bg-accent-50 flex items-center justify-center">
                <svg className="w-7 h-7 text-accent-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              </div>
              <p className="text-sm font-medium text-surface-700 dark:text-surface-200">Empezá una consulta</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {SUGERENCIAS.map((s) => (
                  <button key={s} onClick={() => enviar(s)} className="text-xs text-left px-3 py-1.5 rounded-full border border-surface-200 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:border-accent-300 hover:bg-accent-50 transition-colors">{s}</button>
                ))}
              </div>
            </div>
          ) : (
            mensajes.map((m, i) => (
              <div key={m.id} className={`group flex flex-col ${m.rol === "user" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${m.rol === "user" ? "bg-primary-600 text-white rounded-br-sm" : "bg-surface-100 dark:bg-surface-700 text-surface-800 dark:text-surface-100 rounded-bl-sm"}`}>
                  {m.replyTo && (
                    <div className={`text-[11px] mb-1.5 pl-2 border-l-2 ${m.rol === "user" ? "border-white/40 text-white/80" : "border-accent-400 text-surface-500 dark:text-surface-400"}`}>
                      <span className="font-medium">{m.replyTo.rol === "user" ? "Vos" : "Asistente"}:</span> {m.replyTo.contenido.length > 90 ? m.replyTo.contenido.slice(0, 90) + "…" : m.replyTo.contenido}
                    </div>
                  )}
                  {m.contenido}
                </div>
                <div className="flex items-center gap-1.5 mt-1 ml-1 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
                  {m.rol === "assistant" && m.fuente && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${/sin dato/i.test(m.fuente) ? "bg-amber-50 text-amber-600" : "bg-surface-100 dark:bg-surface-700 text-surface-500"}`} title="En qué se basó">Fuente: {m.fuente}</span>
                  )}
                  <button onClick={() => { setReplyTo(m); inputRef.current?.focus(); }} className="text-[10px] text-surface-400 hover:text-accent-600 px-1 py-0.5 rounded flex items-center gap-0.5" title="Responder a este mensaje">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                    Responder
                  </button>
                  <button onClick={() => copiar(m.contenido)} className="text-[10px] text-surface-400 hover:text-surface-700 px-1 py-0.5 rounded" title="Copiar">Copiar</button>
                  {m.rol === "assistant" && m.feedbackId && (
                    <span className="flex items-center gap-0.5">
                      <button onClick={() => votar(i, 1)} title="Buena" className={`p-0.5 rounded ${m.voto === 1 ? "text-emerald-600" : "text-surface-400 hover:text-emerald-600"}`}>
                        <svg className="w-3.5 h-3.5" fill={m.voto === 1 ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.259M6.633 10.5H4.875c-.621 0-1.125.504-1.125 1.125v9c0 .621.504 1.125 1.125 1.125h1.5c.621 0 1.125-.504 1.125-1.125v-9c0-.621-.504-1.125-1.125-1.125z" /></svg>
                      </button>
                      <button onClick={() => votar(i, -1)} title="Mala" className={`p-0.5 rounded ${m.voto === -1 ? "text-red-600" : "text-surface-400 hover:text-red-600"}`}>
                        <svg className="w-3.5 h-3.5" fill={m.voto === -1 ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398C20.613 14.547 19.833 15 19 15h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 00.303-.54m.023-8.25H16.48a4.5 4.5 0 01-1.423-.23l-3.114-1.04a4.5 4.5 0 00-1.423-.23H6.504c-.618 0-1.217.247-1.605.729A11.95 11.95 0 002.25 12c0 .434.023.863.068 1.285C2.427 14.306 3.346 15 4.372 15h3.126c.618 0 .991.724.725 1.282A7.471 7.471 0 007.5 19.5a2.25 2.25 0 002.25 2.25.75.75 0 00.75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 002.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384" /></svg>
                      </button>
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
          {pensando && (
            <div className="flex justify-start">
              <div className="bg-surface-100 dark:bg-surface-700 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-accent-400 animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-accent-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-accent-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
        </div>

        {/* Banner de "respondiendo a" */}
        {replyTo && (
          <div className="mt-2 flex items-center gap-2 bg-accent-50 dark:bg-accent-900/20 border border-accent-200 dark:border-accent-800 rounded-lg px-3 py-1.5 text-xs">
            <svg className="w-3.5 h-3.5 text-accent-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
            <span className="text-surface-500 flex-shrink-0">Respondiendo a {replyTo.rol === "user" ? "tu mensaje" : "el asistente"}:</span>
            <span className="text-surface-700 dark:text-surface-300 truncate flex-1">{replyTo.contenido}</span>
            <button onClick={() => setReplyTo(null)} className="text-surface-400 hover:text-surface-700 flex-shrink-0" title="Cancelar">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* Input */}
        <div className="mt-2 flex items-end gap-2">
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} rows={1}
            placeholder={replyTo ? "Escribí tu respuesta…" : "Escribí tu consulta… (Enter para enviar)"} disabled={pensando}
            className="flex-1 resize-none max-h-32 px-4 py-3 rounded-xl border border-surface-200 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100 text-sm focus:outline-none focus:border-accent-400 disabled:opacity-60" />
          <button onClick={() => enviar()} disabled={pensando || !input.trim()} className="h-[46px] px-4 rounded-xl bg-accent-600 text-white text-sm font-medium hover:bg-accent-700 transition-colors disabled:opacity-50 flex-shrink-0 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
            Enviar
          </button>
        </div>
        <p className="text-[10px] text-surface-400 mt-1.5 text-center">El asistente puede equivocarse. Ante dudas de seguridad o casos no documentados, escalá a Mesa. · En pruebas con Claude.</p>
      </div>
    </div>
  );
}
