"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "@/hooks/useSession";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import clsx from "clsx";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  ABIERTA: { label: "Esperando", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  EN_CURSO: { label: "En curso", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  CERRADA: { label: "Cerrada", className: "bg-surface-100 text-surface-500 dark:bg-surface-700 dark:text-surface-400" },
};

export default function ChatPage() {
  const { session, isMesa } = useSession();
  const [conversaciones, setConversaciones] = useState<any[]>([]);
  const [seleccionada, setSeleccionada] = useState<any>(null);
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState("");
  const [nuevoAsunto, setNuevoAsunto] = useState("");
  const [nuevaConsulta, setNuevaConsulta] = useState("");
  const [creando, setCreando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [vistaMovil, setVistaMovil] = useState<"lista" | "chat">("lista");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // Cargar conversaciones
  const cargarConversaciones = useCallback(async () => {
    try {
      const res = await fetch("/api/chat", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setConversaciones(data);
      }
    } catch { /* silenciar */ }
  }, []);

  // Cargar mensajes de una conversación
  const cargarMensajes = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/chat/${id}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMensajes(data.mensajes || []);
        setSeleccionada(data);
      }
    } catch { /* silenciar */ }
  }, []);

  useEffect(() => {
    cargarConversaciones().finally(() => setLoading(false));
  }, [cargarConversaciones]);

  // Polling cada 5s para mensajes nuevos
  useEffect(() => {
    pollRef.current = setInterval(() => {
      cargarConversaciones();
      if (seleccionada?.id) cargarMensajes(seleccionada.id);
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, [seleccionada?.id, cargarConversaciones, cargarMensajes]);

  // Scroll al último mensaje
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  const seleccionarConv = (conv: any) => {
    setSeleccionada(conv);
    cargarMensajes(conv.id);
    setVistaMovil("chat");
  };

  const enviarMensaje = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoMensaje.trim() || !seleccionada || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/chat/${seleccionada.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mensaje: nuevoMensaje.trim() }),
      });
      if (res.ok) {
        setNuevoMensaje("");
        await cargarMensajes(seleccionada.id);
      }
    } catch { /* silenciar */ }
    setEnviando(false);
  };

  const crearConsulta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoAsunto.trim() || !nuevaConsulta.trim() || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ asunto: nuevoAsunto.trim(), mensaje: nuevaConsulta.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setNuevoAsunto("");
        setNuevaConsulta("");
        setCreando(false);
        await cargarConversaciones();
        seleccionarConv(data);
      } else {
        const err = await res.json();
        alert(err.error || "Error al crear consulta");
      }
    } catch { /* silenciar */ }
    setEnviando(false);
  };

  const tomarConversacion = async (id: string) => {
    try {
      const res = await fetch(`/api/chat/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accion: "tomar" }),
      });
      if (res.ok) {
        await cargarConversaciones();
        await cargarMensajes(id);
      }
    } catch { /* silenciar */ }
  };

  const cerrarConversacion = async (id: string) => {
    if (!confirm("¿Cerrar esta consulta? El técnico podrá crear una nueva.")) return;
    try {
      const res = await fetch(`/api/chat/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accion: "cerrar" }),
      });
      if (res.ok) {
        setSeleccionada(null);
        setMensajes([]);
        setVistaMovil("lista");
        await cargarConversaciones();
      }
    } catch { /* silenciar */ }
  };

  const tieneActiva = conversaciones.some(
    (c) => c.creadorId === session?.userId && (c.estado === "ABIERTA" || c.estado === "EN_CURSO")
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-800 dark:text-surface-100">
            {isMesa ? "Mesa de Ayuda" : "Chat de Ayuda"}
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400">
            {isMesa
              ? "Consultá y respondé las dudas de los técnicos"
              : "Enviá tus consultas a Mesa de Ayuda"}
          </p>
        </div>
        {!isMesa && !tieneActiva && (
          <button
            onClick={() => setCreando(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
          >
            Nueva consulta
          </button>
        )}
      </div>

      {/* Form nueva consulta (técnico) */}
      {creando && (
        <Card className="p-4 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700">
          <form onSubmit={crearConsulta} className="space-y-3">
            <h3 className="font-semibold text-surface-800 dark:text-surface-100">Nueva consulta</h3>
            <input
              type="text"
              placeholder="Asunto breve..."
              value={nuevoAsunto}
              onChange={(e) => setNuevoAsunto(e.target.value)}
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-800 dark:text-surface-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <textarea
              placeholder="Describí tu consulta..."
              value={nuevaConsulta}
              onChange={(e) => setNuevaConsulta(e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-800 dark:text-surface-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setCreando(false); setNuevoAsunto(""); setNuevaConsulta(""); }}
                className="px-3 py-1.5 text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviando || !nuevoAsunto.trim() || !nuevaConsulta.trim()}
                className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition text-sm font-medium"
              >
                {enviando ? "Enviando..." : "Enviar consulta"}
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Layout principal: lista + chat */}
      <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[400px]">
        {/* Lista de conversaciones */}
        <div className={clsx(
          "w-full md:w-80 lg:w-96 flex-shrink-0 flex flex-col bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden",
          vistaMovil === "chat" && "hidden md:flex"
        )}>
          <div className="p-3 border-b border-surface-200 dark:border-surface-700">
            <h2 className="text-sm font-semibold text-surface-600 dark:text-surface-300">
              {isMesa ? "Consultas" : "Mis consultas"}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversaciones.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-surface-400 dark:text-surface-500 p-4 text-center">
                <svg className="w-12 h-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
                <p className="text-sm">
                  {isMesa ? "No hay consultas pendientes" : "No tenés consultas aún"}
                </p>
              </div>
            ) : (
              conversaciones.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => seleccionarConv(conv)}
                  className={clsx(
                    "w-full text-left p-3 border-b border-surface-100 dark:border-surface-700/50 hover:bg-surface-50 dark:hover:bg-surface-700/50 transition",
                    seleccionada?.id === conv.id && "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-surface-800 dark:text-surface-100 truncate">
                        {conv.asunto}
                      </p>
                      <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                        {isMesa ? conv.creador?.nombre : "Mesa de Ayuda"} ·{" "}
                        {formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true, locale: es })}
                      </p>
                      {conv.mensajes?.[0] && (
                        <p className="text-xs text-surface-400 dark:text-surface-500 mt-1 truncate">
                          {conv.mensajes[0].contenido}
                        </p>
                      )}
                    </div>
                    <Badge className={ESTADO_BADGE[conv.estado]?.className || ""}>
                      {ESTADO_BADGE[conv.estado]?.label || conv.estado}
                    </Badge>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Panel de chat */}
        <div className={clsx(
          "flex-1 flex flex-col bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden",
          vistaMovil === "lista" && "hidden md:flex"
        )}>
          {!seleccionada ? (
            <div className="flex-1 flex flex-col items-center justify-center text-surface-400 dark:text-surface-500">
              <svg className="w-16 h-16 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
              </svg>
              <p className="text-sm">Seleccioná una conversación</p>
            </div>
          ) : (
            <>
              {/* Header del chat */}
              <div className="p-3 border-b border-surface-200 dark:border-surface-700 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => { setVistaMovil("lista"); setSeleccionada(null); }}
                    className="md:hidden p-1 text-surface-500 hover:text-surface-700 dark:text-surface-400"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-100 truncate">
                      {seleccionada.asunto}
                    </h3>
                    <p className="text-xs text-surface-500 dark:text-surface-400">
                      {isMesa ? seleccionada.creador?.nombre : "Mesa de Ayuda"}
                      {" · "}
                      <span className={clsx(
                        seleccionada.estado === "EN_CURSO" && "text-blue-500",
                        seleccionada.estado === "ABIERTA" && "text-amber-500",
                        seleccionada.estado === "CERRADA" && "text-surface-400"
                      )}>
                        {ESTADO_BADGE[seleccionada.estado]?.label}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {isMesa && seleccionada.estado === "ABIERTA" && (
                    <button
                      onClick={() => tomarConversacion(seleccionada.id)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition"
                    >
                      Tomar
                    </button>
                  )}
                  {isMesa && seleccionada.estado === "EN_CURSO" && seleccionada.agenteId === session?.userId && (
                    <button
                      onClick={() => cerrarConversacion(seleccionada.id)}
                      className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 transition"
                    >
                      Cerrar
                    </button>
                  )}
                </div>
              </div>

              {/* Mensajes */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {mensajes.map((msg) => {
                  const esMio = msg.autorId === session?.userId;
                  return (
                    <div key={msg.id} className={clsx("flex", esMio ? "justify-end" : "justify-start")}>
                      <div className={clsx(
                        "max-w-[80%] rounded-2xl px-4 py-2.5",
                        esMio
                          ? "bg-blue-600 text-white rounded-br-md"
                          : "bg-surface-100 dark:bg-surface-700 text-surface-800 dark:text-surface-100 rounded-bl-md"
                      )}>
                        {!esMio && (
                          <p className={clsx(
                            "text-[11px] font-medium mb-0.5",
                            esMio ? "text-blue-200" : "text-surface-500 dark:text-surface-400"
                          )}>
                            {isMesa ? msg.autor?.nombre : "Mesa de Ayuda"}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.contenido}</p>
                        <p className={clsx(
                          "text-[10px] mt-1",
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

              {/* Input de mensaje */}
              {seleccionada.estado !== "CERRADA" && (
                (isMesa ? seleccionada.agenteId === session?.userId : true) ? (
                  <form onSubmit={enviarMensaje} className="p-3 border-t border-surface-200 dark:border-surface-700">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder={
                          seleccionada.estado === "ABIERTA" && !isMesa
                            ? "Esperando que Mesa tome tu consulta..."
                            : "Escribí un mensaje..."
                        }
                        disabled={seleccionada.estado === "ABIERTA" && !isMesa}
                        value={nuevoMensaje}
                        onChange={(e) => setNuevoMensaje(e.target.value)}
                        maxLength={2000}
                        className="flex-1 px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-800 dark:text-surface-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={!nuevoMensaje.trim() || enviando || (seleccionada.estado === "ABIERTA" && !isMesa)}
                        className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                        </svg>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="p-3 border-t border-surface-200 dark:border-surface-700 text-center text-xs text-surface-400">
                    Tomá esta conversación primero para responder
                  </div>
                )
              )}
              {seleccionada.estado === "CERRADA" && (
                <div className="p-3 border-t border-surface-200 dark:border-surface-700 text-center text-xs text-surface-400 dark:text-surface-500">
                  Esta consulta fue cerrada
                  {seleccionada.cerradoAt && (
                    <> · {formatDistanceToNow(new Date(seleccionada.cerradoAt), { addSuffix: true, locale: es })}</>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
