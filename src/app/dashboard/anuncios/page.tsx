"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "@/hooks/useSession";
import { usePermisos } from "@/hooks/usePermisos";
import { IconPlus, IconX, IconTrash, IconEdit, IconCheck, IconClock } from "@/components/ui/Icons";
import clsx from "clsx";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Prioridad = "BAJA" | "MEDIA" | "ALTA" | "URGENTE";

interface Anuncio {
  id: string;
  titulo: string;
  contenido: string;
  prioridad: Prioridad;
  fijado: boolean;
  activo: boolean;
  notificar: boolean;
  intervaloHoras: number;
  fechaExpiracion: string | null;
  autor: { id: string; nombre: string } | null;
  createdAt: string;
  updatedAt: string;
  leido: boolean;
  lecturasCount?: number;
}

interface Jornada {
  id: string;
  inicio: string;
  fin: string | null;
}

const PRIORIDAD_META: Record<Prioridad, { label: string; badge: string }> = {
  BAJA:    { label: "Baja",    badge: "bg-surface-100 text-surface-500 border-surface-200" },
  MEDIA:   { label: "Media",   badge: "bg-blue-50 text-blue-600 border-blue-200" },
  ALTA:    { label: "Alta",    badge: "bg-amber-50 text-amber-600 border-amber-200" },
  URGENTE: { label: "Urgente", badge: "bg-red-50 text-red-600 border-red-200" },
};

function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtDuracion(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

async function capturarUbicacion(): Promise<{ lat: number | null; lng: number | null }> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return { lat: null, lng: null };
  return new Promise((resolve) => {
    const done = (lat: number | null, lng: number | null) => resolve({ lat, lng });
    const t = setTimeout(() => done(null, null), 6000);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(t); done(pos.coords.latitude, pos.coords.longitude); },
      () => { clearTimeout(t); done(null, null); },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
    );
  });
}

