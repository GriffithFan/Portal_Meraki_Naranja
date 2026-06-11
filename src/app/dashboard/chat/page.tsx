"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useSession } from "@/hooks/useSession";
import { useChatReminders } from "@/hooks/useChatReminders";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import clsx from "clsx";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_AUDIO_SECONDS = 120;
const ALLOWED_FILE_TYPES = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/ogg,audio/wav,audio/webm,audio/mp4,application/zip,application/x-zip-compressed";
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏", "🎉"];
const PARTICIPANT_COLORS = [
  "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:ring-blue-700",
  "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-700",
  "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-900/30 dark:text-violet-200 dark:ring-violet-700",
  "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700",
  "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:ring-rose-700",
];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function ChatArchivo({ msg, esMio }: { msg: any; esMio: boolean }) {
  if (!msg.archivoUrl) return null;
  const tipo = (msg.archivoTipo || "").split(";")[0].trim();
  const downloadUrl = `/api/chat/archivo/${msg.id}`;
  const inlineUrl = `${downloadUrl}?inline=true`;

  const DownloadBtn = () => (
    <a href={downloadUrl} download className={clsx("inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded transition text-[10px]", esMio ? "bg-white/10 hover:bg-white/20 text-blue-100" : "bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 opacity-70 hover:opacity-100")}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
      Descargar
    </a>
  );

  if (tipo.startsWith("image/")) {
    return (
      <div className="mt-1.5">
        <a href={inlineUrl} target="_blank" rel="noopener noreferrer">
          <Image src={inlineUrl} alt={msg.archivoNombre} width={280} height={200} unoptimized className="max-w-[280px] max-h-[200px] w-auto h-auto rounded-lg object-cover cursor-pointer hover:opacity-90 transition" />
        </a>
        <div className="flex items-center gap-2">
          <p className={clsx("text-[10px] mt-0.5", esMio ? "text-blue-200" : "opacity-60")}>{msg.archivoNombre} · {formatFileSize(msg.archivoTamanio)}</p>
          <DownloadBtn />
        </div>
      </div>
    );
  }
  if (tipo.startsWith("video/")) {
    return (
      <div className="mt-1.5">
        <video src={inlineUrl} controls playsInline className="max-w-[280px] max-h-[200px] rounded-lg" preload="metadata" />
        <div className="flex items-center gap-2">
          <p className={clsx("text-[10px] mt-0.5", esMio ? "text-blue-200" : "opacity-60")}>{msg.archivoNombre} · {formatFileSize(msg.archivoTamanio)}</p>
          <DownloadBtn />
        </div>
      </div>
    );
  }
  if (tipo.startsWith("audio/")) {
    return (
      <div className="mt-1.5">
        <audio src={inlineUrl} controls className="max-w-[280px] h-9" preload="metadata" />
        <p className={clsx("text-[10px] mt-0.5", esMio ? "text-blue-200" : "opacity-60")}>{msg.archivoNombre} · {formatFileSize(msg.archivoTamanio)}</p>
      </div>
    );
  }
  return (
    <a href={downloadUrl} className="mt-1.5 flex items-center gap-2 px-3 py-2 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 transition text-xs" download>
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
      <span className="truncate">{msg.archivoNombre}</span>
      <span className="opacity-60 flex-shrink-0">{formatFileSize(msg.archivoTamanio)}</span>
    </a>
  );
}

function participantColor(id = "") {
  const hash = Array.from(id).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return PARTICIPANT_COLORS[hash % PARTICIPANT_COLORS.length];
}

