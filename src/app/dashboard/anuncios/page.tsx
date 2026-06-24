"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useSession } from "@/hooks/useSession";
import { usePermisos } from "@/hooks/usePermisos";
import { IconPlus, IconTrash, IconEdit, IconCheck, IconClock } from "@/components/ui/Icons";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import StatusIcon from "@/components/StatusIcon";
import { CATEGORIAS_ANUNCIO, CATEGORIA_META, ROLES_DESTINO, ROL_LABEL, audienciaLabel, type CategoriaAnuncio } from "@/lib/anunciosConfig";
import clsx from "clsx";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Prioridad = "BAJA" | "MEDIA" | "ALTA" | "URGENTE";

interface Anuncio {
  id: string;
  titulo: string;
  contenido: string;
  prioridad: Prioridad;
  categoria: string;
  rolesDestino: string[];
  usuariosDestino: string[];
  requiereAceptacion: boolean;
  fijado: boolean;
  activo: boolean;
  notificar: boolean;
  intervaloHoras: number;
  fechaPublicacion: string | null;
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

interface MisTareasData {
  total: number;
  predios: any[];
  quickCounts: { hoy: number; vencidas: number; noConformes: number; prioridadAlta: number };
}

const PRIORIDAD_META: Record<Prioridad, { label: string; badge: string; accent: string }> = {
  BAJA:    { label: "Baja",    badge: "bg-surface-100 text-surface-500 border-surface-200 dark:bg-surface-700 dark:text-surface-400 dark:border-surface-600", accent: "bg-surface-300 dark:bg-surface-600" },
  MEDIA:   { label: "Media",   badge: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800", accent: "bg-blue-400" },
  ALTA:    { label: "Alta",    badge: "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800", accent: "bg-amber-400" },
  URGENTE: { label: "Muy alta", badge: "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800", accent: "bg-red-500" },
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

/** Panel lateral: resumen de las tareas asignadas al usuario. */
function MisTareasWidget() {
  const [data, setData] = useState<MisTareasData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tareas/mis", { credentials: "include" })
      .then(async (res) => { if (res.ok) setData(await res.json()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    { label: "Para hoy", value: data?.quickCounts?.hoy ?? 0, className: "text-blue-600 dark:text-blue-400" },
    { label: "Vencidas", value: data?.quickCounts?.vencidas ?? 0, className: "text-red-600 dark:text-red-400" },
    { label: "No conformes", value: data?.quickCounts?.noConformes ?? 0, className: "text-amber-600 dark:text-amber-400" },
    { label: "Prioridad alta", value: data?.quickCounts?.prioridadAlta ?? 0, className: "text-violet-600 dark:text-violet-400" },
  ];

  return (
    <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
        <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-100">Mis tareas</h2>
        <Link href="/dashboard/mis-tareas" className="text-[11px] font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
          Ver todas →
        </Link>
      </div>
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-4 h-4 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" />
        </div>
      ) : !data || data.total === 0 ? (
        <p className="px-4 pb-4 text-xs text-surface-400">No tenés tareas asignadas pendientes.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px bg-surface-100 dark:bg-surface-700 border-y border-surface-100 dark:border-surface-700">
            {stats.map((s) => (
              <div key={s.label} className="bg-white dark:bg-surface-800 px-4 py-2.5">
                <p className={clsx("text-lg font-bold leading-none", s.className)}>{s.value}</p>
                <p className="text-[10px] text-surface-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="divide-y divide-surface-100 dark:divide-surface-700/60">
            {data.predios.slice(0, 5).map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/tareas?openId=${p.id}`}
                className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors"
              >
                {p.estado ? (
                  <StatusIcon clave={p.estado.clave} color={p.estado.color} size={13} />
                ) : (
                  <span className="w-[13px] h-[13px] rounded-full bg-surface-200 dark:bg-surface-600 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-surface-700 dark:text-surface-200 truncate">
                    {p.codigo ? <span className="tabular-nums font-semibold">{p.codigo}</span> : null}
                    {p.codigo && (p.incidencias || p.nombre) ? " · " : ""}
                    {p.incidencias || p.nombre}
                  </p>
                  {p.espacio && <p className="text-[10px] text-surface-400 truncate">{p.espacio.nombre}</p>}
                </div>
                {p.isNoConforme && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">NC</span>
                )}
              </Link>
            ))}
          </div>
          {data.total > 5 && (
            <p className="px-4 py-2 text-[10px] text-surface-400 border-t border-surface-100 dark:border-surface-700">
              +{data.total - 5} tareas más en tu lista
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function AnunciosPage() {
  const { isModOrAdmin } = useSession();
  const { puedeVer, puedeCrear, loading: permisosLoading } = usePermisos();
  const canManage = isModOrAdmin || puedeCrear("anuncios");

  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<string>("TODOS");
  const [busqueda, setBusqueda] = useState("");

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
    categoria: "GENERAL" as CategoriaAnuncio, rolesDestino: [] as string[], usuariosDestino: [] as string[],
    fijado: false, notificar: true, intervaloHoras: 1, fechaPublicacion: "", fechaExpiracion: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Anuncio | null>(null);

  // Selector de usuarios (audiencia manual)
  const [usuarios, setUsuarios] = useState<Array<{ id: string; nombre: string; email?: string | null }>>([]);
  const [userSearch, setUserSearch] = useState("");
  // Panel de aceptaciones (admin): anuncioId -> datos
  const [aceptExpandido, setAceptExpandido] = useState<string | null>(null);
  const [aceptData, setAceptData] = useState<Record<string, { total: number; aceptaron: { id: string; nombre: string; aceptadoAt: string }[]; pendientes: { id: string; nombre: string }[] }>>({});

  const marcadoRef = useRef(false);

  const fetchAnuncios = useCallback(async () => {
    const res = await fetch("/api/anuncios", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setAnuncios(data.anuncios || []);
      return data.anuncios as Anuncio[];
    }
    return [];
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

  // Carga inicial: trae el tablero (capturando no-leídos para el badge "Nuevo")
  // y recién después marca leídos en background para frenar el spam de push.
  useEffect(() => {
    (async () => {
      const items = await fetchAnuncios();
      setLoading(false);
      setUnreadIds(new Set(items.filter((a) => !a.leido).map((a) => a.id)));
      if (!marcadoRef.current) {
        marcadoRef.current = true;
        fetch("/api/anuncios/marcar-leidos", { method: "POST", credentials: "include" }).catch(() => {});
      }
      fetchJornada();
    })();
  }, [fetchAnuncios, fetchJornada]);

  // Lista de usuarios para la audiencia manual (solo gestores)
  useEffect(() => {
    if (!canManage) return;
    fetch("/api/catalogos/usuarios", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setUsuarios(Array.isArray(data) ? data : data.usuarios || []))
      .catch(() => {});
  }, [canManage]);

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
      toast.success(accion === "ingreso" ? "Ingreso registrado. ¡Buen trabajo!" : "Salida registrada.");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "No se pudo registrar.");
    }
    setMarcando(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({
      titulo: "", contenido: "", prioridad: "MEDIA",
      categoria: tab !== "TODOS" && (CATEGORIAS_ANUNCIO as readonly string[]).includes(tab) ? tab as CategoriaAnuncio : "GENERAL",
      rolesDestino: [], usuariosDestino: [], fijado: false, notificar: true, intervaloHoras: 1, fechaPublicacion: "", fechaExpiracion: "",
    });
    setUserSearch("");
    setShowModal(true);
  }

  function openEdit(a: Anuncio) {
    setEditing(a);
    setForm({
      titulo: a.titulo,
      contenido: a.contenido,
      prioridad: a.prioridad,
      categoria: (CATEGORIAS_ANUNCIO as readonly string[]).includes(a.categoria) ? a.categoria as CategoriaAnuncio : "GENERAL",
      rolesDestino: a.rolesDestino || [],
      usuariosDestino: a.usuariosDestino || [],
      fijado: a.fijado,
      notificar: a.notificar,
      intervaloHoras: a.intervaloHoras,
      fechaPublicacion: a.fechaPublicacion ? a.fechaPublicacion.slice(0, 16) : "",
      fechaExpiracion: a.fechaExpiracion ? a.fechaExpiracion.slice(0, 16) : "",
    });
    setUserSearch("");
    setShowModal(true);
  }

  function toggleRolDestino(rol: string) {
    setForm((f) => ({
      ...f,
      rolesDestino: f.rolesDestino.includes(rol)
        ? f.rolesDestino.filter((r) => r !== rol)
        : [...f.rolesDestino, rol],
    }));
  }

  function toggleUsuarioDestino(uid: string) {
    setForm((f) => ({
      ...f,
      usuariosDestino: f.usuariosDestino.includes(uid)
        ? f.usuariosDestino.filter((u) => u !== uid)
        : [...f.usuariosDestino, uid],
    }));
  }

  async function loadAceptaciones(anuncioId: string) {
    if (aceptExpandido === anuncioId) { setAceptExpandido(null); return; }
    setAceptExpandido(anuncioId);
    try {
      const res = await fetch(`/api/anuncios/${anuncioId}/aceptaciones`, { credentials: "include", cache: "no-store" });
      if (res.ok) { const d = await res.json(); setAceptData((prev) => ({ ...prev, [anuncioId]: d })); }
    } catch { /* ignorar */ }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim() || !form.contenido.trim()) return;
    setSaving(true);
    const payload = {
      titulo: form.titulo.trim(),
      contenido: form.contenido.trim(),
      prioridad: form.prioridad,
      categoria: form.categoria,
      rolesDestino: form.rolesDestino,
      usuariosDestino: form.usuariosDestino,
      fijado: form.fijado,
      notificar: form.notificar,
      intervaloHoras: form.intervaloHoras,
      fechaPublicacion: form.fechaPublicacion ? new Date(form.fechaPublicacion).toISOString() : null,
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
      toast.success(editing ? "Anuncio actualizado" : "Anuncio publicado y notificado");
      fetchAnuncios();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "No se pudo guardar");
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
    setDeleting(true);
    const res = await fetch(`/api/anuncios/${confirmDelete.id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setConfirmDelete(null);
      toast.success("Anuncio eliminado");
      fetchAnuncios();
    } else {
      toast.error("No se pudo eliminar");
    }
    setDeleting(false);
  }

  const minutosHoy = jornadasHoy.reduce((acc, j) => {
    const fin = j.fin ? new Date(j.fin).getTime() : ahora;
    return acc + Math.max(0, Math.round((fin - new Date(j.inicio).getTime()) / 60000));
  }, 0);

  const minutosActiva = jornadaActiva
    ? Math.max(0, Math.round((ahora - new Date(jornadaActiva.inicio).getTime()) / 60000))
    : 0;

  // Conteo por tablero (sobre anuncios visibles, sin filtro de búsqueda)
  const countsPorCategoria = useMemo(() => {
    const counts: Record<string, number> = { TODOS: anuncios.length };
    for (const c of CATEGORIAS_ANUNCIO) counts[c] = 0;
    for (const a of anuncios) {
      counts[a.categoria] = (counts[a.categoria] ?? 0) + 1;
    }
    return counts;
  }, [anuncios]);

  const visibles = useMemo(() => {
    let list = anuncios;
    if (tab !== "TODOS") list = list.filter((a) => a.categoria === tab);
    const q = busqueda.trim().toLowerCase();
    if (q) list = list.filter((a) => a.titulo.toLowerCase().includes(q) || a.contenido.toLowerCase().includes(q) || (a.autor?.nombre || "").toLowerCase().includes(q));
    return list;
  }, [anuncios, tab, busqueda]);

  const fijados = visibles.filter((a) => a.fijado && a.activo);
  const resto = visibles.filter((a) => !(a.fijado && a.activo));

  if (!permisosLoading && !puedeVer("anuncios")) {
    return (
      <div className="animate-fade-in-up flex items-center justify-center py-20">
        <p className="text-sm text-surface-400">No tenés acceso a esta sección.</p>
      </div>
    );
  }

  const renderCard = (a: Anuncio) => {
    const meta = PRIORIDAD_META[a.prioridad];
    const cat = CATEGORIA_META[a.categoria as CategoriaAnuncio] || CATEGORIA_META.GENERAL;
    const expirado = a.fechaExpiracion ? new Date(a.fechaExpiracion) < new Date() : false;
    const programado = a.fechaPublicacion ? new Date(a.fechaPublicacion) > new Date() : false;
    const esNuevo = unreadIds.has(a.id);
    return (
      <div
        key={a.id}
        className={clsx(
          "relative overflow-hidden rounded-xl border bg-white dark:bg-surface-800 transition-colors",
          esNuevo ? "border-primary-300 dark:border-primary-700 shadow-sm" : "border-surface-200 dark:border-surface-700",
          !a.activo && "opacity-60"
        )}
      >
        <span className={clsx("absolute inset-y-0 left-0 w-1", meta.accent)} />
        <div className="p-4 pl-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {a.fijado && (
                  <span className="text-amber-500" title="Fijado">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
                  </span>
                )}
                <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-100">{a.titulo}</h3>
                {esNuevo && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-primary-600 text-white">NUEVO</span>}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mb-2">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-50 text-surface-500 border border-surface-200 dark:bg-surface-700/60 dark:text-surface-300 dark:border-surface-600">
                  <span className={clsx("w-1.5 h-1.5 rounded-full", cat.dot)} />
                  {cat.label}
                </span>
                <span className={clsx("px-1.5 py-0.5 rounded text-[10px] font-semibold border", meta.badge)}>{meta.label}</span>
                {a.requiereAceptacion && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-600 text-white" title="Popup bloqueante que el destinatario debe aceptar">Bloqueante</span>
                )}
                {programado && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-600 border border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800" title={a.fechaPublicacion ? fmtFecha(a.fechaPublicacion) : ""}>Programado</span>
                )}
                {(canManage || a.rolesDestino.length > 0) && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-50 text-surface-500 border border-surface-200 dark:bg-surface-700/60 dark:text-surface-300 dark:border-surface-600" title="Audiencia">
                    Para: {audienciaLabel(a.rolesDestino)}
                  </span>
                )}
                {!a.activo && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-100 text-surface-500 border border-surface-200">Inactivo</span>}
                {expirado && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-100 text-surface-500 border border-surface-200">Expirado</span>}
              </div>
              <p className="text-sm text-surface-600 dark:text-surface-300 whitespace-pre-wrap break-words">{a.contenido}</p>
              <div className="flex items-center gap-2 flex-wrap mt-2.5 text-[11px] text-surface-400">
                <span className="inline-flex items-center gap-1">
                  <span className="w-5 h-5 rounded-full bg-surface-100 dark:bg-surface-700 flex items-center justify-center text-[9px] font-bold text-surface-500 dark:text-surface-300">
                    {(a.autor?.nombre || "—").slice(0, 1).toUpperCase()}
                  </span>
                  {a.autor?.nombre || "—"}
                </span>
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
                {canManage && a.lecturasCount !== undefined && !a.requiereAceptacion && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1"><IconCheck className="w-3 h-3" />{a.lecturasCount} leído(s)</span>
                  </>
                )}
              </div>
              {canManage && a.requiereAceptacion && (
                <div className="mt-2.5 rounded-lg border border-red-100 dark:border-red-900/40 bg-red-50/50 dark:bg-red-900/10 p-2">
                  <button type="button" onClick={() => loadAceptaciones(a.id)} className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline">
                    <IconCheck className="w-3 h-3" />
                    {aceptExpandido === a.id ? "Ocultar aceptaciones" : "Ver quién aceptó"}
                  </button>
                  {aceptExpandido === a.id && aceptData[a.id] && (
                    <div className="mt-2 space-y-1.5 text-[11px] text-surface-600 dark:text-surface-300">
                      <p className="font-medium">{aceptData[a.id].aceptaron.length} de {aceptData[a.id].total} aceptaron</p>
                      {aceptData[a.id].aceptaron.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {aceptData[a.id].aceptaron.map((u) => (
                            <span key={u.id} title={fmtFecha(u.aceptadoAt)} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                              <IconCheck className="w-2.5 h-2.5" />{u.nombre}
                            </span>
                          ))}
                        </div>
                      )}
                      {aceptData[a.id].pendientes.length > 0 && (
                        <div>
                          <p className="text-surface-400">Faltan ({aceptData[a.id].pendientes.length}):</p>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {aceptData[a.id].pendientes.map((u) => (
                              <span key={u.id} className="rounded-full border border-surface-200 bg-surface-100 px-1.5 py-0.5 text-surface-500 dark:border-surface-600 dark:bg-surface-700 dark:text-surface-300">{u.nombre}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
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
      </div>
    );
  };

  return (
    <div className="animate-fade-in-up max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 dark:text-surface-100">Anuncios</h1>
          <p className="text-xs text-surface-400 mt-0.5">
            {loading ? "Cargando..." : `${anuncios.filter(a => a.activo).length} anuncio(s) activo(s)${unreadIds.size > 0 ? ` · ${unreadIds.size} nuevo(s)` : ""}`}
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="px-3 py-1.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 transition-colors flex items-center gap-1"
          >
            <IconPlus className="w-3.5 h-3.5" />
            Nuevo anuncio
          </button>
        )}
      </div>

      {/* Widget Jornada (ingreso / salida) */}
      <div className="mb-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-4 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={clsx(
              "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
              jornadaActiva ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" : "bg-surface-100 text-surface-400 dark:bg-surface-700"
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

      {/* Layout principal: tablero + panel lateral */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
        <div>
          {/* Tabs por tablero + búsqueda */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
            <div className="flex gap-1 flex-wrap flex-1">
              {(["TODOS", ...CATEGORIAS_ANUNCIO] as string[]).map((c) => {
                const label = c === "TODOS" ? "Todos" : CATEGORIA_META[c as CategoriaAnuncio].label;
                const count = countsPorCategoria[c] ?? 0;
                if (c !== "TODOS" && count === 0 && !canManage) return null;
                return (
                  <button
                    key={c}
                    onClick={() => setTab(c)}
                    className={clsx(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
                      tab === c
                        ? "bg-surface-800 text-white dark:bg-surface-100 dark:text-surface-900"
                        : "bg-surface-100 dark:bg-surface-700 text-surface-500 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-600"
                    )}
                  >
                    {c !== "TODOS" && <span className={clsx("w-1.5 h-1.5 rounded-full", CATEGORIA_META[c as CategoriaAnuncio].dot)} />}
                    {label}
                    {count > 0 && <span className="opacity-70">{count}</span>}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              placeholder="Buscar anuncios..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full sm:w-52 px-2.5 py-1.5 rounded-md border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-700 text-xs text-surface-700 dark:text-surface-200 placeholder:text-surface-400 focus:outline-none focus:border-surface-400"
            />
          </div>

          {/* Lista */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-5 h-5 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" />
            </div>
          ) : visibles.length === 0 ? (
            <div className="text-center py-14 rounded-xl border border-dashed border-surface-200 dark:border-surface-700">
              <svg className="w-10 h-10 mx-auto mb-2 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
              </svg>
              <p className="text-sm text-surface-400">
                {busqueda.trim() ? "Sin resultados para la búsqueda." : tab !== "TODOS" ? "No hay anuncios en este tablero." : "No hay anuncios todavía."}
              </p>
              {canManage && !busqueda.trim() && (
                <button onClick={openCreate} className="mt-3 text-xs font-medium text-primary-600 hover:text-primary-700">
                  Publicar el primero →
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {fijados.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-400 mb-2">Fijados</p>
                  <div className="space-y-2.5">{fijados.map(renderCard)}</div>
                </div>
              )}
              {resto.length > 0 && (
                <div>
                  {fijados.length > 0 && <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-400 mb-2">Recientes</p>}
                  <div className="space-y-2.5">{resto.map(renderCard)}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Panel lateral */}
        <div className="space-y-4">
          <MisTareasWidget />
        </div>
      </div>

      {/* Modal crear/editar */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Editar anuncio" : "Nuevo anuncio"} maxWidth="max-w-lg">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-surface-500 mb-1">Título *</label>
                <input type="text" value={form.titulo} onChange={(e) => setForm(f => ({ ...f, titulo: e.target.value }))} className="w-full px-2.5 py-1.5 border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md text-xs focus:outline-none focus:border-surface-400" required autoFocus />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-surface-500 mb-1">Contenido *</label>
                <textarea value={form.contenido} onChange={(e) => setForm(f => ({ ...f, contenido: e.target.value }))} rows={4} className="w-full px-2.5 py-1.5 border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md text-xs focus:outline-none focus:border-surface-400 resize-none" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-surface-500 mb-1">Tablero</label>
                  <select value={form.categoria} onChange={(e) => setForm(f => ({ ...f, categoria: e.target.value as CategoriaAnuncio }))} className="w-full px-2.5 py-1.5 border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md text-xs focus:outline-none focus:border-surface-400">
                    {CATEGORIAS_ANUNCIO.map((c) => (
                      <option key={c} value={c}>{CATEGORIA_META[c].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-surface-500 mb-1">Importancia</label>
                  <select value={form.prioridad} onChange={(e) => setForm(f => ({ ...f, prioridad: e.target.value as Prioridad }))} className="w-full px-2.5 py-1.5 border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md text-xs focus:outline-none focus:border-surface-400">
                    <option value="BAJA">Baja</option>
                    <option value="MEDIA">Media</option>
                    <option value="ALTA">Alta</option>
                    <option value="URGENTE">Muy alta (bloqueante)</option>
                  </select>
                </div>
              </div>
              {form.prioridad === "URGENTE" && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                  <strong>Muy alta:</strong> a los destinatarios les aparecerá un popup que <strong>bloquea la app</strong> hasta que toquen &ldquo;Acepto&rdquo;. Vas a poder ver quiénes aceptaron en cada anuncio.
                </div>
              )}
              <div>
                <label className="block text-[11px] font-medium text-surface-500 mb-1">Dirigido a</label>
                <div className="flex items-center gap-3 flex-wrap">
                  {ROLES_DESTINO.map((rol) => (
                    <label key={rol} className="flex items-center gap-1.5 text-xs text-surface-600 dark:text-surface-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.rolesDestino.includes(rol)}
                        onChange={() => toggleRolDestino(rol)}
                        className="rounded"
                      />
                      {ROL_LABEL[rol]}
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-surface-400 mt-1">
                  {form.usuariosDestino.length > 0
                    ? "La selección manual de usuarios (abajo) tiene prioridad sobre los roles."
                    : form.rolesDestino.length === 0 ? "Sin selección: lo ven todos los usuarios." : `Solo lo ven: ${audienciaLabel(form.rolesDestino)}.`}
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-surface-500">Usuarios específicos (opcional)</label>
                  {form.usuariosDestino.length > 0 && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, usuariosDestino: [] }))} className="text-[10px] text-surface-400 hover:text-surface-600">Limpiar ({form.usuariosDestino.length})</button>
                  )}
                </div>
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Buscar usuario por nombre o email..."
                  className="w-full px-2.5 py-1.5 mb-1 border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md text-xs focus:outline-none focus:border-surface-400"
                />
                <div className="max-h-36 overflow-y-auto rounded-md border border-surface-200 dark:border-surface-600 divide-y divide-surface-100 dark:divide-surface-700">
                  {usuarios
                    .filter((u) => !userSearch.trim() || (u.nombre || "").toLowerCase().includes(userSearch.toLowerCase()) || (u.email || "").toLowerCase().includes(userSearch.toLowerCase()))
                    .slice(0, 100)
                    .map((u) => (
                      <label key={u.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-700/50">
                        <input type="checkbox" checked={form.usuariosDestino.includes(u.id)} onChange={() => toggleUsuarioDestino(u.id)} className="rounded shrink-0" />
                        <span className="truncate text-surface-700 dark:text-surface-200">{u.nombre}{u.email ? <span className="text-surface-400"> · {u.email}</span> : null}</span>
                      </label>
                    ))}
                  {usuarios.length === 0 && <p className="px-2.5 py-2 text-[11px] text-surface-400">Cargando usuarios…</p>}
                </div>
                <p className="text-[10px] text-surface-400 mt-1">
                  {form.usuariosDestino.length > 0
                    ? `Solo lo verán los ${form.usuariosDestino.length} usuario(s) seleccionados.`
                    : "Dejalo vacío para usar la audiencia por rol."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-surface-500 mb-1">Programar publicación (opcional)</label>
                  <input type="datetime-local" value={form.fechaPublicacion} onChange={(e) => setForm(f => ({ ...f, fechaPublicacion: e.target.value }))} className="w-full px-2.5 py-1.5 border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md text-xs focus:outline-none focus:border-surface-400" />
                  <p className="text-[10px] text-surface-400 mt-1">Vacío = se publica ahora.</p>
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
                  Notificar
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
                Si activás &ldquo;Notificar&rdquo;, se envía un push inmediato a la audiencia seleccionada y se repite cada {form.intervaloHoras}h hasta que cada uno abra el tablero{form.fechaExpiracion ? " o hasta la fecha de expiración" : ""}.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-md">Cancelar</button>
                <button type="submit" disabled={saving} className="px-3 py-1.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 disabled:opacity-50">
                  {saving ? "Guardando..." : editing ? "Guardar" : "Publicar"}
                </button>
              </div>
            </form>
      </Modal>

      {/* Confirmar eliminación */}
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Eliminar anuncio"
        confirmLabel="Eliminar"
        message={<>¿Eliminar <strong>{confirmDelete?.titulo}</strong>? Esta acción no se puede deshacer.</>}
      />
    </div>
  );
}
