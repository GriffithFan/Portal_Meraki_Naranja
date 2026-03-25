"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "@/hooks/useSession";
import { usePathname } from "next/navigation";
import clsx from "clsx";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function ChatFloatingWidget() {
  const { session, loading, isMesa } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [conversacion, setConversacion] = useState<any>(null);
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState("");
  const [asunto, setAsunto] = useState("");
  const [consulta, setConsulta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [vista, setVista] = useState<"inicio" | "chat" | "crear">("inicio");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const isHidden = pathname === "/dashboard/chat";

  const checkUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/sin-leer", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUnread(data.count);
      }
    } catch { /* silenciar */ }
  }, []);

  const cargarConvActiva = useCallback(async () => {
    if (isMesa) return; // Mesa usa la página completa
    try {
      const res = await fetch("/api/chat?estado=EN_CURSO", { credentials: "include" });
      if (!res.ok) return;
      let data = await res.json();
      if (data.length === 0) {
        const res2 = await fetch("/api/chat?estado=ABIERTA", { credentials: "include" });
        if (res2.ok) data = await res2.json();
      }
      if (data.length > 0) {
        setConversacion(data[0]);
        // Cargar mensajes
        const res3 = await fetch(`/api/chat/${data[0].id}`, { credentials: "include" });
        if (res3.ok) {
          const detalle = await res3.json();
          setMensajes(detalle.mensajes || []);
          setVista("chat");
        }
      } else {
        setConversacion(null);
        setMensajes([]);
        setVista("inicio");
      }
    } catch { /* silenciar */ }
  }, [isMesa]);

  // Check unread cada 10s
  useEffect(() => {
    if (loading || !session) return;
    checkUnread();
    const interval = setInterval(checkUnread, 10000);
    return () => clearInterval(interval);
  }, [loading, session, checkUnread]);

  // Polling mensajes cuando está abierto
  useEffect(() => {
    if (!open || !conversacion?.id) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/chat/${conversacion.id}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setMensajes(data.mensajes || []);
          if (data.estado === "CERRADA") {
            setConversacion(data);
          }
        }
      } catch { /* silenciar */ }
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, [open, conversacion?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  const handleOpen = async () => {
    setOpen(true);
    setUnread(0);
    if (!isMesa) {
      await cargarConvActiva();
    }
  };

  // Ocultar en la página de chat completa
  if (isHidden) return null;

  const enviarMensaje = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoMensaje.trim() || !conversacion || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/chat/${conversacion.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mensaje: nuevoMensaje.trim() }),
      });
      if (res.ok) {
        setNuevoMensaje("");
        const res2 = await fetch(`/api/chat/${conversacion.id}`, { credentials: "include" });
        if (res2.ok) {
          const data = await res2.json();
          setMensajes(data.mensajes || []);
        }
      }
    } catch { /* silenciar */ }
    setEnviando(false);
  };

  const crearConsulta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asunto.trim() || !consulta.trim() || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ asunto: asunto.trim(), mensaje: consulta.trim() }),
      });
      if (res.ok) {
        setAsunto("");
        setConsulta("");
        await cargarConvActiva();
      } else {
        const err = await res.json();
        alert(err.error || "Error");
      }
    } catch { /* silenciar */ }
    setEnviando(false);
  };

  if (loading || !session) return null;

  // Para Mesa, el widget solo muestra badge y link a la página completa
  if (isMesa) {
    return (
      <div className="fixed bottom-5 right-5 z-50">
        <a
          href="/dashboard/chat"
          className="relative flex items-center justify-center w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-transform hover:scale-105"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
          </svg>
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
              {unread}
            </span>
          )}
        </a>
      </div>
    );
  }

  // Widget para técnicos
  return (
    <div className="fixed bottom-5 right-5 z-50">
      {/* Panel flotante */}
      {open && (
        <div className="absolute bottom-16 right-0 w-80 sm:w-96 h-[480px] bg-white dark:bg-surface-800 rounded-2xl shadow-2xl border border-surface-200 dark:border-surface-700 flex flex-col overflow-hidden animate-in slide-in-from-bottom-2">
          {/* Header */}
          <div className="bg-blue-600 p-3 flex items-center justify-between">
            <div>
              <h3 className="text-white font-semibold text-sm">Mesa de Ayuda</h3>
              <p className="text-blue-200 text-[11px]">
                {conversacion
                  ? conversacion.estado === "EN_CURSO" ? "Conectado" : conversacion.estado === "ABIERTA" ? "Esperando agente..." : "Cerrada"
                  : "Enviar una consulta"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <a
                href="/dashboard/chat"
                className="p-1.5 text-blue-200 hover:text-white transition"
                title="Abrir chat completo"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 text-blue-200 hover:text-white transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
            </div>
          </div>

          {/* Contenido */}
          {vista === "inicio" && !conversacion && (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-surface-800 dark:text-surface-100 mb-1">
                ¿Tenés alguna duda?
              </h4>
              <p className="text-xs text-surface-500 dark:text-surface-400 mb-4">
                Mesa de Ayuda te responderá lo antes posible
              </p>
              <button
                onClick={() => setVista("crear")}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                Iniciar consulta
              </button>
            </div>
          )}

          {vista === "crear" && (
            <form onSubmit={crearConsulta} className="flex-1 flex flex-col p-4 gap-3">
              <input
                type="text"
                placeholder="Asunto breve..."
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                maxLength={200}
                className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-800 dark:text-surface-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <textarea
                placeholder="Describí tu consulta..."
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                maxLength={2000}
                className="flex-1 w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-800 dark:text-surface-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVista("inicio")}
                  className="flex-1 py-2 text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!asunto.trim() || !consulta.trim() || enviando}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {enviando ? "Enviando..." : "Enviar"}
                </button>
              </div>
            </form>
          )}

          {vista === "chat" && conversacion && (
            <>
              {/* Mensajes */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {mensajes.map((msg) => {
                  const esMio = msg.autorId === session?.userId;
                  return (
                    <div key={msg.id} className={clsx("flex", esMio ? "justify-end" : "justify-start")}>
                      <div className={clsx(
                        "max-w-[85%] rounded-2xl px-3 py-2",
                        esMio
                          ? "bg-blue-600 text-white rounded-br-md"
                          : "bg-surface-100 dark:bg-surface-700 text-surface-800 dark:text-surface-100 rounded-bl-md"
                      )}>
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.contenido}</p>
                        <p className={clsx(
                          "text-[10px] mt-0.5",
                          esMio ? "text-blue-200" : "text-surface-400 dark:text-surface-500"
                        )}>
                          {new Date(msg.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              {conversacion.estado !== "CERRADA" ? (
                <form onSubmit={enviarMensaje} className="p-2 border-t border-surface-200 dark:border-surface-700">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={conversacion.estado === "ABIERTA" ? "Esperando agente..." : "Mensaje..."}
                      disabled={conversacion.estado === "ABIERTA"}
                      value={nuevoMensaje}
                      onChange={(e) => setNuevoMensaje(e.target.value)}
                      maxLength={2000}
                      className="flex-1 px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-800 dark:text-surface-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={!nuevoMensaje.trim() || enviando || conversacion.estado === "ABIERTA"}
                      className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                      </svg>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-3 border-t border-surface-200 dark:border-surface-700 text-center">
                  <p className="text-xs text-surface-400 dark:text-surface-500 mb-2">Consulta cerrada</p>
                  <button
                    onClick={() => { setConversacion(null); setMensajes([]); setVista("inicio"); }}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition"
                  >
                    Nueva consulta
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Botón flotante */}
      <button
        onClick={() => open ? setOpen(false) : handleOpen()}
        className={clsx(
          "relative flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all duration-200",
          open
            ? "bg-surface-600 hover:bg-surface-700 rotate-0"
            : "bg-blue-600 hover:bg-blue-700 hover:scale-105"
        )}
      >
        {open ? (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
        )}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 animate-pulse">
            {unread}
          </span>
        )}
      </button>
    </div>
  );
}