function participantLabel(msg: any, sessionUserId?: string, isMesa?: boolean, soloLectura?: boolean) {
  if (msg.autorId === sessionUserId) return "Vos";
  if (isMesa || soloLectura) return msg.autor?.nombre || "Participante";
  return "Mesa de Ayuda";
}

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  ABIERTA: { label: "Esperando", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  EN_CURSO: { label: "En curso", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  CERRADA: { label: "Cerrada", className: "bg-surface-100 text-surface-500 dark:bg-surface-700 dark:text-surface-400" },
};

function messagePreview(msg: any) {
  if (!msg) return "Mensaje";
  if (msg.eliminadoAt) return "Se eliminó este mensaje";
  if (msg.archivoNombre) return msg.contenido && msg.contenido !== msg.archivoNombre ? msg.contenido : msg.archivoNombre;
  return msg.contenido || "Mensaje";
}

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
        <button key={item.emoji} type="button" onClick={() => onReact(msg, item.emoji)} className={clsx("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] shadow-sm", item.mine ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-200" : "border-surface-200 bg-white text-surface-600 dark:border-surface-600 dark:bg-surface-700 dark:text-surface-200")} title={item.mine ? "Quitar reaccion" : "Reaccionar"}>
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

export default function ChatPage() {
  const { session, isMesa, isModOrAdmin } = useSession();
  useChatReminders(Boolean(session), session?.userId || "default");
  // Admin/Mod sin esMesa: ven todos los chats, pueden crear propias consultas
  const esVistaGlobal = isMesa || isModOrAdmin;
  const [conversaciones, setConversaciones] = useState<any[]>([]);
  const [seleccionada, setSeleccionada] = useState<any>(null);
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState("");
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [grabSegundos, setGrabSegundos] = useState(0);
  const [vistaMovil, setVistaMovil] = useState<"lista" | "chat">("lista");
  const [filtroEstado, setFiltroEstado] = useState<string>("TODAS");
  const [orden, setOrden] = useState<"recientes" | "antiguas">("recientes");
  const urlParamsRef = useRef<URLSearchParams | null>(null);
  if (typeof window !== "undefined" && !urlParamsRef.current) {
    urlParamsRef.current = new URLSearchParams(window.location.search);
  }
  const autoOpenIdRef = useRef<string | null>(urlParamsRef.current?.get("id") || null);
  const [busqueda, setBusqueda] = useState(() => urlParamsRef.current?.get("search") || "");
  const [resultadosBusqueda, setResultadosBusqueda] = useState<any[] | null>(null);
  const [buscandoHistorial, setBuscandoHistorial] = useState(false);
  const [respondiendoA, setRespondiendoA] = useState<any | null>(null);
  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(null);
  const [reactionPickerMsg, setReactionPickerMsg] = useState<{ id: string; placement: "top" | "bottom" } | null>(null);
  const [editandoMsgId, setEditandoMsgId] = useState<string | null>(null);
  const [editandoTxt, setEditandoTxt] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevMsgCountRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const nuevaConsultaRef = useRef<HTMLInputElement>(null);
  const lastTypingPingRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const grabTimerRef = useRef<ReturnType<typeof setInterval>>();
  const conversacionesLoadingRef = useRef(false);
  const mensajesAbortRef = useRef<AbortController | null>(null);

  const mergeMensajes = useCallback((nuevos: any[]) => {
    if (nuevos.length === 0) return;
    setMensajes(prev => {
      const byId = new Map(prev.map((msg: any) => [msg.id, msg]));
      for (const msg of nuevos) byId.set(msg.id, msg);
      return Array.from(byId.values()).sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });
  }, []);

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

  // soloLectura se calcula por conversación: MOD puede escribir en las suyas
  const esMiConversacion = seleccionada?.creadorId === session?.userId;
  const soloLectura = seleccionada ? !(esMiConversacion || isMesa) : false;

  // Avisar "escribiendo…" a la otra parte (throttle 2.5s). No persiste nada.
  const pingTyping = useCallback(() => {
    if (!seleccionada?.id || soloLectura || seleccionada.estado === "CERRADA") return;
    if (isMesa && seleccionada.estado !== "EN_CURSO") return; // Mesa solo escribe en EN_CURSO
    const now = Date.now();
    if (now - lastTypingPingRef.current < 2500) return;
    lastTypingPingRef.current = now;
    fetch(`/api/chat/${seleccionada.id}/typing`, { method: "POST", credentials: "include" }).catch(() => {});
  }, [seleccionada?.id, seleccionada?.estado, soloLectura, isMesa]);

  // Autofocus del input al abrir una conversación (solo en dispositivos con
  // puntero fino, para no abrir el teclado de golpe en mobile).
  useEffect(() => {
    if (!seleccionada?.id) return;
    if (typeof window !== "undefined" && window.matchMedia && !window.matchMedia("(pointer: fine)").matches) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [seleccionada?.id]);

  // Cargar conversaciones
  const cargarConversaciones = useCallback(async () => {
    if (conversacionesLoadingRef.current) return;
    conversacionesLoadingRef.current = true;
    try {
      const res = await fetch("/api/chat", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setConversaciones(data);
      }
    } catch { /* silenciar */ }
    finally { conversacionesLoadingRef.current = false; }
  }, []);

  // Cargar mensajes de una conversación
  const cargarMensajes = useCallback(async (id: string) => {
    mensajesAbortRef.current?.abort();
    const controller = new AbortController();
    mensajesAbortRef.current = controller;
    try {
      const res = await fetch(`/api/chat/${id}`, { credentials: "include", signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        if (controller.signal.aborted || mensajesAbortRef.current !== controller) return;
        setMensajes(data.mensajes || []);
        setSeleccionada(data);
      }
    } catch { /* silenciar */ }
    finally {
      if (mensajesAbortRef.current === controller) mensajesAbortRef.current = null;
    }
  }, []);

  const cargarMensajesNuevos = useCallback(async (id: string) => {
    const ultimo = mensajes[mensajes.length - 1]?.createdAt;
    if (!ultimo) return cargarMensajes(id);
    try {
      const res = await fetch(`/api/chat/${id}?since=${encodeURIComponent(ultimo)}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        mergeMensajes(data.mensajes || []);
        setSeleccionada((prev: any) => prev?.id === data.id ? { ...prev, ...data, mensajes: prev.mensajes } : data);
      }
    } catch { /* silenciar */ }
  }, [cargarMensajes, mensajes, mergeMensajes]);

  useEffect(() => {
    cargarConversaciones().finally(() => setLoading(false));
  }, [cargarConversaciones]);

  // Auto-abrir conversación pasada por ?id= desde el widget flotante
  useEffect(() => {
    const id = autoOpenIdRef.current;
    if (!id || conversaciones.length === 0) return;
    autoOpenIdRef.current = null;
    const conv = conversaciones.find((c: any) => c.id === id);
    if (conv) {
      cargarMensajes(id);
      setVistaMovil("chat");
    }
  }, [conversaciones, cargarMensajes]);

  useEffect(() => {
    const query = busqueda.trim();
    if (!query) {
      setResultadosBusqueda(null);
      setBuscandoHistorial(false);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("search", query);
    if (filtroEstado !== "TODAS") params.set("estado", filtroEstado);

    setBuscandoHistorial(true);
    fetch(`/api/chat?${params.toString()}`, { credentials: "include", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (!controller.signal.aborted) setResultadosBusqueda(Array.isArray(data) ? data : []);
      })
      .catch(() => { /* silenciar */ })
      .finally(() => {
        if (!controller.signal.aborted) setBuscandoHistorial(false);
      });

    return () => controller.abort();
  }, [busqueda, filtroEstado]);

  // Polling cada 5s para mensajes nuevos
  useEffect(() => {
    pollRef.current = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      cargarConversaciones();
      if (seleccionada?.id) cargarMensajesNuevos(seleccionada.id);
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, [seleccionada?.id, cargarConversaciones, cargarMensajesNuevos]);

  // Scroll al último mensaje solo cuando llegan mensajes nuevos
  useEffect(() => {
    if (mensajes.length > prevMsgCountRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCountRef.current = mensajes.length;
  }, [mensajes]);

  // Para técnicos: auto-deseleccionar conversación cuando se cierra → muestra vista nueva consulta
  useEffect(() => {
    if (seleccionada?.estado === "CERRADA" && !isMesa && !soloLectura) {
      setSeleccionada(null);
      setMensajes([]);
      setRespondiendoA(null);
      setReactionPickerMsg(null);
      setVistaMovil("lista");
    }
  }, [seleccionada?.estado, isMesa, soloLectura]);

  const seleccionarConv = (conv: any) => {
    setSeleccionada(conv);
    setRespondiendoA(null);
    setReactionPickerMsg(null);
    cargarMensajes(conv.id);
    setVistaMovil("chat");
  };

  const enviarTextoConversacion = async (textoInput: string) => {
    const texto = textoInput.trim();
    if (!texto || enviando || !seleccionada) return false;

    setEnviando(true);
    try {
      const res = await fetch(`/api/chat/${seleccionada.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mensaje: texto, replyToId: respondiendoA?.id || undefined }),
      });
      if (res.ok) {
        setNuevoMensaje("");
        setRespondiendoA(null);
        await cargarMensajes(seleccionada.id);
        return true;
      }
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Error al enviar mensaje");
      return false;
    } catch (err) {
      console.error("[Chat] Error enviando mensaje:", err);
      alert("Error de conexión");
      return false;
    } finally {
      setEnviando(false);
    }
  };

  const enviarEmojiRapido = async (emoji: string) => {
    if (!seleccionada) return;
    await enviarTextoConversacion(emoji);
  };

  const enviarMensaje = async (e: React.FormEvent) => {
    e.preventDefault();
    const texto = nuevoMensaje.trim();
    if (!texto || enviando) return;

    // Si no hay conversación seleccionada y no es Mesa, crear nueva
    if (!seleccionada && !isMesa) {
      await crearConsulta(nuevoMensaje);
      setNuevoMensaje("");
      return;
    }

    if (!seleccionada) return;
    await enviarTextoConversacion(texto);
  };

  const crearConsulta = async (primerMensaje: string) => {
    if (!primerMensaje.trim() || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mensaje: primerMensaje.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        await cargarConversaciones();
        setResultadosBusqueda(null);
        seleccionarConv(data);
      } else {
        const err = await res.json();
        alert(err.error || "Error al crear consulta");
      }
    } catch { /* silenciar */ } finally {
      setEnviando(false);
    }
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
        setRespondiendoA(null);
        setReactionPickerMsg(null);
        setVistaMovil("lista");
        await cargarConversaciones();
      }
    } catch { /* silenciar */ }
  };

  const tieneActiva = conversaciones.some(
    (c) => c.creadorId === session?.userId && (c.estado === "ABIERTA" || c.estado === "EN_CURSO")
  );

  const eliminarConversacion = async (id: string) => {
    if (!confirm("¿Eliminar esta conversación? Se borrarán todos los mensajes y archivos.")) return;
    try {
      const res = await fetch(`/api/chat/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        if (seleccionada?.id === id) {
          setSeleccionada(null);
          setMensajes([]);
          setRespondiendoA(null);
          setReactionPickerMsg(null);
          setVistaMovil("lista");
        }
        await cargarConversaciones();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Error al eliminar");
      }
    } catch { alert("Error de conexión"); }
  };

  // Filtrar y ordenar conversaciones
  const convSource = resultadosBusqueda ?? conversaciones;
  const convsFiltradas = convSource.filter((c) => {
    if (resultadosBusqueda) return true;
    if (filtroEstado !== "TODAS" && c.estado !== filtroEstado) return false;
    return true;
  }).sort((a, b) => {
    const tA = new Date(a.updatedAt).getTime();
    const tB = new Date(b.updatedAt).getTime();
    return orden === "recientes" ? tB - tA : tA - tB;
  });

  const conteoEstados = {
    TODAS: conversaciones.length,
    ABIERTA: conversaciones.filter((c) => c.estado === "ABIERTA").length,
    EN_CURSO: conversaciones.filter((c) => c.estado === "EN_CURSO").length,
    CERRADA: conversaciones.filter((c) => c.estado === "CERRADA").length,
  };

  // ── Upload de archivos ──
  const subirArchivos = async (files: File[]) => {
    if (!seleccionada?.id) return;
    if (files.length === 0) return;
    setSubiendo(true);
    try {
      const fd = new FormData();
      files.forEach((file) => fd.append("file", file));
      fd.append("conversacionId", seleccionada.id);
      if (respondiendoA?.id) fd.append("replyToId", respondiendoA.id);
      const res = await fetch("/api/chat/upload", { method: "POST", credentials: "include", body: fd });
      if (res.ok) {
        setRespondiendoA(null);
        await cargarMensajes(seleccionada.id);
      } else {
        const err = await res.json();
        alert(err.error || "Error al subir archivo");
      }
    } catch (err) { console.error("[Chat] Error subiendo archivo:", err); alert("Error al subir archivo. Intentá de nuevo."); }
    setSubiendo(false);
  };

  const subirArchivo = async (file: File) => subirArchivos([file]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) subirArchivos(files);
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

  // ── Pegar archivos/imágenes desde portapapeles ──
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || !seleccionada?.id) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length) {
      e.preventDefault();
      subirArchivos(files);
    }
  };

  // ── Editar mensaje ──
  const iniciarEdicion = (msg: any) => {
    setEditandoMsgId(msg.id);
    setEditandoTxt(msg.contenido || "");
  };

  const cancelarEdicion = () => {
    setEditandoMsgId(null);
    setEditandoTxt("");
  };

  const guardarEdicion = async () => {
    if (!editandoMsgId || !editandoTxt.trim()) return;
    try {
      const res = await fetch(`/api/chat/mensaje/${editandoMsgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ contenido: editandoTxt.trim() }),
      });
      if (res.ok) {
        cancelarEdicion();
        if (seleccionada?.id) await cargarMensajes(seleccionada.id);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Error al editar mensaje");
      }
    } catch { alert("Error de conexión"); }
  };

  // ── Eliminar mensaje ──
  const eliminarMensaje = async (msgId: string) => {
    if (!confirm("¿Eliminar este mensaje?")) return;
    try {
      const res = await fetch(`/api/chat/mensaje/${msgId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        if (seleccionada?.id) await cargarMensajes(seleccionada.id);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Error al eliminar mensaje");
      }
    } catch { alert("Error de conexión"); }
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
              : isModOrAdmin
                ? "Consultá a Mesa o revisá los chats de los técnicos"
                : "Enviá tus consultas a Mesa de Ayuda"}
          </p>
        </div>
      </div>

      {/* Layout principal: lista + chat */}
      <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[400px]">
        {/* Lista de conversaciones */}
        <div className={clsx(
          "w-full md:w-80 lg:w-96 flex-shrink-0 flex flex-col bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden",
          vistaMovil === "chat" && "hidden md:flex"
        )}>
          <div className="p-3 border-b border-surface-200 dark:border-surface-700 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-surface-600 dark:text-surface-300">
                {esVistaGlobal ? "Consultas" : "Mis consultas"}
              </h2>
              <select
                value={orden}
                onChange={(e) => setOrden(e.target.value as any)}
                className="text-[10px] px-1.5 py-0.5 rounded border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-600 dark:text-surface-300"
              >
                <option value="recientes">Más recientes</option>
                <option value="antiguas">Más antiguas</option>
              </select>
            </div>
            {/* Filtros por estado */}
            <div className="flex gap-1 flex-wrap">
              {(["TODAS", "ABIERTA", "EN_CURSO", "CERRADA"] as const).map((e) => {
                const labels: Record<string, string> = { TODAS: "Todas", ABIERTA: "Esperando", EN_CURSO: "En curso", CERRADA: "Cerradas" };
                const count = conteoEstados[e];
                return (
                  <button
                    key={e}
                    onClick={() => setFiltroEstado(e)}
                    className={clsx(
                      "px-2 py-0.5 rounded-full text-[10px] font-medium transition",
                      filtroEstado === e
                        ? "bg-blue-600 text-white"
                        : "bg-surface-100 dark:bg-surface-700 text-surface-500 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-600"
                    )}
                  >
                    {labels[e]} {count > 0 && <span className="ml-0.5 opacity-75">{count}</span>}
                  </button>
                );
              })}
            </div>
            {/* Búsqueda */}
            <input
              type="text"
              placeholder="Buscar en historial (abiertos y cerrados)..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full px-2 py-1 rounded border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-700 dark:text-surface-200 text-xs placeholder:text-surface-400 focus:ring-1 focus:ring-blue-500 outline-none"
            />
            {busqueda.trim() && (
              <p className="text-[10px] text-surface-400">
                {buscandoHistorial ? "Buscando en chats abiertos y cerrados..." : "Resultados de historial"}
              </p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversaciones.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-surface-400 dark:text-surface-500 p-4 text-center">
                <svg className="w-12 h-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
                <p className="text-sm">
                  {esVistaGlobal ? "No hay consultas pendientes" : "No tenés consultas aún"}
                </p>
              </div>
            ) : convsFiltradas.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-surface-400 dark:text-surface-500 p-4 text-center">
                <p className="text-sm">{busqueda.trim() ? "Sin coincidencias en el historial" : "Sin resultados para este filtro"}</p>
              </div>
            ) : (
              convsFiltradas.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => seleccionarConv(conv)}
                  className={clsx(
                    "group/conv w-full text-left p-3 border-b border-surface-100 dark:border-surface-700/50 hover:bg-surface-50 dark:hover:bg-surface-700/50 transition",
                    conv.noLeida && "bg-amber-50/70 dark:bg-amber-900/20 border-l-4 border-l-amber-500 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.12)]",
                    seleccionada?.id === conv.id && "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {conv.noLeida && <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />}
                        <p className={clsx("text-sm truncate", conv.noLeida ? "font-bold text-amber-900 dark:text-amber-100" : "font-medium text-surface-800 dark:text-surface-100")}>
                          {esVistaGlobal ? conv.creador?.nombre : "Mesa de Ayuda"}
                        </p>
                      </div>
                      <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                        {formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true, locale: es })}
                      </p>
                      {conv.mensajes?.[0] && (
                        <p className={clsx("text-xs mt-1 truncate", conv.mensajes[0].eliminadoAt && "italic", conv.noLeida ? "text-amber-700 dark:text-amber-200 font-medium" : "text-surface-400 dark:text-surface-500")}>
                          {conv.mensajes[0].eliminadoAt ? "Se eliminó este mensaje" : conv.mensajes[0].contenido}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className={ESTADO_BADGE[conv.estado]?.className || ""}>
                        {ESTADO_BADGE[conv.estado]?.label || conv.estado}
                      </Badge>
                      {conv.noLeida && <Badge className="bg-amber-500 text-white">Nuevo</Badge>}
                      {(isMesa || session?.rol === "ADMIN") && (
                        <button
                          onClick={(e) => { e.stopPropagation(); eliminarConversacion(conv.id); }}
                          className="p-0.5 text-surface-300 dark:text-surface-600 hover:text-red-500 dark:hover:text-red-400 transition opacity-0 group-hover/conv:opacity-100"
                          title="Eliminar conversación"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      )}
                    </div>
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
            <div className="flex-1 flex flex-col">
              <div className="flex-1 flex flex-col items-center justify-center text-surface-400 dark:text-surface-500">
                <svg className="w-16 h-16 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                </svg>
                <p className="text-sm">
                  {isMesa || soloLectura ? "Seleccioná una conversación" : !tieneActiva ? "Escribí tu primer mensaje para iniciar" : "Seleccioná tu conversación"}
                </p>
              </div>
              {!isMesa && !tieneActiva && (
                <form onSubmit={enviarMensaje} className="p-3 border-t border-surface-200 dark:border-surface-700 touch-manipulation">
                  <div className="flex gap-2">
                    <input
                      ref={nuevaConsultaRef}
                      autoFocus
                      type="text"
                      placeholder="Escribí tu consulta..."
                      value={nuevoMensaje}
                      onChange={(e) => setNuevoMensaje(e.target.value)}
                      maxLength={2000}
                      className="flex-1 px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-800 dark:text-surface-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!nuevoMensaje.trim() || enviando}
                      onMouseDown={(e) => e.preventDefault()}
                      className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition touch-manipulation"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                      </svg>
                    </button>
                  </div>
                </form>
              )}
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
                      {isMesa || soloLectura ? seleccionada.creador?.nombre : "Mesa de Ayuda"}
                    </h3>
                    <p className="text-xs text-surface-500 dark:text-surface-400">
                      {seleccionada.typing && seleccionada.estado !== "CERRADA" ? (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-500">
                          escribiendo
                          <span className="inline-flex gap-0.5">
                            <span className="h-1 w-1 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.3s]" />
                            <span className="h-1 w-1 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.15s]" />
                            <span className="h-1 w-1 animate-bounce rounded-full bg-emerald-500" />
                          </span>
                        </span>
                      ) : (
                        <span className={clsx(
                          seleccionada.estado === "EN_CURSO" && "text-blue-500",
                          seleccionada.estado === "ABIERTA" && "text-amber-500",
                          seleccionada.estado === "CERRADA" && "text-surface-400"
                        )}>
                          {ESTADO_BADGE[seleccionada.estado]?.label}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {soloLectura && (
                    <span className="px-2 py-1 bg-surface-100 dark:bg-surface-700 text-surface-500 dark:text-surface-400 rounded-lg text-[10px] font-medium">Solo lectura</span>
                  )}
                  {isMesa && !soloLectura && seleccionada.estado === "ABIERTA" && (
                    <button
                      onClick={() => tomarConversacion(seleccionada.id)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition"
                    >
                      Tomar
                    </button>
                  )}
                  {isMesa && seleccionada.estado === "EN_CURSO" && (
                    <button
                      onClick={() => cerrarConversacion(seleccionada.id)}
                      className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 transition"
                    >
                      Cerrar
                    </button>
                  )}
                  {(isMesa || session?.rol === "ADMIN") && (
                    <button
                      onClick={() => eliminarConversacion(seleccionada.id)}
                      className="p-1.5 text-surface-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                      title="Eliminar conversación"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Mensajes */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Recibo de lectura bidireccional: la "otra parte" depende de si soy el creador */}
                {mensajes.map((msg) => {
                  const esMio = msg.autorId === session?.userId;
                  // Timestamp de lectura de la otra parte: si soy el creador (técnico), miro
                  // cuándo leyó Mesa; si soy Mesa/agente, miro cuándo leyó el creador.
                  const soyCreadorConv = seleccionada.creadorId === session?.userId;
                  const lecturaOtraParte = soyCreadorConv ? seleccionada.leidoPorMesaAt : seleccionada.leidoPorCreadorAt;
                  const leidoPorOtro = esMio && lecturaOtraParte
                    ? new Date(msg.createdAt) <= new Date(lecturaOtraParte)
                    : false;
                  const editando = editandoMsgId === msg.id;
                  return (
                    <div
                      key={msg.id}
                      ref={(el) => { if (el) messageRefs.current.set(msg.id, el); else messageRefs.current.delete(msg.id); }}
                      className={clsx("group/msg flex rounded-lg transition-colors", esMio ? "justify-end" : "justify-start", highlightMsgId === msg.id && "bg-amber-100/70 dark:bg-amber-900/30")}
                    >
                      {/* Botones de acción (hover) — lado izquierdo para mensajes míos */}
                      {esMio && !editando && !msg.eliminadoAt && seleccionada.estado !== "CERRADA" && !soloLectura && (
                        <div className="relative flex items-center gap-0.5 mr-1 opacity-0 group-hover/msg:opacity-100 transition">
                          {reactionPickerMsg && reactionPickerMsg.id === msg.id && <ReactionPicker msg={msg} onReact={reaccionarMensaje} placement={reactionPickerMsg.placement} />}
                          <button type="button" onClick={(event) => toggleReactionPicker(msg.id, event)} className="p-1 text-surface-300 hover:text-amber-500 dark:text-surface-600 dark:hover:text-amber-400 transition" title="Reaccionar">
                            <span className="text-sm leading-none">🙂</span>
                          </button>
                          <button type="button" onClick={() => setRespondiendoA(msg)} className="p-1 text-surface-300 hover:text-blue-500 dark:text-surface-600 dark:hover:text-blue-400 transition" title="Responder">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                          </button>
                          {!msg.archivoUrl && (
                            <button onClick={() => iniciarEdicion(msg)} className="p-1 text-surface-300 hover:text-blue-500 dark:text-surface-600 dark:hover:text-blue-400 transition" title="Editar">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                            </button>
                          )}
                          <button onClick={() => eliminarMensaje(msg.id)} className="p-1 text-surface-300 hover:text-red-500 dark:text-surface-600 dark:hover:text-red-400 transition" title="Eliminar">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                          </button>
                        </div>
                      )}
                      <div className={clsx(
                        "max-w-[80%] rounded-2xl px-4 py-2.5",
                        esMio
                          ? "bg-blue-600 text-white rounded-br-md"
                          : "bg-surface-100 dark:bg-surface-700 text-surface-800 dark:text-surface-100 rounded-bl-md"
                      )}>
                        <div className={clsx("mb-1.5 flex", esMio ? "justify-end" : "justify-start")}>
                          <span className={clsx(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ring-1",
                            esMio ? "bg-white/15 text-white ring-white/25" : participantColor(msg.autorId)
                          )}>
                            {participantLabel(msg, session?.userId, isMesa, soloLectura)}
                            {msg.autor?.esMesa && (isMesa || soloLectura) && msg.autorId !== session?.userId && (
                              <span className="ml-1 text-[9px] font-semibold opacity-75">Mesa</span>
                            )}
                          </span>
                        </div>
                        {editando ? (
                          <div className="space-y-1.5">
                            <input
                              type="text"
                              value={editandoTxt}
                              onChange={(e) => setEditandoTxt(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") guardarEdicion(); if (e.key === "Escape") cancelarEdicion(); }}
                              maxLength={2000}
                              autoFocus
                              className="w-full px-2 py-1 rounded border border-blue-300 bg-white text-surface-800 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                            <div className="flex gap-1">
                              <button onClick={guardarEdicion} className="px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[10px] font-medium transition">Guardar</button>
                              <button onClick={cancelarEdicion} className="px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded text-[10px] transition">Cancelar</button>
                            </div>
                          </div>
                        ) : msg.eliminadoAt ? (
                          <p className={clsx("flex items-center gap-1.5 text-sm italic", esMio ? "text-blue-100/80" : "text-surface-400 dark:text-surface-500")}>
                            <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                            Se eliminó este mensaje
                          </p>
                        ) : (
                          <>
                            <ReplyQuote msg={msg.replyTo} esMio={esMio} onClick={() => msg.replyTo?.id && scrollToMessage(msg.replyTo.id)} />
                            {!msg.archivoUrl && <p className="text-sm whitespace-pre-wrap break-words">{msg.contenido}</p>}
                            <ChatArchivo msg={msg} esMio={esMio} />
                          </>
                        )}
                        <div className={clsx("flex items-center gap-1 mt-1", esMio ? "justify-end" : "")}>
                          <span className={clsx(
                            "text-[10px]",
                            esMio ? "text-blue-200" : "text-surface-400 dark:text-surface-500"
                          )}>
                            {new Date(msg.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {msg.editadoAt && (
                            <span className={clsx("text-[9px] italic", esMio ? "text-blue-200" : "text-surface-400 dark:text-surface-500")}>
                              (editado)
                            </span>
                          )}
                          {/* Confirmación de lectura en mis mensajes: ✓ enviado / ✓✓ leído */}
                          {esMio && !msg.eliminadoAt && (
                            <svg className={clsx("w-3.5 h-3.5 ml-0.5", leidoPorOtro ? "text-cyan-300" : "text-blue-300/60")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-label={leidoPorOtro ? "Leído" : "Enviado"}>
                              {leidoPorOtro ? (
                                <><path strokeLinecap="round" strokeLinejoin="round" d="M1 13l5 5L17 7" /><path strokeLinecap="round" strokeLinejoin="round" d="M7 13l5 5L23 7" /></>
                              ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              )}
                            </svg>
                          )}
                        </div>
                        <ReactionSummary msg={msg} sessionUserId={session?.userId} onReact={reaccionarMensaje} />
                      </div>
                      {/* Botones de acción (hover) — lado derecho para mensajes ajenos (solo Mesa/Admin) */}
                      {!esMio && !editando && !msg.eliminadoAt && seleccionada.estado !== "CERRADA" && !soloLectura && (
                        <div className="relative flex items-center gap-0.5 ml-1 opacity-0 group-hover/msg:opacity-100 transition">
                          {reactionPickerMsg && reactionPickerMsg.id === msg.id && <ReactionPicker msg={msg} onReact={reaccionarMensaje} placement={reactionPickerMsg.placement} />}
                          <button type="button" onClick={(event) => toggleReactionPicker(msg.id, event)} className="p-1 text-surface-300 hover:text-amber-500 dark:text-surface-600 dark:hover:text-amber-400 transition" title="Reaccionar">
                            <span className="text-sm leading-none">🙂</span>
                          </button>
                          <button type="button" onClick={() => setRespondiendoA(msg)} className="p-1 text-surface-300 hover:text-blue-500 dark:text-surface-600 dark:hover:text-blue-400 transition" title="Responder">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                          </button>
                          {(isMesa || session?.rol === "ADMIN") && (
                            <button onClick={() => eliminarMensaje(msg.id)} className="p-1 text-surface-300 hover:text-red-500 dark:text-surface-600 dark:hover:text-red-400 transition" title="Eliminar">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Input de mensaje */}
              {seleccionada.estado !== "CERRADA" && !soloLectura && (
                (isMesa ? seleccionada.estado === "EN_CURSO" : true) ? (
                  <div className="p-3 border-t border-surface-200 dark:border-surface-700">
                    <input ref={fileInputRef} type="file" accept={ALLOWED_FILE_TYPES} capture={undefined} multiple className="hidden" onChange={handleFileSelect} />

                    {grabando ? (
                      <div className="flex items-center gap-3 px-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-sm text-red-500 font-medium flex-1">
                          Grabando audio... {Math.floor(grabSegundos / 60)}:{String(grabSegundos % 60).padStart(2, "0")} / 2:00
                        </span>
                        <button type="button" onClick={detenerGrabacion} className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 transition">
                          Enviar audio
                        </button>
                      </div>
                    ) : subiendo ? (
                      <div className="flex items-center justify-center gap-2 py-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
                        <span className="text-sm text-surface-500">Subiendo archivo...</span>
                      </div>
                    ) : (
                      <form onSubmit={enviarMensaje} className="space-y-2 touch-manipulation">
                        {respondiendoA && (
                          <div className="flex items-start justify-between rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 dark:border-blue-800/60 dark:bg-blue-900/20">
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-300">
                                Respondiendo a {respondiendoA.autor?.nombre || "mensaje"}
                              </p>
                              <p className="truncate text-xs text-blue-700/90 dark:text-blue-200/80">{messagePreview(respondiendoA)}</p>
                            </div>
                            <button type="button" onClick={() => setRespondiendoA(null)} className="ml-2 p-1 text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100" title="Cancelar respuesta">
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-1">
                          {QUICK_REACTIONS.map((emoji) => (
                            <button key={emoji} type="button" onClick={() => enviarEmojiRapido(emoji)} className="rounded-full border border-surface-200 bg-white px-2 py-0.5 text-sm hover:border-blue-300 hover:bg-blue-50 dark:border-surface-600 dark:bg-surface-700 dark:hover:border-blue-600 dark:hover:bg-blue-900/30" title={`Enviar ${emoji}`}>
                              {emoji}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Adjuntar archivo */}
                          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-surface-400 hover:text-blue-500 transition" title="Adjuntar archivos (foto, video, audio, zip)">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                            </svg>
                          </button>
                          {/* Grabar audio */}
                          <button type="button" onClick={iniciarGrabacion} className="p-2 text-surface-400 hover:text-red-500 transition" title="Grabar audio (máx 2 min)">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                            </svg>
                          </button>
                          <input
                            ref={inputRef}
                            type="text"
                            placeholder={respondiendoA ? "Escribí tu respuesta..." : "Escribí un mensaje..."}
                            disabled={false}
                            value={nuevoMensaje}
                            onChange={(e) => { setNuevoMensaje(e.target.value); pingTyping(); }}
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
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                            </svg>
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
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
