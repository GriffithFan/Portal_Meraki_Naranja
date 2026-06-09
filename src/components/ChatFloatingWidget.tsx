"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useSession } from "@/hooks/useSession";
import { useChatReminders } from "@/hooks/useChatReminders";
import ChatMediaViewer from "@/components/chat/ChatMediaViewer";
import { usePathname } from "next/navigation";
import clsx from "clsx";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_AUDIO_SECONDS = 120; // 2 minutos
const ALLOWED_FILE_TYPES = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/ogg,audio/wav,audio/webm,audio/mp4,application/pdf,.pdf,application/zip,application/x-zip-compressed";
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏", "🎉"];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function ChatArchivo({ msg, onOpenMedia }: { msg: any; onOpenMedia: (msg: any) => void }) {
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
        <button type="button" onClick={() => onOpenMedia(msg)} className="block text-left">
          <Image src={inlineUrl} alt={msg.archivoNombre} width={200} height={150} unoptimized className="max-w-[200px] max-h-[150px] w-auto h-auto rounded-lg object-cover cursor-pointer hover:opacity-90" />
        </button>
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
    <button type="button" onClick={() => onOpenMedia(msg)} className="mt-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 transition text-xs text-left">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
      <span className="truncate">{msg.archivoNombre}</span>
      <span className="text-[10px] opacity-60 flex-shrink-0">{formatFileSize(msg.archivoTamanio)}</span>
    </button>
  );
}

function messagePreview(msg: any) {
  if (!msg) return "Mensaje";
  if (msg.archivoNombre) return msg.contenido && msg.contenido !== msg.archivoNombre ? msg.contenido : msg.archivoNombre;
  return msg.contenido || "Mensaje";
}

function authorLabel(msg: any, sessionUserId?: string) {
  if (msg?.autorId === sessionUserId) return "Vos";
  return msg?.autor?.nombre || "Mesa de Ayuda";
}

