"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "@/hooks/useSession";
import { usePathname } from "next/navigation";
import clsx from "clsx";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_AUDIO_SECONDS = 120; // 2 minutos
const ALLOWED_FILE_TYPES = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/ogg,audio/wav,audio/webm,audio/mp4,application/zip,application/x-zip-compressed";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function ChatArchivo({ msg }: { msg: any }) {
  if (!msg.archivoUrl) return null;
  const tipo = (msg.archivoTipo || "").split(";")[0].trim();
  const downloadUrl = `/api/chat/archivo/${msg.id}`;
  const inlineUrl = `${downloadUrl}?inline=true`;

  const DownloadBtn = () => (
    <a href={downloadUrl} download className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 transition text-[10px] opacity-70 hover:opacity-100">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
      Descargar
    </a>
  );

  if (tipo.startsWith("image/")) {
    return (
      <div className="mt-1">
        <a href={inlineUrl} target="_blank" rel="noopener noreferrer">
          <img src={inlineUrl} alt={msg.archivoNombre} className="max-w-[200px] max-h-[150px] rounded-lg object-cover cursor-pointer hover:opacity-90" loading="lazy" />
        </a>
        <div className="flex items-center gap-2">
          <p className="text-[10px] opacity-60 mt-0.5">{msg.archivoNombre} · {formatFileSize(msg.archivoTamanio)}</p>
          <DownloadBtn />
        </div>
      </div>
    );
  }
  if (tipo.startsWith("video/")) {
    return (
      <div className="mt-1">
        <video src={inlineUrl} controls playsInline className="max-w-[220px] max-h-[160px] rounded-lg" preload="metadata" />
        <div className="flex items-center gap-2">
          <p className="text-[10px] opacity-60 mt-0.5">{msg.archivoNombre} · {formatFileSize(msg.archivoTamanio)}</p>
          <DownloadBtn />
        </div>
      </div>
    );
  }
  if (tipo.startsWith("audio/")) {
    return (
      <div className="mt-1">
        <audio src={inlineUrl} controls className="max-w-[220px] h-8" preload="metadata" />
        <p className="text-[10px] opacity-60 mt-0.5">{msg.archivoNombre} · {formatFileSize(msg.archivoTamanio)}</p>
      </div>
    );
  }
  // zip u otros
  return (
    <a href={downloadUrl} className="mt-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 transition text-xs" download>
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
      <span className="truncate">{msg.archivoNombre}</span>
      <span className="text-[10px] opacity-60 flex-shrink-0">{formatFileSize(msg.archivoTamanio)}</span>
    </a>
  );
}