export default function AnunciosPage() {
  const { isModOrAdmin } = useSession();
  const { puedeVer, puedeCrear, loading: permisosLoading } = usePermisos();
  const canManage = isModOrAdmin || puedeCrear("anuncios");

  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [loading, setLoading] = useState(true);

  // Jornada (ingreso / salida)
  const [jornadaActiva, setJornadaActiva] = useState<Jornada | null>(null);
  const [jornadasHoy, setJornadasHoy] = useState<Jornada[]>([]);
  const [jornadaLoading, setJornadaLoading] = useState(true);
  const [marcando, setMarcando] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  // Modal crear/editar
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Anuncio | null>(null);
  const [form, setForm] = useState({
    titulo: "", contenido: "", prioridad: "MEDIA" as Prioridad,
    fijado: false, notificar: true, intervaloHoras: 1, fechaExpiracion: "",
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Anuncio | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const marcadoRef = useRef(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const fetchAnuncios = useCallback(async () => {
    const res = await fetch("/api/anuncios", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setAnuncios(data.anuncios || []);
    }
    setLoading(false);
  }, []);

  const fetchJornada = useCallback(async () => {
    const res = await fetch("/api/jornadas", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setJornadaActiva(data.mia || null);
      setJornadasHoy(data.hoy || []);
    }
    setJornadaLoading(false);
  }, []);

  // Carga inicial: marca leídos (corta el spam push) y luego trae el tablero
  useEffect(() => {
    (async () => {
      if (!marcadoRef.current) {
        marcadoRef.current = true;
        await fetch("/api/anuncios/marcar-leidos", { method: "POST", credentials: "include" }).catch(() => {});
      }
      fetchAnuncios();
      fetchJornada();
    })();
  }, [fetchAnuncios, fetchJornada]);

  // Reloj para el tiempo transcurrido de la jornada abierta
  useEffect(() => {
    if (!jornadaActiva) return;
    const t = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(t);
  }, [jornadaActiva]);

  async function marcarJornada(accion: "ingreso" | "salida") {
    setMarcando(true);
    const { lat, lng } = await capturarUbicacion();
    const res = await fetch("/api/jornadas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ accion, lat, lng }),
    });
    if (res.ok) {
      await fetchJornada();
      showToast(accion === "ingreso" ? "Ingreso registrado. ¡Buen trabajo!" : "Salida registrada.");
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "No se pudo registrar.");
    }
    setMarcando(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({ titulo: "", contenido: "", prioridad: "MEDIA", fijado: false, notificar: true, intervaloHoras: 1, fechaExpiracion: "" });
    setShowModal(true);
  }

  function openEdit(a: Anuncio) {
    setEditing(a);
    setForm({
      titulo: a.titulo,
      contenido: a.contenido,
      prioridad: a.prioridad,
      fijado: a.fijado,
      notificar: a.notificar,
      intervaloHoras: a.intervaloHoras,
      fechaExpiracion: a.fechaExpiracion ? a.fechaExpiracion.slice(0, 16) : "",
    });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim() || !form.contenido.trim()) return;
    setSaving(true);
    const payload = {
      titulo: form.titulo.trim(),
      contenido: form.contenido.trim(),
      prioridad: form.prioridad,
      fijado: form.fijado,
      notificar: form.notificar,
      intervaloHoras: form.intervaloHoras,
      fechaExpiracion: form.fechaExpiracion ? new Date(form.fechaExpiracion).toISOString() : null,
    };
    const url = editing ? `/api/anuncios/${editing.id}` : "/api/anuncios";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setShowModal(false);
      showToast(editing ? "Anuncio actualizado" : "Anuncio publicado y notificado");
      fetchAnuncios();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "No se pudo guardar");
    }
    setSaving(false);
  }

  async function toggleActivo(a: Anuncio) {
    const res = await fetch(`/api/anuncios/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ activo: !a.activo }),
    });
    if (res.ok) fetchAnuncios();
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const res = await fetch(`/api/anuncios/${confirmDelete.id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setConfirmDelete(null);
      showToast("Anuncio eliminado");
      fetchAnuncios();
    }
  }

  const minutosHoy = jornadasHoy.reduce((acc, j) => {
    const fin = j.fin ? new Date(j.fin).getTime() : ahora;
    return acc + Math.max(0, Math.round((fin - new Date(j.inicio).getTime()) / 60000));
  }, 0);

  const minutosActiva = jornadaActiva
    ? Math.max(0, Math.round((ahora - new Date(jornadaActiva.inicio).getTime()) / 60000))
    : 0;

  if (!permisosLoading && !puedeVer("anuncios")) {
    return (
      <div className="animate-fade-in-up flex items-center justify-center py-20">
        <p className="text-sm text-surface-400">No tenés acceso a esta sección.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 dark:text-surface-100">Anuncios</h1>
          <p className="text-xs text-surface-400 mt-0.5">
            {loading ? "Cargando..." : `${anuncios.filter(a => a.activo).length} anuncio(s) activo(s)`}
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="px-2.5 py-1.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 transition-colors flex items-center gap-1"
          >
            <IconPlus className="w-3.5 h-3.5" />
            Nuevo anuncio
          </button>
        )}
      </div>

      {/* Widget Jornada (ingreso / salida) */}
      <div className="mb-5 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={clsx(
              "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
              jornadaActiva ? "bg-emerald-100 text-emerald-600" : "bg-surface-100 text-surface-400"
            )}>
              <IconClock className="w-5 h-5" />
            </div>
            <div>
              {jornadaLoading ? (
                <p className="text-sm text-surface-400">Cargando jornada...</p>
              ) : jornadaActiva ? (
                <>
                  <p className="text-sm font-semibold text-surface-800 dark:text-surface-100 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    En campo desde {fmtHora(jornadaActiva.inicio)}
                  </p>
                  <p className="text-xs text-surface-400 mt-0.5">
                    Llevás {fmtDuracion(minutosActiva)} en esta jornada · Hoy: {fmtDuracion(minutosHoy)}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-surface-800 dark:text-surface-100">Sin jornada iniciada</p>
                  <p className="text-xs text-surface-400 mt-0.5">
                    {minutosHoy > 0 ? `Hoy trabajaste ${fmtDuracion(minutosHoy)}` : "Marcá tu ingreso cuando empieces a trabajar"}
                  </p>
                </>
              )}
            </div>
          </div>
          {!jornadaLoading && (
            jornadaActiva ? (
              <button
                onClick={() => marcarJornada("salida")}
                disabled={marcando}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {marcando ? "Registrando..." : "Marcar salida"}
              </button>
            ) : (
              <button
                onClick={() => marcarJornada("ingreso")}
                disabled={marcando}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {marcando ? "Registrando..." : "Marcar ingreso"}
              </button>
            )
          )}
        </div>
      </div>

      {/* Lista de anuncios */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" />
        </div>
      ) : anuncios.length === 0 ? (
        <div className="text-center py-12 text-surface-400">
          <p className="text-sm">No hay anuncios todavía.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {anuncios.map((a) => {
            const meta = PRIORIDAD_META[a.prioridad];
            const expirado = a.fechaExpiracion ? new Date(a.fechaExpiracion) < new Date() : false;
            return (
              <div
                key={a.id}
                className={clsx(
                  "rounded-xl border bg-white dark:bg-surface-800 p-4 transition-colors",
                  a.fijado ? "border-amber-300 dark:border-amber-700" : "border-surface-200 dark:border-surface-700",
                  !a.activo && "opacity-60"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {a.fijado && (
                        <span className="text-amber-500" title="Fijado">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
                        </span>
                      )}
                      <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-100 truncate">{a.titulo}</h3>
                      <span className={clsx("px-1.5 py-0.5 rounded text-[10px] font-semibold border", meta.badge)}>{meta.label}</span>
                      {!a.activo && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-100 text-surface-500 border border-surface-200">Inactivo</span>}
                      {expirado && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-100 text-surface-500 border border-surface-200">Expirado</span>}
                    </div>
                    <p className="text-sm text-surface-600 dark:text-surface-300 whitespace-pre-wrap break-words">{a.contenido}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-2 text-[11px] text-surface-400">
                      <span>{a.autor?.nombre || "—"}</span>
                      <span>·</span>
                      <span>{fmtFecha(a.createdAt)}</span>
                      {a.notificar && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1" title={`Re-notifica cada ${a.intervaloHoras}h a quienes no lo leyeron`}>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
                            cada {a.intervaloHoras}h
                          </span>
                        </>
                      )}
                      {canManage && a.lecturasCount !== undefined && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1"><IconCheck className="w-3 h-3" />{a.lecturasCount} leído(s)</span>
                        </>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => toggleActivo(a)} title={a.activo ? "Desactivar" : "Activar"} className="px-1.5 py-1 rounded text-[10px] font-medium text-surface-400 hover:text-surface-700 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors">
                        {a.activo ? "Ocultar" : "Activar"}
                      </button>
                      <button onClick={() => openEdit(a)} title="Editar" className="p-1 text-surface-400 hover:text-primary-600 rounded transition-colors">
                        <IconEdit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setConfirmDelete(a)} title="Eliminar" className="p-1 text-surface-400 hover:text-red-600 rounded transition-colors">
                        <IconTrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 bg-surface-800 text-white text-xs rounded-lg shadow-lg animate-fade-in-up">
          {toast}
        </div>
      )}

      {/* Modal crear/editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-surface-800 rounded-xl shadow-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-surface-800 dark:text-surface-100">{editing ? "Editar anuncio" : "Nuevo anuncio"}</h2>
              <button onClick={() => setShowModal(false)} className="text-surface-400 hover:text-surface-600"><IconX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-surface-500 mb-1">Título *</label>
                <input type="text" value={form.titulo} onChange={(e) => setForm(f => ({ ...f, titulo: e.target.value }))} className="w-full px-2.5 py-1.5 border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md text-xs focus:outline-none focus:border-surface-400" required />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-surface-500 mb-1">Contenido *</label>
                <textarea value={form.contenido} onChange={(e) => setForm(f => ({ ...f, contenido: e.target.value }))} rows={4} className="w-full px-2.5 py-1.5 border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md text-xs focus:outline-none focus:border-surface-400 resize-none" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-surface-500 mb-1">Prioridad</label>
                  <select value={form.prioridad} onChange={(e) => setForm(f => ({ ...f, prioridad: e.target.value as Prioridad }))} className="w-full px-2.5 py-1.5 border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md text-xs focus:outline-none focus:border-surface-400">
                    <option value="BAJA">Baja</option>
                    <option value="MEDIA">Media</option>
                    <option value="ALTA">Alta</option>
                    <option value="URGENTE">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-surface-500 mb-1">Expira (opcional)</label>
                  <input type="datetime-local" value={form.fechaExpiracion} onChange={(e) => setForm(f => ({ ...f, fechaExpiracion: e.target.value }))} className="w-full px-2.5 py-1.5 border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md text-xs focus:outline-none focus:border-surface-400" />
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap pt-1">
                <label className="flex items-center gap-2 text-xs text-surface-600 dark:text-surface-300 cursor-pointer">
                  <input type="checkbox" checked={form.fijado} onChange={(e) => setForm(f => ({ ...f, fijado: e.target.checked }))} className="rounded" />
                  Fijar arriba
                </label>
                <label className="flex items-center gap-2 text-xs text-surface-600 dark:text-surface-300 cursor-pointer">
                  <input type="checkbox" checked={form.notificar} onChange={(e) => setForm(f => ({ ...f, notificar: e.target.checked }))} className="rounded" />
                  Notificar a técnicos
                </label>
                {form.notificar && (
                  <label className="flex items-center gap-2 text-xs text-surface-600 dark:text-surface-300">
                    Repetir cada
                    <input type="number" min={1} max={168} value={form.intervaloHoras} onChange={(e) => setForm(f => ({ ...f, intervaloHoras: Math.max(1, Math.min(168, Number(e.target.value) || 1)) }))} className="w-16 px-2 py-1 border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md text-xs text-center" />
                    h
                  </label>
                )}
              </div>
              <p className="text-[10px] text-surface-400">
                Si activás &ldquo;Notificar&rdquo;, se envía un push inmediato a todos los técnicos y se repite cada {form.intervaloHoras}h hasta que cada uno abra el tablero{form.fechaExpiracion ? " o hasta la fecha de expiración" : ""}.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-md">Cancelar</button>
                <button type="submit" disabled={saving} className="px-3 py-1.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 disabled:opacity-50">
                  {saving ? "Guardando..." : editing ? "Guardar" : "Publicar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmar eliminación */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white dark:bg-surface-800 rounded-xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-100 mb-2">Eliminar anuncio</h3>
            <p className="text-xs text-surface-500 mb-4">¿Eliminar <strong>{confirmDelete.titulo}</strong>? Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-md">Cancelar</button>
              <button onClick={handleDelete} className="px-3 py-1.5 bg-red-600 text-white rounded-md text-xs font-medium hover:bg-red-700">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
