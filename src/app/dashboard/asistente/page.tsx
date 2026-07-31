"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useSession";

type Msg = { role: "user" | "assistant"; content: string };

const SUGERENCIAS = [
  "¿Qué reviso antes de ir a un predio?",
  "El AP quedó a 100 Mbps, ¿qué hago?",
  "¿Cuáles son los motivos más frecuentes de no conformidad?",
  "¿Qué fotos necesita un AP para no ser rechazado?",
  "¿Dónde se conecta PNCE y la conexión propia de la escuela?",
];

export default function AsistentePage() {
  const { isAdmin, loading: sesLoading } = useSession();
  const [mensajes, setMensajes] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pensando, setPensando] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [mensajes, pensando]);

  async function enviar(texto?: string) {
    const contenido = (texto ?? input).trim();
    if (!contenido || pensando) return;

    const nuevos: Msg[] = [...mensajes, { role: "user", content: contenido }];
    setMensajes(nuevos);
    setInput("");
    setPensando(true);
    try {
      const res = await fetch("/api/asistente", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensajes: nuevos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "El asistente no pudo responder");
        // dejar la consulta del usuario para reintentar
        setMensajes(nuevos);
        return;
      }
      setMensajes([...nuevos, { role: "assistant", content: data.respuesta || "(sin respuesta)" }]);
    } catch {
      toast.error("Error de red al consultar el asistente");
      setMensajes(nuevos);
    } finally {
      setPensando(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }

  if (sesLoading) return <div className="py-24 text-center text-sm text-surface-400">Cargando…</div>;
  if (!isAdmin) return <div className="py-24 text-center text-sm text-surface-400">El asistente está en pruebas: solo administradores.</div>;

  return (
    <div className="animate-fade-in-up flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-accent-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-accent-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-surface-800 dark:text-surface-100 flex items-center gap-2">
            Asistente IA
            <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">BETA · solo admin</span>
          </h1>
          <p className="text-xs text-surface-400">Responde con la base de conocimiento THNET + consultas reales de los chats + motivos de NC.</p>
        </div>
        {mensajes.length > 0 && (
          <button onClick={() => setMensajes([])} className="ml-auto text-xs text-surface-500 hover:text-surface-700 hover:bg-surface-100 px-2.5 py-1 rounded-md transition-colors flex-shrink-0">
            Limpiar
          </button>
        )}
      </div>

      {/* Conversación */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4 space-y-4">
        {mensajes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-8">
            <div className="w-14 h-14 rounded-2xl bg-accent-50 flex items-center justify-center">
              <svg className="w-7 h-7 text-accent-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
            </div>
            <div>
              <p className="text-sm font-medium text-surface-700 dark:text-surface-200">Probá una consulta</p>
              <p className="text-xs text-surface-400 mt-0.5 max-w-sm">Preguntá como lo haría un técnico. El asistente responde solo con el material documentado.</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {SUGERENCIAS.map((s) => (
                <button key={s} onClick={() => enviar(s)} className="text-xs text-left px-3 py-1.5 rounded-full border border-surface-200 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:border-accent-300 hover:bg-accent-50 dark:hover:bg-accent-900/20 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          mensajes.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === "user"
                  ? "bg-primary-600 text-white rounded-br-sm"
                  : "bg-surface-100 dark:bg-surface-700 text-surface-800 dark:text-surface-100 rounded-bl-sm"
              }`}>
                {m.content}
              </div>
            </div>
          ))
        )}
        {pensando && (
          <div className="flex justify-start">
            <div className="bg-surface-100 dark:bg-surface-700 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-accent-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-accent-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mt-3 flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Escribí tu consulta… (Enter para enviar, Shift+Enter para salto de línea)"
          disabled={pensando}
          className="flex-1 resize-none max-h-32 px-4 py-3 rounded-xl border border-surface-200 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100 text-sm focus:outline-none focus:border-accent-400 disabled:opacity-60"
        />
        <button
          onClick={() => enviar()}
          disabled={pensando || !input.trim()}
          className="h-[46px] px-4 rounded-xl bg-accent-600 text-white text-sm font-medium hover:bg-accent-700 transition-colors disabled:opacity-50 flex-shrink-0 flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
          Enviar
        </button>
      </div>
      <p className="text-[10px] text-surface-400 mt-1.5 text-center">El asistente puede equivocarse. Ante dudas de seguridad o casos no documentados, escalá a Mesa de Ayuda. · En pruebas con Claude.</p>
    </div>
  );
}