export default function ChatFloatingWidget() {
  const { session, loading, isMesa } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [conversacion, setConversacion] = useState<any>(null);
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [grabSegundos, setGrabSegundos] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const grabTimerRef = useRef<ReturnType<typeof setInterval>>();
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
    if (isMesa) return;
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
        const res3 = await fetch(`/api/chat/${data[0].id}`, { credentials: "include" });
        if (res3.ok) {
          const detalle = await res3.json();
          setMensajes(detalle.mensajes || []);
        }
      } else {
        setConversacion(null);
        setMensajes([]);
      }
    } catch { /* silenciar */ }
  }, [isMesa]);

  useEffect(() => {
    if (loading || !session) return;
    checkUnread();
    const interval = setInterval(checkUnread, 10000);
    return () => clearInterval(interval);
  }, [loading, session, checkUnread]);

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
    if (mensajes.length > prevMsgCountRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCountRef.current = mensajes.length;
  }, [mensajes]);

  const handleOpen = async () => {
    setOpen(true);
    setUnread(0);
    if (!isMesa) {
      await cargarConvActiva();
    }
  };

  // ── Upload de archivos ──
  const subirArchivo = async (file: File) => {
    setSubiendo(true);
    try {
      let convId = conversacion?.id;
      // Si no hay conversación activa, crear una con mensaje descriptivo
      if (!convId) {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ mensaje: `[Archivo adjunto: ${file.name}]` }),
        });
        if (!res.ok) { const err = await res.json(); alert(err.error || "Error al crear conversación"); setSubiendo(false); return; }
        const created = await res.json();
        convId = created.id;
        if (!convId) { alert("No se pudo crear la conversación"); setSubiendo(false); return; }
        await cargarConvActiva();
      }
      const fd = new FormData();
      fd.append("file", file);
      fd.append("conversacionId", convId);
      const res = await fetch("/api/chat/upload", { method: "POST", credentials: "include", body: fd });
      if (res.ok) {
        const res2 = await fetch(`/api/chat/${convId}`, { credentials: "include" });
        if (res2.ok) { const data = await res2.json(); setMensajes(data.mensajes || []); }
      } else {
        const err = await res.json();
        alert(err.error || "Error al subir archivo");
      }
    } catch (err) { console.error("[ChatWidget] Error subiendo archivo:", err); alert("Error al subir archivo. Intentá de nuevo."); }
    setSubiendo(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) subirArchivo(file);
    e.target.value = "";
  };

  // ── Grabación de audio ──
  const iniciarGrabacion = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      setGrabSegundos(0);
      setGrabando(true);

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(grabTimerRef.current);
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        const ext = mediaRecorder.mimeType.includes("webm") ? "webm" : "mp4";
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: mediaRecorder.mimeType });
        setGrabando(false);
        setGrabSegundos(0);
        await subirArchivo(file);
      };

      mediaRecorder.start(1000);
      grabTimerRef.current = setInterval(() => {
        setGrabSegundos((s) => {
          if (s + 1 >= MAX_AUDIO_SECONDS) { mediaRecorderRef.current?.stop(); return 0; }
          return s + 1;
        });
      }, 1000);
    } catch {
      alert("No se pudo acceder al micrófono");
    }
  };

  const detenerGrabacion = () => { mediaRecorderRef.current?.stop(); };

  if (isHidden) return null;

  const enviarMensaje = async (e: React.FormEvent) => {
    e.preventDefault();
    const texto = nuevoMensaje.trim();
    if (!texto || enviando) return;

    setEnviando(true);
    try {
      if (!conversacion) {
        // Crear nueva conversación con el primer mensaje
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ mensaje: texto }),
        });
        if (res.ok) {
          setNuevoMensaje("");
          await cargarConvActiva();
        } else {
          const err = await res.json().catch(() => ({}));
          alert(err.error || "Error");
        }
      } else {
        // Conversación existente: enviar mensaje
        const res = await fetch(`/api/chat/${conversacion.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ mensaje: texto }),
        });
        if (res.ok) {
          setNuevoMensaje("");
          const res2 = await fetch(`/api/chat/${conversacion.id}`, { credentials: "include" });
          if (res2.ok) {
            const data = await res2.json();
            setMensajes(data.mensajes || []);
          }
        }
      }
    } catch { /* silenciar */ } finally {
      setEnviando(false);
    }
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

  // Widget para técnicos — chat directo
  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="absolute bottom-16 right-0 w-80 sm:w-96 h-[480px] bg-white dark:bg-surface-800 rounded-2xl shadow-2xl border border-surface-200 dark:border-surface-700 flex flex-col overflow-hidden animate-in slide-in-from-bottom-2">
          {/* Header */}
          <div className="bg-blue-600 p-3 flex items-center justify-between">
            <div>
              <h3 className="text-white font-semibold text-sm">Mesa de Ayuda</h3>
              <p className="text-blue-200 text-[11px]">
                {conversacion
                  ? conversacion.estado === "EN_CURSO" ? "Conectado" : conversacion.estado === "ABIERTA" ? "Esperando agente..." : "Cerrada"
                  : "Escribí tu consulta"}
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

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {mensajes.length === 0 && !conversacion && (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-3">
                  <svg className="w-7 h-7 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <p className="text-xs text-surface-500 dark:text-surface-400">
                  Escribí tu mensaje y Mesa de Ayuda te responderá
                </p>
              </div>
            )}
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
                    {!msg.archivoUrl && <p className="text-sm whitespace-pre-wrap break-words">{msg.contenido}</p>}
                    <ChatArchivo msg={msg} />
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

          {/* Input — siempre visible */}
          {(!conversacion || conversacion.estado !== "CERRADA") ? (
            <div className="p-2 border-t border-surface-200 dark:border-surface-700">
              <input ref={fileInputRef} type="file" accept={ALLOWED_FILE_TYPES} capture={undefined} className="hidden" onChange={handleFileSelect} />

              {grabando ? (
                <div className="flex items-center gap-2 px-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs text-red-500 font-medium flex-1">
                    Grabando... {Math.floor(grabSegundos / 60)}:{String(grabSegundos % 60).padStart(2, "0")} / 2:00
                  </span>
                  <button type="button" onClick={detenerGrabacion} className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition" title="Enviar audio">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                    </svg>
                  </button>
                </div>
              ) : subiendo ? (
                <div className="flex items-center justify-center gap-2 py-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
                  <span className="text-xs text-surface-500">Subiendo archivo...</span>
                </div>
              ) : (
                <form onSubmit={enviarMensaje} className="flex items-center gap-1 touch-manipulation">
                  {/* Adjuntar archivo */}
                  {(!conversacion || conversacion.estado !== "ABIERTA") && (
                    <>
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1.5 text-surface-400 hover:text-blue-500 transition" title="Adjuntar archivo">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                        </svg>
                      </button>
                      {/* Grabar audio */}
                      <button type="button" onClick={iniciarGrabacion} className="p-1.5 text-surface-400 hover:text-red-500 transition" title="Grabar audio (máx 2 min)">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                        </svg>
                      </button>
                    </>
                  )}
                  <input
                    type="text"
                    placeholder="Escribí tu consulta..."
                    disabled={false}
                    value={nuevoMensaje}
                    onChange={(e) => setNuevoMensaje(e.target.value)}
                    maxLength={2000}
                    className="flex-1 px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-800 dark:text-surface-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!nuevoMensaje.trim() || enviando}
                    onMouseDown={(e) => e.preventDefault()}
                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition touch-manipulation"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="p-3 border-t border-surface-200 dark:border-surface-700 text-center">
              <p className="text-xs text-surface-400 dark:text-surface-500 mb-2">Consulta cerrada</p>
              <button
                onClick={() => { setConversacion(null); setMensajes([]); }}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition"
              >
                Nueva consulta
              </button>
            </div>
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