function formatMiniDate(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

const SUPPORT_STATE_BADGE: Record<string, { label: string; className: string }> = {
  ABIERTA: { label: "Esperando", className: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700" },
  EN_CURSO: { label: "En curso", className: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:ring-blue-700" },
  CERRADA: { label: "Cerrada", className: "bg-surface-100 text-surface-500 ring-surface-200 dark:bg-surface-700 dark:text-surface-300 dark:ring-surface-600" },
};

function ReplyQuote({ msg, esMio, onClick }: { msg: any; esMio: boolean; onClick?: () => void }) {
  if (!msg) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx("mb-1.5 w-full rounded-md border-l-2 px-2 py-1 text-left", esMio ? "border-blue-200 bg-white/15" : "border-blue-400 bg-white/70 dark:bg-surface-600/70")}
    >
      <p className={clsx("text-[10px] font-semibold", esMio ? "text-blue-100" : "text-blue-600 dark:text-blue-300")}>{msg.autor?.nombre || "Mensaje"}</p>
      <p className={clsx("line-clamp-2 text-[11px]", esMio ? "text-blue-50" : "text-surface-500 dark:text-surface-300")}>{messagePreview(msg)}</p>
    </button>
  );
}

function ReactionSummary({ msg, sessionUserId, onReact }: { msg: any; sessionUserId?: string; onReact: (msg: any, emoji: string) => void }) {
  const reacciones = msg.reacciones || [];
  if (reacciones.length === 0) return null;
  const counts = QUICK_REACTIONS
    .map((emoji) => ({ emoji, count: reacciones.filter((r: any) => r.emoji === emoji).length, mine: reacciones.some((r: any) => r.emoji === emoji && r.userId === sessionUserId) }))
    .filter((item) => item.count > 0);

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {counts.map((item) => (
        <button key={item.emoji} type="button" onClick={() => onReact(msg, item.emoji)} className={clsx("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] shadow-sm", item.mine ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-200" : "border-surface-200 bg-white text-surface-600 dark:border-surface-600 dark:bg-surface-700 dark:text-surface-200")} title={item.mine ? "Quitar reacción" : "Reaccionar"}>
          <span>{item.emoji}</span>
          <span className="font-semibold">{item.count}</span>
        </button>
      ))}
    </div>
  );
}

function ReactionPicker({ msg, onReact, placement }: { msg: any; onReact: (msg: any, emoji: string) => void; placement: "top" | "bottom" }) {
  return (
    <div className={clsx("absolute z-20 flex rounded-full border border-surface-200 bg-white p-1 shadow-lg dark:border-surface-700 dark:bg-surface-800", placement === "bottom" ? "top-full mt-1" : "bottom-full mb-1")}>
      {QUICK_REACTIONS.map((emoji) => (
        <button key={emoji} type="button" onClick={() => onReact(msg, emoji)} className="rounded-full px-1.5 py-1 text-sm hover:bg-surface-100 dark:hover:bg-surface-700" title={`Reaccionar ${emoji}`}>
          {emoji}
        </button>
      ))}
    </div>
  );
}

export default function ChatFloatingWidget() {
  const { session, loading, isMesa, isModOrAdmin } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [supportConversations, setSupportConversations] = useState<any[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [conversacion, setConversacion] = useState<any>(null);
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [grabSegundos, setGrabSegundos] = useState(0);
  const [respondiendoA, setRespondiendoA] = useState<any | null>(null);
  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(null);
  const [reactionPickerMsg, setReactionPickerMsg] = useState<{ id: string; placement: "top" | "bottom" } | null>(null);
  const [mediaViewerMsg, setMediaViewerMsg] = useState<any | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevMsgCountRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const grabTimerRef = useRef<ReturnType<typeof setInterval>>();
  const unreadLoadingRef = useRef(false);
  const convActivaLoadingRef = useRef(false);
  const supportLoadingRef = useRef(false);
  const pollMensajesLoadingRef = useRef(false);
  const isHidden = pathname === "/dashboard/chat";
  const isSupportUser = isMesa || isModOrAdmin;
  useChatReminders(Boolean(session) && !isHidden, session?.userId || "default");

  const scrollToMessage = useCallback((id: string) => {
    const node = messageRefs.current.get(id);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightMsgId(id);
    window.setTimeout(() => setHighlightMsgId((current) => current === id ? null : current), 1400);
  }, []);

  const toggleReactionPicker = useCallback((id: string, event: any) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = rect.top < 120 ? "bottom" : "top";
    setReactionPickerMsg((current) => current?.id === id ? null : { id, placement });
  }, []);

  const mergeMensajes = useCallback((nuevos: any[]) => {
    if (nuevos.length === 0) return;
    setMensajes(prev => {
      const byId = new Map(prev.map((msg: any) => [msg.id, msg]));
      for (const msg of nuevos) byId.set(msg.id, msg);
      return Array.from(byId.values()).sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });
  }, []);

  const checkUnread = useCallback(async () => {
    if (unreadLoadingRef.current) return;
    unreadLoadingRef.current = true;
    try {
      const res = await fetch("/api/chat/sin-leer", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUnread(data.count);
      }
    } catch { /* silenciar */ }
    finally { unreadLoadingRef.current = false; }
  }, []);

  const cargarConvActiva = useCallback(async () => {
    if (isMesa) return;
    if (convActivaLoadingRef.current) return;
    convActivaLoadingRef.current = true;
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
        setRespondiendoA(null);
      }
    } catch { /* silenciar */ }
    finally { convActivaLoadingRef.current = false; }
  }, [isMesa]);

  const cargarConversacionesSoporte = useCallback(async () => {
    if (!isSupportUser) return;
    if (supportLoadingRef.current) return;
    supportLoadingRef.current = true;
    setSupportLoading(true);
    try {
      const res = await fetch("/api/chat", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSupportConversations(Array.isArray(data) ? data.slice(0, 8) : []);
      }
    } catch { /* silenciar */ }
    finally {
      supportLoadingRef.current = false;
      setSupportLoading(false);
    }
  }, [isSupportUser]);

  const cargarConversacionSoporte = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/chat/${id}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setConversacion(data);
      setMensajes(data.mensajes || []);
      setRespondiendoA(null);
      setReactionPickerMsg(null);
    } catch { /* silenciar */ }
  }, []);

  const tomarConversacionRapida = useCallback(async (id: string) => {
    const res = await fetch(`/api/chat/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ accion: "tomar" }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "No se pudo tomar la conversación");
      return null;
    }
    const updated = await res.json();
    setConversacion((prev: any) => prev?.id === id ? { ...prev, ...updated } : prev);
    await cargarConversacionesSoporte();
    return updated;
  }, [cargarConversacionesSoporte]);

  useEffect(() => {
    if (loading || !session) return;
    checkUnread();
    const interval = setInterval(() => {
      if (document.visibilityState !== "hidden") checkUnread();
    }, 10000);
    return () => clearInterval(interval);
  }, [loading, session, checkUnread]);

  useEffect(() => {
    if (!open || !isSupportUser) return;
    const interval = setInterval(() => {
      if (document.visibilityState !== "hidden") cargarConversacionesSoporte();
    }, 10000);
    return () => clearInterval(interval);
  }, [cargarConversacionesSoporte, isSupportUser, open]);

  useEffect(() => {
    if (!open || !conversacion?.id) return;
    pollRef.current = setInterval(async () => {
      if (document.visibilityState === "hidden") return;
      if (pollMensajesLoadingRef.current) return;
      pollMensajesLoadingRef.current = true;
      try {
        const ultimo = mensajes[mensajes.length - 1]?.createdAt;
        const query = ultimo ? `?since=${encodeURIComponent(ultimo)}` : "";
        const res = await fetch(`/api/chat/${conversacion.id}${query}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (ultimo) mergeMensajes(data.mensajes || []);
          else setMensajes(data.mensajes || []);
          if (data.estado === "CERRADA") {
            // Auto-limpiar: mostrar vista de nueva consulta
            setConversacion(null);
            setMensajes([]);
            setRespondiendoA(null);
          }
        }
      } catch { /* silenciar */ }
      finally { pollMensajesLoadingRef.current = false; }
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, [open, conversacion?.id, mensajes, mergeMensajes]);

  useEffect(() => {
    if (mensajes.length > prevMsgCountRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCountRef.current = mensajes.length;
  }, [mensajes]);

  const handleOpen = async () => {
    setOpen(true);
    if (isSupportUser) {
      await cargarConversacionesSoporte();
      return;
    }
    setUnread(0);
    if (!isMesa) {
      await cargarConvActiva();
    }
  };

  // ── Upload de archivos ──
  const subirArchivos = async (files: File[]) => {
    if (files.length === 0) return;
    setSubiendo(true);
    try {
      let convId = conversacion?.id;
      // Si no hay conversación activa, crear una con mensaje descriptivo
      if (!convId) {
        const label = files.length === 1 ? files[0].name : `${files.length} archivos`;
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ mensaje: `[Archivo adjunto: ${label}]` }),
        });
        if (!res.ok) { const err = await res.json(); alert(err.error || "Error al crear conversación"); setSubiendo(false); return; }
        const created = await res.json();
        convId = created.id;
        if (!convId) { alert("No se pudo crear la conversación"); setSubiendo(false); return; }
        await cargarConvActiva();
      }
      const fd = new FormData();
      files.forEach((file) => fd.append("file", file));
      fd.append("conversacionId", convId);
      if (respondiendoA?.id) fd.append("replyToId", respondiendoA.id);
      const res = await fetch("/api/chat/upload", { method: "POST", credentials: "include", body: fd });
      if (res.ok) {
        setRespondiendoA(null);
        const res2 = await fetch(`/api/chat/${convId}`, { credentials: "include" });
        if (res2.ok) { const data = await res2.json(); setMensajes(data.mensajes || []); }
      } else {
        const err = await res.json();
        alert(err.error || "Error al subir archivo");
      }
    } catch (err) { console.error("[ChatWidget] Error subiendo archivo:", err); alert("Error al subir archivo. Intentá de nuevo."); }
    setSubiendo(false);
  };

  const subirArchivo = async (file: File) => subirArchivos([file]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) subirArchivos(files);
    e.target.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const files: File[] = [];
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void subirArchivos(files);
    }
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

  const enviarTexto = async (texto: string) => {
    const mensajeTexto = texto.trim();
    if (!mensajeTexto || enviando) return;

    setEnviando(true);
    try {
      if (isSupportUser && !conversacion) return;
      if (isSupportUser && conversacion?.estado === "CERRADA") {
        alert("Esta conversación está cerrada. Abrí el chat completo para revisar el historial.");
        return;
      }
      if (isSupportUser && conversacion?.estado === "ABIERTA") {
        const tomada = await tomarConversacionRapida(conversacion.id);
        if (!tomada) return;
      }

      if (!conversacion) {
        // Crear nueva conversación con el primer mensaje
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ mensaje: mensajeTexto }),
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
          body: JSON.stringify({ mensaje: mensajeTexto, replyToId: respondiendoA?.id }),
        });
        if (res.ok) {
          setNuevoMensaje("");
          setRespondiendoA(null);
          const res2 = await fetch(`/api/chat/${conversacion.id}`, { credentials: "include" });
          if (res2.ok) {
            const data = await res2.json();
            setConversacion(data);
            setMensajes(data.mensajes || []);
          }
          if (isSupportUser) await cargarConversacionesSoporte();
        }
      }
    } catch { /* silenciar */ } finally {
      setEnviando(false);
    }
  };

  const enviarMensaje = async (e: React.FormEvent) => {
    e.preventDefault();
    await enviarTexto(nuevoMensaje);
  };

  const reaccionarMensaje = async (msg: any, emoji: string) => {
    setReactionPickerMsg(null);
    try {
      const res = await fetch(`/api/chat/mensaje/${msg.id}/reaccion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Error al reaccionar");
        return;
      }
      const data = await res.json();
      setMensajes((prev) => prev.map((item: any) => item.id === data.mensajeId ? { ...item, reacciones: data.reacciones } : item));
    } catch {
      alert("Error de conexión");
    }
  };

  if (loading || !session) return null;

  // Para Mesa/Admin/Mod: mini bandeja sin sacar al usuario de la pantalla actual.
  if (isSupportUser) {
    return (
      <div className="fixed bottom-4 right-4 z-50 sm:bottom-5 sm:right-5">
        {/* Input oculto — mismo ref que técnico, ramas mutuamente excluyentes */}
        <input ref={fileInputRef} id="chat-file-support" type="file" accept={ALLOWED_FILE_TYPES} multiple className="sr-only" onChange={handleFileSelect} />
        {open && (
          <div className="fixed inset-x-3 bottom-20 flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-2xl animate-in slide-in-from-bottom-2 dark:border-surface-700 dark:bg-surface-800 sm:absolute sm:inset-auto sm:bottom-16 sm:right-0 sm:h-[430px] sm:w-[380px]">
            <div className="flex items-center justify-between border-b border-surface-100 bg-blue-600 px-3 py-3 dark:border-surface-700">
              <div className="flex min-w-0 items-center gap-2">
                {conversacion && (
                  <button
                    type="button"
                    onClick={() => { setConversacion(null); setMensajes([]); setRespondiendoA(null); }}
                    className="rounded-md p-1.5 text-blue-100 transition hover:bg-white/10 hover:text-white"
                    title="Volver a conversaciones"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                )}
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-white">{conversacion?.creador?.nombre || "Chat rapido"}</h3>
                  <p className="text-[11px] text-blue-100">{conversacion ? SUPPORT_STATE_BADGE[conversacion.estado]?.label || "Conversacion" : "Conversaciones recientes"}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!conversacion && (
                  <button
                    type="button"
                    onClick={cargarConversacionesSoporte}
                    disabled={supportLoading}
                    className="rounded-md p-1.5 text-blue-100 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                    title="Actualizar"
                  >
                    <svg className={clsx("h-4 w-4", supportLoading && "animate-spin")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                  </button>
                )}
                <a
                  href={conversacion ? `/dashboard/chat?id=${conversacion.id}` : "/dashboard/chat"}
                  className="rounded-md p-1.5 text-blue-100 transition hover:bg-white/10 hover:text-white"
                  title="Abrir chat completo"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1.5 text-blue-100 transition hover:bg-white/10 hover:text-white"
                  title="Cerrar"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {conversacion ? (
              <>
                <div className="flex-1 space-y-2 overflow-y-auto p-3 overscroll-contain">
                  {mensajes.length === 0 && (
                    <div className="flex h-full items-center justify-center text-center text-xs text-surface-400">
                      Sin mensajes para mostrar
                    </div>
                  )}
                  {mensajes.map((msg) => {
                    const esMio = msg.autorId === session?.userId;
                    return (
                      <div key={msg.id} ref={(el) => { if (el) messageRefs.current.set(msg.id, el); else messageRefs.current.delete(msg.id); }} className={clsx("group/msg flex rounded-lg transition-colors", esMio ? "justify-end" : "justify-start", highlightMsgId === msg.id && "bg-amber-100/70 dark:bg-amber-900/30")}>
                        {esMio && conversacion.estado !== "CERRADA" && (
                          <div className="relative mr-1 flex items-center opacity-0 transition group-hover/msg:opacity-100">
                            {reactionPickerMsg && reactionPickerMsg.id === msg.id && <ReactionPicker msg={msg} onReact={reaccionarMensaje} placement={reactionPickerMsg.placement} />}
                            <button type="button" onClick={(event) => toggleReactionPicker(msg.id, event)} className="p-1 text-surface-300 hover:text-amber-500" title="Reaccionar"><span className="text-sm leading-none">😊</span></button>
                            <button type="button" onClick={() => setRespondiendoA(msg)} className="p-1 text-surface-300 hover:text-blue-500" title="Responder">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                            </button>
                          </div>
                        )}
                        <div className={clsx("max-w-[85%] rounded-2xl px-3 py-2", esMio ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md bg-surface-100 text-surface-800 dark:bg-surface-700 dark:text-surface-100")}>
                          <p className={clsx("mb-1 text-[10px] font-semibold", esMio ? "text-blue-100" : "text-blue-600 dark:text-blue-300")}>{authorLabel(msg, session?.userId)}</p>
                          <ReplyQuote msg={msg.replyTo} esMio={esMio} onClick={() => msg.replyTo?.id && scrollToMessage(msg.replyTo.id)} />
                          {!msg.archivoUrl && <p className="whitespace-pre-wrap break-words text-sm">{msg.contenido}</p>}
                          <ChatArchivo msg={msg} onOpenMedia={setMediaViewerMsg} />
                          <p className={clsx("mt-0.5 text-[10px]", esMio ? "text-blue-200" : "text-surface-400 dark:text-surface-500")}>{new Date(msg.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</p>
                          <ReactionSummary msg={msg} sessionUserId={session?.userId} onReact={reaccionarMensaje} />
                        </div>
                        {!esMio && conversacion.estado !== "CERRADA" && (
                          <div className="relative ml-1 flex items-center opacity-0 transition group-hover/msg:opacity-100">
                            {reactionPickerMsg && reactionPickerMsg.id === msg.id && <ReactionPicker msg={msg} onReact={reaccionarMensaje} placement={reactionPickerMsg.placement} />}
                            <button type="button" onClick={(event) => toggleReactionPicker(msg.id, event)} className="p-1 text-surface-300 hover:text-amber-500" title="Reaccionar"><span className="text-sm leading-none">😊</span></button>
                            <button type="button" onClick={() => setRespondiendoA(msg)} className="p-1 text-surface-300 hover:text-blue-500" title="Responder">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>

                {conversacion.estado !== "CERRADA" ? (
                  <div className="border-t border-surface-100 p-2 dark:border-surface-700">
                    {conversacion.estado === "ABIERTA" && (
                      <p className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-200">Al responder se toma la conversación automáticamente.</p>
                    )}
                    {respondiendoA && (
                      <div className="mb-2 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-2 py-1.5 dark:border-blue-900/50 dark:bg-blue-900/20">
                        <div className="min-w-0 flex-1 border-l-2 border-blue-500 pl-2">
                          <p className="text-[10px] font-semibold text-blue-700 dark:text-blue-300">Respondiendo a {authorLabel(respondiendoA, session?.userId)}</p>
                          <p className="truncate text-[11px] text-surface-600 dark:text-surface-300">{messagePreview(respondiendoA)}</p>
                        </div>
                        <button type="button" onClick={() => setRespondiendoA(null)} className="rounded p-1 text-surface-400 hover:bg-white hover:text-surface-600 dark:hover:bg-surface-700" title="Cancelar respuesta">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    )}
                    {subiendo ? (
                      <div className="flex items-center justify-center gap-2 py-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
                        <span className="text-xs text-surface-500">Subiendo archivo...</span>
                      </div>
                    ) : (
                    <>
                    <div className="mb-2 flex gap-1">
                      {QUICK_REACTIONS.map((emoji) => (
                        <button key={emoji} type="button" onClick={() => enviarTexto(emoji)} className="rounded-full border border-surface-200 bg-white px-2 py-1 text-xs shadow-sm hover:bg-surface-50 dark:border-surface-700 dark:bg-surface-800 dark:hover:bg-surface-700" title={`Enviar ${emoji}`}>{emoji}</button>
                      ))}
                    </div>
                    <form onSubmit={enviarMensaje} className="flex items-center gap-2 touch-manipulation">
                      <label htmlFor="chat-file-support" className="shrink-0 cursor-pointer p-1.5 text-surface-400 hover:text-blue-500 transition" title="Adjuntar archivo">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                        </svg>
                      </label>
                      <input
                        type="text"
                        placeholder={conversacion.estado === "ABIERTA" ? "Responder y tomar..." : "Escribí una respuesta..."}
                        value={nuevoMensaje}
                        onChange={(e) => setNuevoMensaje(e.target.value)}
                        onPaste={handlePaste}
                        maxLength={2000}
                        className="min-w-0 flex-1 rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-surface-800 outline-none focus:ring-2 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-700 dark:text-surface-100"
                      />
                      <button type="submit" disabled={!nuevoMensaje.trim() || enviando} onMouseDown={(e) => e.preventDefault()} className="rounded-lg bg-blue-600 p-2 text-white transition hover:bg-blue-700 disabled:opacity-50" title="Enviar">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                      </button>
                    </form>
                    </>
                    )}
                  </div>
                ) : (
                  <div className="border-t border-surface-100 p-2 dark:border-surface-700">
                    <a href="/dashboard/chat" className="flex w-full items-center justify-center rounded-lg bg-surface-100 px-3 py-2 text-xs font-semibold text-surface-700 transition hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-100">Ver historial completo</a>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-2">
                  {supportLoading && supportConversations.length === 0 ? (
                    <div className="flex h-full items-center justify-center gap-2 text-xs text-surface-400"><div className="h-4 w-4 animate-spin rounded-full border-2 border-surface-200 border-t-blue-500" />Cargando chats...</div>
                  ) : supportConversations.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center px-5 text-center"><p className="text-sm font-medium text-surface-700 dark:text-surface-100">Sin conversaciones recientes</p><p className="mt-1 text-xs text-surface-400">Cuando entre una consulta nueva va a aparecer acá.</p></div>
                  ) : (
                    <div className="space-y-1">
                      {supportConversations.map((conv) => {
                        const last = conv.mensajes?.[0];
                        const badge = SUPPORT_STATE_BADGE[conv.estado] || SUPPORT_STATE_BADGE.CERRADA;
                        const canReply = conv.estado === "ABIERTA" || conv.estado === "EN_CURSO";
                        return (
                          <div key={conv.id} className={clsx("rounded-xl border p-2.5 transition", conv.noLeida ? "border-blue-200 bg-blue-50/70 dark:border-blue-800 dark:bg-blue-900/20" : "border-surface-100 bg-white hover:bg-surface-50 dark:border-surface-700 dark:bg-surface-800 dark:hover:bg-surface-700/60")}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0"><div className="flex min-w-0 items-center gap-1.5">{conv.noLeida && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />}<p className="truncate text-xs font-semibold text-surface-800 dark:text-surface-100">{conv.creador?.nombre || "Usuario"}</p></div><p className="mt-0.5 line-clamp-2 text-[11px] text-surface-500 dark:text-surface-300">{last?.contenido || "Sin mensajes"}</p></div>
                              <div className="flex shrink-0 flex-col items-end gap-1"><span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1", badge.className)}>{badge.label}</span><span className="text-[10px] text-surface-400">{formatMiniDate(last?.createdAt || conv.updatedAt)}</span></div>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px] text-surface-400">{conv._count?.mensajes || 0} mensajes</span>{canReply ? <button type="button" onClick={() => cargarConversacionSoporte(conv.id)} className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-blue-700">Responder</button> : <a href="/dashboard/chat" className="rounded-md border border-surface-200 px-2 py-1 text-[11px] font-medium text-surface-600 transition hover:border-blue-300 hover:text-blue-600 dark:border-surface-600 dark:text-surface-200 dark:hover:border-blue-500 dark:hover:text-blue-300">Ver completo</a>}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="border-t border-surface-100 p-2 dark:border-surface-700"><a href="/dashboard/chat" className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700">Abrir chat completo<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg></a></div>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => open ? setOpen(false) : handleOpen()}
          className={clsx(
            "relative flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-all duration-200 sm:h-14 sm:w-14",
            open ? "bg-surface-600 hover:bg-surface-700" : "bg-blue-600 hover:scale-105 hover:bg-blue-700"
          )}
          title={open ? "Cerrar chat rapido" : "Abrir chat rapido"}
        >
          {open ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
            </svg>
          )}
          {!open && unread > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
              {unread}
            </span>
          )}
        </button>
      </div>
    );
  }

  // Widget para técnicos — chat directo
  return (
    <div className="fixed bottom-4 right-4 z-50 sm:bottom-5 sm:right-5">
      {/* Input oculto siempre montado para que el ref esté disponible en mobile */}
      <input ref={fileInputRef} id="chat-file-widget" type="file" accept={ALLOWED_FILE_TYPES} multiple className="sr-only" onChange={handleFileSelect} />
      {open && (
        <div className="fixed inset-x-3 bottom-20 top-20 flex flex-col overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-2xl animate-in slide-in-from-bottom-2 dark:border-surface-700 dark:bg-surface-800 sm:absolute sm:inset-auto sm:bottom-16 sm:right-0 sm:h-[480px] sm:w-96">
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
                href={conversacion ? `/dashboard/chat?id=${conversacion.id}` : "/dashboard/chat"}
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
          <div className="flex-1 overflow-y-auto p-3 space-y-2 overscroll-contain">
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
                <div
                  key={msg.id}
                  ref={(el) => { if (el) messageRefs.current.set(msg.id, el); else messageRefs.current.delete(msg.id); }}
                  className={clsx("group/msg flex rounded-lg transition-colors", esMio ? "justify-end" : "justify-start", highlightMsgId === msg.id && "bg-amber-100/70 dark:bg-amber-900/30")}
                >
                  {esMio && conversacion?.estado !== "CERRADA" && (
                    <div className="relative mr-1 flex items-center opacity-0 transition group-hover/msg:opacity-100">
                      {reactionPickerMsg && reactionPickerMsg.id === msg.id && <ReactionPicker msg={msg} onReact={reaccionarMensaje} placement={reactionPickerMsg.placement} />}
                      <button type="button" onClick={(event) => toggleReactionPicker(msg.id, event)} className="p-1 text-surface-300 hover:text-amber-500" title="Reaccionar">
                        <span className="text-sm leading-none">😊</span>
                      </button>
                      <button type="button" onClick={() => setRespondiendoA(msg)} className="p-1 text-surface-300 hover:text-blue-500" title="Responder">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                      </button>
                    </div>
                  )}
                  <div className={clsx(
                    "max-w-[85%] rounded-2xl px-3 py-2",
                    esMio
                      ? "bg-blue-600 text-white rounded-br-md"
                      : "bg-surface-100 dark:bg-surface-700 text-surface-800 dark:text-surface-100 rounded-bl-md"
                  )}>
                    <ReplyQuote msg={msg.replyTo} esMio={esMio} onClick={() => msg.replyTo?.id && scrollToMessage(msg.replyTo.id)} />
                    {!msg.archivoUrl && <p className="text-sm whitespace-pre-wrap break-words">{msg.contenido}</p>}
                    <ChatArchivo msg={msg} onOpenMedia={setMediaViewerMsg} />
                    <p className={clsx(
                      "text-[10px] mt-0.5",
                      esMio ? "text-blue-200" : "text-surface-400 dark:text-surface-500"
                    )}>
                      {new Date(msg.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <ReactionSummary msg={msg} sessionUserId={session?.userId} onReact={reaccionarMensaje} />
                  </div>
                  {!esMio && conversacion?.estado !== "CERRADA" && (
                    <div className="relative ml-1 flex items-center opacity-0 transition group-hover/msg:opacity-100">
                      {reactionPickerMsg && reactionPickerMsg.id === msg.id && <ReactionPicker msg={msg} onReact={reaccionarMensaje} placement={reactionPickerMsg.placement} />}
                      <button type="button" onClick={(event) => toggleReactionPicker(msg.id, event)} className="p-1 text-surface-300 hover:text-amber-500" title="Reaccionar">
                        <span className="text-sm leading-none">😊</span>
                      </button>
                      <button type="button" onClick={() => setRespondiendoA(msg)} className="p-1 text-surface-300 hover:text-blue-500" title="Responder">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Input — siempre visible */}
          {(!conversacion || conversacion.estado !== "CERRADA") ? (
            <div className="p-2 border-t border-surface-200 dark:border-surface-700">
              {respondiendoA && (
                <div className="mb-2 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-2 py-1.5 dark:border-blue-900/50 dark:bg-blue-900/20">
                  <div className="min-w-0 flex-1 border-l-2 border-blue-500 pl-2">
                    <p className="text-[10px] font-semibold text-blue-700 dark:text-blue-300">Respondiendo a {authorLabel(respondiendoA, session?.userId)}</p>
                    <p className="truncate text-[11px] text-surface-600 dark:text-surface-300">{messagePreview(respondiendoA)}</p>
                  </div>
                  <button type="button" onClick={() => setRespondiendoA(null)} className="rounded p-1 text-surface-400 hover:bg-white hover:text-surface-600 dark:hover:bg-surface-700" title="Cancelar respuesta">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              )}

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
                <>
                <div className="mb-2 flex gap-1">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => enviarTexto(emoji)} className="rounded-full border border-surface-200 bg-white px-2 py-1 text-xs shadow-sm hover:bg-surface-50 dark:border-surface-700 dark:bg-surface-800 dark:hover:bg-surface-700" title={`Enviar ${emoji}`}>
                      {emoji}
                    </button>
                  ))}
                </div>
                <form onSubmit={enviarMensaje} className="flex items-center gap-1 touch-manipulation">
                  {/* Adjuntar archivo */}
                  {(!conversacion || conversacion.estado !== "CERRADA") && (
                    <>
                      <label htmlFor="chat-file-widget" className="p-1.5 text-surface-400 hover:text-blue-500 transition cursor-pointer" title="Adjuntar archivo">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                        </svg>
                      </label>
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
                    onPaste={handlePaste}
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
                </>
              )}
            </div>
          ) : (
            <div className="p-3 border-t border-surface-200 dark:border-surface-700 text-center">
              <p className="text-xs text-surface-400 dark:text-surface-500 mb-2">Consulta cerrada</p>
              <button
                onClick={() => { setConversacion(null); setMensajes([]); setRespondiendoA(null); }}
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
          "relative flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-200 sm:h-14 sm:w-14",
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
      <ChatMediaViewer
        message={mediaViewerMsg}
        conversacionId={conversacion?.id}
        onClose={() => setMediaViewerMsg(null)}
        onSent={async () => {
          if (!conversacion?.id) return;
          const res = await fetch(`/api/chat/${conversacion.id}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setMensajes(data.mensajes || []);
          }
        }}
        compact
      />
    </div>
  );
}

