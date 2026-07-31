"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useSession";

/* eslint-disable @typescript-eslint/no-explicit-any */

const CATEGORIAS = ["Equipos / Meraki", "Instalación", "Carrot (sistema)", "Procedimientos", "Actas y evidencia", "Escalamiento", "General"];

type Form = { id?: string; pregunta: string; respuesta: string; categoria: string; palabrasClave: string; activo: boolean; origenChatId?: string | null };
const FORM_VACIO: Form = { pregunta: "", respuesta: "", categoria: "General", palabrasClave: "", activo: true };

export default function SituacionesPage() {
  const { isAdmin, loading: sesLoading } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Generar desde chat
  const [showDesdeChat, setShowDesdeChat] = useState(false);
  const [chats, setChats] = useState<any[]>([]);
  const [chatSel, setChatSel] = useState("");
  const [generando, setGenerando] = useState(false);

  // Analítica de huecos / revisión
  const [analitica, setAnalitica] = useState<any | null>(null);
  const [tabRev, setTabRev] = useState<"huecos" | "malas">("huecos");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/situaciones", { credentials: "include" });
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, []);

  const fetchAnalitica = useCallback(async () => {
    const res = await fetch("/api/asistente/analitica", { credentials: "include" });
    if (res.ok) setAnalitica(await res.json());
  }, []);

  useEffect(() => { if (isAdmin) { fetchItems(); fetchAnalitica(); } }, [isAdmin, fetchItems, fetchAnalitica]);

  function crearDesde(pregunta: string, respuesta?: string) {
    setForm({ ...FORM_VACIO, pregunta: pregunta || "", respuesta: respuesta || "" });
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  }

  async function guardar() {
    if (!form) return;
    if (!form.pregunta.trim() || !form.respuesta.trim()) { toast.error("Completá pregunta y respuesta"); return; }
    setGuardando(true);
    try {
      const url = form.id ? `/api/situaciones/${form.id}` : "/api/situaciones";
      const method = form.id ? "PATCH" : "POST";
      const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (res.ok) {
        toast.success(form.id ? "Situación actualizada" : "Situación creada");
        setForm(null);
        fetchItems();
        fetchAnalitica();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error || "No se pudo guardar");
      }
    } finally { setGuardando(false); }
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar esta situación?")) return;
    const res = await fetch(`/api/situaciones/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) { toast.success("Eliminada"); fetchItems(); } else toast.error("No se pudo eliminar");
  }

  async function toggleActivo(s: any) {
    const res = await fetch(`/api/situaciones/${s.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activo: !s.activo }) });
    if (res.ok) fetchItems();
  }

  async function abrirDesdeChat() {
    setShowDesdeChat(true);
    setChatSel("");
    const res = await fetch("/api/situaciones/desde-chat", { credentials: "include" });
    if (res.ok) setChats(await res.json());
  }

  async function generarBorrador() {
    if (!chatSel) return;
    setGenerando(true);
    try {
      const res = await fetch("/api/situaciones/desde-chat", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversacionId: chatSel }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(d?.error || "No se pudo generar"); return; }
      if (!d.borrador) { toast.warning(d?.mensaje || "Esa conversación no da para una situación"); return; }
      setShowDesdeChat(false);
      setForm({ ...FORM_VACIO, pregunta: d.borrador.pregunta, respuesta: d.borrador.respuesta, categoria: d.borrador.categoria || "General", origenChatId: chatSel });
      toast.success("Borrador generado — revisalo y guardá");
    } finally { setGenerando(false); }
  }

  if (sesLoading) return <div className="py-24 text-center text-sm text-surface-400">Cargando…</div>;
  if (!isAdmin) return <div className="py-24 text-center text-sm text-surface-400">Solo administradores.</div>;

  const activas = items.filter((s) => s.activo).length;

  return (
    <div className="animate-fade-in-up max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 dark:text-surface-100">Situaciones del asistente</h1>
          <p className="text-xs text-surface-400">Respuestas curadas (pregunta → respuesta) que el bot prioriza. {items.length} en total · {activas} activas.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={abrirDesdeChat} className="px-3 py-1.5 bg-surface-100 dark:bg-surface-700 text-surface-700 dark:text-surface-200 rounded-md text-xs font-medium hover:bg-surface-200 transition-colors border border-surface-200 dark:border-surface-600">
            ✨ Generar desde un chat
          </button>
          <button onClick={() => setForm({ ...FORM_VACIO })} className="px-3 py-1.5 bg-accent-600 text-white rounded-md text-xs font-medium hover:bg-accent-700 transition-colors">
            + Nueva situación
          </button>
        </div>
      </div>

      {/* Analítica de huecos / revisión */}
      {analitica && analitica.totales.total > 0 && (
        <div className="mb-5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div className="text-center">
              <div className="text-lg font-semibold text-surface-800 dark:text-surface-100">{analitica.totales.total}</div>
              <div className="text-[10px] text-surface-400 uppercase tracking-wide">Consultas</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-amber-600">{analitica.totales.huecos}</div>
              <div className="text-[10px] text-surface-400 uppercase tracking-wide">Sin respuesta</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-emerald-600">{analitica.totales.positivos}</div>
              <div className="text-[10px] text-surface-400 uppercase tracking-wide">👍 buenas</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-red-600">{analitica.totales.negativos}</div>
              <div className="text-[10px] text-surface-400 uppercase tracking-wide">👎 malas</div>
            </div>
          </div>

          {(analitica.recientesHuecos.length > 0 || analitica.recientesNegativos.length > 0) && (
            <>
              <div className="flex items-center gap-1 mb-2 border-b border-surface-100 dark:border-surface-700">
                <button onClick={() => setTabRev("huecos")} className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px ${tabRev === "huecos" ? "border-accent-500 text-accent-600" : "border-transparent text-surface-500 hover:text-surface-700"}`}>
                  Huecos ({analitica.recientesHuecos.length})
                </button>
                <button onClick={() => setTabRev("malas")} className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px ${tabRev === "malas" ? "border-accent-500 text-accent-600" : "border-transparent text-surface-500 hover:text-surface-700"}`}>
                  Respuestas 👎 ({analitica.recientesNegativos.length})
                </button>
              </div>
              <p className="text-[10px] text-surface-400 mb-2">
                {tabRev === "huecos" ? "Consultas que el bot no supo responder. Creá una situación para cubrirlas." : "Respuestas marcadas como malas. Corregilas creando una situación."}
              </p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {(tabRev === "huecos" ? analitica.recientesHuecos : analitica.recientesNegativos).map((r: any) => (
                  <div key={r.id} className="flex items-start gap-2 text-xs bg-surface-50 dark:bg-surface-900/40 rounded-md px-2.5 py-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-surface-700 dark:text-surface-200 font-medium">{r.pregunta}</p>
                      {tabRev === "malas" && r.respuesta && <p className="text-surface-400 mt-0.5 line-clamp-2">↳ {r.respuesta}</p>}
                    </div>
                    <button onClick={() => crearDesde(r.pregunta, tabRev === "malas" ? r.respuesta : "")} className="flex-shrink-0 text-[10px] text-accent-600 hover:bg-accent-50 px-2 py-1 rounded-md font-medium whitespace-nowrap">
                      → situación
                    </button>
                  </div>
                ))}
                {(tabRev === "huecos" ? analitica.recientesHuecos : analitica.recientesNegativos).length === 0 && (
                  <p className="text-xs text-surface-400 text-center py-3">Nada por acá 🎉</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-surface-400">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-surface-400 border border-dashed border-surface-200 dark:border-surface-700 rounded-xl">
          <p className="text-sm font-medium">Todavía no hay situaciones</p>
          <p className="text-xs mt-1">Creá una a mano o generala desde un chat de Mesa resuelto.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((s) => (
            <div key={s.id} className={`rounded-lg border p-3 ${s.activo ? "border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800" : "border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50 opacity-70"}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] bg-accent-50 text-accent-700 px-1.5 py-0.5 rounded-full font-medium">{s.categoria}</span>
                    {s.origenChatId && <span className="text-[10px] bg-surface-100 dark:bg-surface-700 text-surface-500 px-1.5 py-0.5 rounded-full">desde chat</span>}
                    {!s.activo && <span className="text-[10px] bg-surface-200 text-surface-500 px-1.5 py-0.5 rounded-full">inactiva</span>}
                  </div>
                  <p className="text-sm font-medium text-surface-800 dark:text-surface-100 mt-1">{s.pregunta}</p>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-1 whitespace-pre-wrap line-clamp-3">{s.respuesta}</p>
                  {s.palabrasClave && <p className="text-[10px] text-surface-400 mt-1">🔎 {s.palabrasClave}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => toggleActivo(s)} title={s.activo ? "Desactivar" : "Activar"} className="p-1.5 text-surface-400 hover:text-surface-700 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-md text-xs">{s.activo ? "🟢" : "⚪"}</button>
                  <button onClick={() => setForm({ id: s.id, pregunta: s.pregunta, respuesta: s.respuesta, categoria: s.categoria, palabrasClave: s.palabrasClave || "", activo: s.activo })} className="px-2 py-1 text-xs text-accent-600 hover:bg-accent-50 rounded-md">Editar</button>
                  <button onClick={() => eliminar(s.id)} className="p-1.5 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded-md" title="Eliminar">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal editor */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-surface-800 rounded-lg shadow-xl p-6 w-full max-w-lg animate-fade-in-up max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-surface-800 dark:text-surface-100 mb-4">{form.id ? "Editar situación" : "Nueva situación"}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">Pregunta típica del técnico *</label>
                <textarea value={form.pregunta} onChange={(e) => setForm({ ...form, pregunta: e.target.value })} rows={2} placeholder="ej: El AP no prende / no tiene ninguna luz" className="w-full px-3 py-2 border border-surface-200 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100 rounded-md text-sm focus:outline-none focus:border-accent-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">Respuesta correcta (tono Mesa, corto) *</label>
                <textarea value={form.respuesta} onChange={(e) => setForm({ ...form, respuesta: e.target.value })} rows={5} placeholder="La respuesta que daría Mesa…" className="w-full px-3 py-2 border border-surface-200 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100 rounded-md text-sm focus:outline-none focus:border-accent-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">Categoría</label>
                  <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="w-full px-3 py-2 border border-surface-200 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100 rounded-md text-sm focus:outline-none focus:border-accent-400">
                    {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">Palabras clave (opcional)</label>
                  <input value={form.palabrasClave} onChange={(e) => setForm({ ...form, palabrasClave: e.target.value })} placeholder="no enciende, sin luz…" className="w-full px-3 py-2 border border-surface-200 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100 rounded-md text-sm focus:outline-none focus:border-accent-400" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-surface-600 cursor-pointer">
                <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} className="rounded border-surface-300 text-accent-600" />
                Activa (el bot la usa)
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setForm(null)} disabled={guardando} className="px-4 py-2 text-xs text-surface-600 hover:bg-surface-100 rounded-md disabled:opacity-50">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="px-4 py-2 text-xs bg-accent-600 text-white rounded-md hover:bg-accent-700 font-medium disabled:opacity-50">{guardando ? "Guardando…" : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal generar desde chat */}
      {showDesdeChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-surface-800 rounded-lg shadow-xl p-6 w-full max-w-lg animate-fade-in-up">
            <h2 className="text-base font-semibold text-surface-800 dark:text-surface-100 mb-1">Generar situación desde un chat</h2>
            <p className="text-xs text-surface-400 mb-4">Elegí una conversación de Mesa resuelta. El asistente redacta un borrador (pregunta + respuesta) que después revisás y guardás.</p>
            <select value={chatSel} onChange={(e) => setChatSel(e.target.value)} className="w-full px-3 py-2 border border-surface-200 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100 rounded-md text-sm focus:outline-none focus:border-accent-400">
              <option value="">Elegí una conversación…</option>
              {chats.map((c) => (
                <option key={c.id} value={c.id}>{(c.asunto || "Sin asunto")} · {c.creador?.nombre || ""} · {c._count?.mensajes || 0} msgs</option>
              ))}
            </select>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowDesdeChat(false)} disabled={generando} className="px-4 py-2 text-xs text-surface-600 hover:bg-surface-100 rounded-md disabled:opacity-50">Cancelar</button>
              <button onClick={generarBorrador} disabled={generando || !chatSel} className="px-4 py-2 text-xs bg-accent-600 text-white rounded-md hover:bg-accent-700 font-medium disabled:opacity-50">{generando ? "Generando…" : "Generar borrador"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
