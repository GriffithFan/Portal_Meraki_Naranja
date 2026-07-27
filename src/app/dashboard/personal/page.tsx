"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "@/hooks/useSession";
import { tieneAccesoFichas } from "@/lib/fichasAccess";
import { useConfirm } from "@/contexts/ConfirmContext";
import { fetchJson, mensajeError } from "@/lib/fetchJson";
import Modal from "@/components/ui/Modal";
import { toast } from "sonner";
import { IconPlus, IconTrash, IconX, IconDownload, IconEdit, IconCheck } from "@/components/ui/Icons";

/* eslint-disable @typescript-eslint/no-explicit-any */

type TipoCampo = "text" | "number" | "date";
interface Campo { id: string; label: string; valor: string; tipo: TipoCampo; nota?: string }
interface Seccion { id: string; titulo: string; campos: Campo[] }
interface Proyecto { id: string; nombre: string; orden?: number }
interface Archivo { id: string; seccion: string; nombre: string; ruta: string; tipo: string; size: number; createdAt: string }
interface FichaListItem {
  id: string; tipo: string; nombre: string; fotoUrl: string | null;
  secciones: Seccion[] | null; proyectos: Proyecto[]; updatedAt: string; _count?: { archivos: number };
}
interface Ficha extends FichaListItem { notasGenerales: string | null; archivos: Archivo[] }

const TIPO_LABEL: Record<string, string> = { TECNICO: "Técnico", CONTRATISTA: "Contratista" };

function nid(p = "c") { return `${p}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`; }
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function iniciales(nombre: string) {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}
function archivoUrl(id: string, descargar = false) { return `/api/personal/archivo/${id}${descargar ? "?dl=1" : ""}`; }
function fotoSrc(f: { id: string; updatedAt?: string }) { return `/api/personal/${f.id}/foto?v=${encodeURIComponent(f.updatedAt || "")}`; }
function textoBusqueda(f: FichaListItem) {
  const campos = (f.secciones || []).flatMap((s) => [s.titulo, ...s.campos.flatMap((c) => [c.label, c.valor])]);
  return [f.nombre, ...(f.proyectos || []).map((p) => p.nombre), ...campos].join(" ").toLowerCase();
}

const INPUT_CLS = "w-full bg-surface-50 dark:bg-surface-700/50 border border-transparent rounded-md px-2.5 py-1.5 text-sm text-surface-800 dark:text-surface-100 placeholder:text-surface-300 focus:bg-white dark:focus:bg-surface-700 focus:border-primary-300 focus:ring-2 focus:ring-primary-500/15 focus:outline-none transition-colors";

export default function PersonalPage() {
  const { session, loading: sessionLoading, isAdmin } = useSession();
  const acceso = tieneAccesoFichas(session?.email);
  const confirm = useConfirm();

  const [lista, setLista] = useState<FichaListItem[]>([]);
  const [loadingLista, setLoadingLista] = useState(true);
  const [listaError, setListaError] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [filterProyecto, setFilterProyecto] = useState("todos");

  const [catalogo, setCatalogo] = useState<Proyecto[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("TECNICO");
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [notasGen, setNotasGen] = useState("");
  const [proyectoIds, setProyectoIds] = useState<string[]>([]);
  const [notasAbiertas, setNotasAbiertas] = useState<Set<string>>(new Set());
  const [loadingFicha, setLoadingFicha] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [showNueva, setShowNueva] = useState(false);
  const [nuevaNombre, setNuevaNombre] = useState("");
  const [nuevaTipo, setNuevaTipo] = useState("TECNICO");
  const [creando, setCreando] = useState(false);

  const [showGestor, setShowGestor] = useState(false);
  const [uploadingSeccion, setUploadingSeccion] = useState<string | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [viewer, setViewer] = useState<Archivo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const pendingSeccionRef = useRef<string>("general");

  const cargarLista = useCallback(async () => {
    try {
      const data = await fetchJson<{ fichas: FichaListItem[] }>("/api/personal");
      setLista(data.fichas || []);
      setListaError(false);
    } catch (e) {
      setListaError(true);
      toast.error(mensajeError(e, "No se pudo cargar la lista de personal"));
    } finally {
      setLoadingLista(false);
    }
  }, []);

  const cargarCatalogo = useCallback(async () => {
    try {
      const data = await fetchJson<{ proyectos: Proyecto[] }>("/api/proyectos");
      setCatalogo(data.proyectos || []);
    } catch { /* opcional */ }
  }, []);

  useEffect(() => { if (acceso) { cargarLista(); cargarCatalogo(); } }, [acceso, cargarLista, cargarCatalogo]);

  const aplicarFicha = (data: Ficha) => {
    setFicha(data);
    setNombre(data.nombre || "");
    setTipo(data.tipo || "TECNICO");
    setSecciones(Array.isArray(data.secciones) ? data.secciones : []);
    setNotasGen(data.notasGenerales || "");
    setProyectoIds((data.proyectos || []).map((p) => p.id));
    setNotasAbiertas(new Set());
    setDirty(false);
  };

  const cargarFicha = useCallback(async (id: string) => {
    setLoadingFicha(true);
    try {
      aplicarFicha(await fetchJson<Ficha>(`/api/personal/${id}`));
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo cargar la ficha"));
    } finally {
      setLoadingFicha(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) cargarFicha(selectedId);
    else { setFicha(null); setSecciones([]); setDirty(false); }
  }, [selectedId, cargarFicha]);

  // ── Edición de la estructura dinámica ──
  const marcar = () => setDirty(true);
  const patchCampo = (sId: string, cId: string, patch: Partial<Campo>) => {
    setSecciones((prev) => prev.map((s) => s.id !== sId ? s : { ...s, campos: s.campos.map((c) => c.id !== cId ? c : { ...c, ...patch }) }));
    marcar();
  };
  const patchSeccion = (sId: string, patch: Partial<Seccion>) => {
    setSecciones((prev) => prev.map((s) => s.id !== sId ? s : { ...s, ...patch }));
    marcar();
  };
  const agregarCampo = (sId: string) => {
    setSecciones((prev) => prev.map((s) => s.id !== sId ? s : { ...s, campos: [...s.campos, { id: nid(), label: "", valor: "", tipo: "text", nota: "" }] }));
    marcar();
  };
  const agregarSeccion = () => {
    setSecciones((prev) => [...prev, { id: nid("s"), titulo: "Nueva sección", campos: [{ id: nid(), label: "", valor: "", tipo: "text", nota: "" }] }]);
    marcar();
  };

  const buildPayload = (over?: Partial<{ secciones: Seccion[]; proyectoIds: string[] }>) => ({
    nombre, tipo, notasGenerales: notasGen,
    secciones: over?.secciones ?? secciones,
    proyectoIds: over?.proyectoIds ?? proyectoIds,
  });

  const guardar = useCallback(async (id: string, payload: any) => {
    if (!String(payload.nombre || "").trim()) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      aplicarFicha(await fetchJson<Ficha>(`/api/personal/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      }));
      cargarLista();
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo guardar la ficha"));
    } finally {
      setSaving(false);
    }
  }, [cargarLista]);

  const guardarActual = useCallback(async () => {
    if (!selectedId || !dirty || saving) return;
    await guardar(selectedId, buildPayload());
  }, [selectedId, dirty, saving, guardar, nombre, tipo, secciones, notasGen, proyectoIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const onEnterGuardar = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); guardarActual(); }
  };

  const seleccionar = async (id: string) => {
    if (id === selectedId) return;
    if (dirty && selectedId && !saving) await guardar(selectedId, buildPayload());
    setSelectedId(id);
  };

  const crearFicha = async () => {
    if (!nuevaNombre.trim()) { toast.error("El nombre es obligatorio"); return; }
    setCreando(true);
    try {
      const f = await fetchJson<Ficha>("/api/personal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nuevaNombre.trim(), tipo: nuevaTipo }),
      });
      setShowNueva(false); setNuevaNombre(""); setNuevaTipo("TECNICO");
      await cargarLista();
      setSelectedId(f.id);
      toast.success("Ficha creada");
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo crear la ficha"));
    } finally {
      setCreando(false);
    }
  };

  const eliminarFicha = async () => {
    if (!selectedId || !ficha) return;
    if (!(await confirm({ title: "Eliminar ficha", message: `¿Eliminar la ficha de "${ficha.nombre}"? Se borrarán también su foto y archivos.`, confirmLabel: "Eliminar" }))) return;
    try {
      await fetchJson(`/api/personal/${selectedId}`, { method: "DELETE" });
      setSelectedId(null);
      await cargarLista();
      toast.success("Ficha eliminada");
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo eliminar la ficha"));
    }
  };

  const borrarCampo = async (sId: string, campo: Campo) => {
    if (!selectedId) return;
    if (!(await confirm({ title: "Eliminar campo", message: `¿Eliminar el campo "${campo.label || "(sin nombre)"}" y sus archivos?`, confirmLabel: "Eliminar" }))) return;
    try {
      for (const a of (ficha?.archivos || []).filter((x) => x.seccion === campo.id)) {
        await fetchJson(`/api/personal/archivo/${a.id}`, { method: "DELETE" }).catch(() => {});
      }
      const next = secciones.map((s) => s.id !== sId ? s : { ...s, campos: s.campos.filter((c) => c.id !== campo.id) });
      setSecciones(next);
      await guardar(selectedId, buildPayload({ secciones: next }));
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo eliminar el campo"));
    }
  };

  const borrarSeccion = async (seccion: Seccion) => {
    if (!selectedId) return;
    if (!(await confirm({ title: "Eliminar sección", message: `¿Eliminar la sección "${seccion.titulo || "(sin nombre)"}" con todos sus campos y archivos?`, confirmLabel: "Eliminar" }))) return;
    try {
      const idsCampos = new Set(seccion.campos.map((c) => c.id));
      for (const a of (ficha?.archivos || []).filter((x) => idsCampos.has(x.seccion))) {
        await fetchJson(`/api/personal/archivo/${a.id}`, { method: "DELETE" }).catch(() => {});
      }
      const next = secciones.filter((s) => s.id !== seccion.id);
      setSecciones(next);
      await guardar(selectedId, buildPayload({ secciones: next }));
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo eliminar la sección"));
    }
  };

  // ── Proyectos por persona ──
  const toggleProyecto = (id: string) => {
    setProyectoIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    marcar();
  };

  // ── Foto de perfil ──
  const onFotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedId) return;
    setSubiendoFoto(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await fetchJson(`/api/personal/${selectedId}/foto`, { method: "POST", body: fd });
      await cargarFicha(selectedId);
      cargarLista();
      toast.success("Foto actualizada");
    } catch (err) {
      toast.error(mensajeError(err, "No se pudo subir la foto"));
    } finally {
      setSubiendoFoto(false);
    }
  };
  const quitarFoto = async () => {
    if (!selectedId) return;
    if (!(await confirm({ title: "Quitar foto", message: "¿Quitar la foto de perfil?", confirmLabel: "Quitar" }))) return;
    try {
      await fetchJson(`/api/personal/${selectedId}/foto`, { method: "DELETE" });
      await cargarFicha(selectedId);
      cargarLista();
    } catch (e) { toast.error(mensajeError(e, "No se pudo quitar la foto")); }
  };

  // ── Archivos por campo ──
  const pedirSubida = (seccion: string) => { pendingSeccionRef.current = seccion; fileInputRef.current?.click(); };
  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedId) return;
    const seccion = pendingSeccionRef.current;
    // Si hay cambios sin guardar, guardar primero para que el id del campo exista en la ficha.
    if (dirty) await guardar(selectedId, buildPayload());
    setUploadingSeccion(seccion);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("seccion", seccion);
      await fetchJson(`/api/personal/${selectedId}/archivos`, { method: "POST", body: fd });
      await cargarFicha(selectedId);
      cargarLista();
      toast.success("Archivo subido");
    } catch (err) {
      toast.error(mensajeError(err, "No se pudo subir el archivo"));
    } finally {
      setUploadingSeccion(null);
    }
  };
  const eliminarArchivo = async (archivo: Archivo) => {
    if (!(await confirm({ title: "Eliminar archivo", message: `¿Eliminar "${archivo.nombre}"?`, confirmLabel: "Eliminar" }))) return;
    try {
      await fetchJson(`/api/personal/archivo/${archivo.id}`, { method: "DELETE" });
      if (selectedId) await cargarFicha(selectedId);
      cargarLista();
      if (viewer?.id === archivo.id) setViewer(null);
      toast.success("Archivo eliminado");
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo eliminar el archivo"));
    }
  };

  if (sessionLoading) {
    return <div className="flex justify-center py-20"><div className="w-5 h-5 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" /></div>;
  }
  if (!acceso) {
    return <div className="flex items-center justify-center py-20"><p className="text-sm text-surface-400">No tenés acceso a esta sección.</p></div>;
  }

  const listaFiltrada = lista.filter((f) => {
    if (filterTipo !== "todos" && f.tipo !== filterTipo) return false;
    if (filterProyecto !== "todos" && !(f.proyectos || []).some((p) => p.id === filterProyecto)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return textoBusqueda(f).includes(q);
  });
  const hayFiltros = filterTipo !== "todos" || filterProyecto !== "todos" || search.trim() !== "";
  const archivosDe = (seccion: string) => (ficha?.archivos || []).filter((a) => a.seccion === seccion);

  const renderCampo = (seccion: Seccion, c: Campo) => {
    const archivos = archivosDe(c.id);
    const tieneNota = Boolean((c.nota || "").trim());
    const notaVisible = tieneNota || notasAbiertas.has(c.id);
    return (
      <div key={c.id} className="group/row px-4 py-2.5 hover:bg-surface-50/60 dark:hover:bg-surface-700/20 transition-colors">
        <div className="flex items-start gap-2">
          <input value={c.label} onChange={(e) => patchCampo(seccion.id, c.id, { label: e.target.value })} placeholder="Nombre del campo"
            className="w-28 sm:w-32 shrink-0 mt-1 bg-transparent text-[11px] font-medium uppercase tracking-wide text-surface-500 placeholder:text-surface-300 placeholder:normal-case focus:outline-none focus:text-surface-700 dark:focus:text-surface-200 border-b border-transparent focus:border-surface-300" title="Renombrar campo" />
          <div className="flex-1 min-w-0">
            <input type={c.tipo === "number" ? "number" : c.tipo === "date" ? "date" : "text"} value={c.valor}
              onChange={(e) => patchCampo(seccion.id, c.id, { valor: e.target.value })} onKeyDown={onEnterGuardar} placeholder={c.label || "Valor"} className={INPUT_CLS} />
          </div>
          <div className="flex items-center gap-0.5 pt-1 shrink-0">
            <select value={c.tipo} onChange={(e) => patchCampo(seccion.id, c.id, { tipo: e.target.value as TipoCampo })} title="Tipo de campo"
              className="text-[10px] text-surface-400 bg-transparent focus:outline-none cursor-pointer rounded opacity-0 group-hover/row:opacity-100 focus:opacity-100">
              <option value="text">Aa</option><option value="number">123</option><option value="date">📅</option>
            </select>
            <button onClick={() => setNotasAbiertas((p) => { const n = new Set(p); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} title={notaVisible ? "Ocultar nota" : "Agregar nota"}
              className={`p-1.5 rounded-md transition-colors ${tieneNota ? "text-amber-500 bg-amber-50 dark:bg-transparent" : "text-surface-300 hover:text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700"}`}>
              <IconEdit className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => pedirSubida(c.id)} disabled={uploadingSeccion === c.id} title="Adjuntar archivo"
              className="p-1.5 rounded-md text-surface-300 hover:text-primary-600 hover:bg-surface-100 dark:hover:bg-surface-700 disabled:opacity-50">
              {uploadingSeccion === c.id ? <span className="block w-3.5 h-3.5 border-2 border-surface-300 border-t-primary-500 rounded-full animate-spin" /> : <PaperclipIcon />}
            </button>
            <button onClick={() => borrarCampo(seccion.id, c)} title="Eliminar campo" className="p-1.5 rounded-md text-surface-300 hover:text-red-500 hover:bg-surface-100 dark:hover:bg-surface-700">
              <IconTrash className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {notaVisible && (
          <div className="mt-2 pl-0 sm:pl-[8.5rem]">
            <textarea value={c.nota || ""} onChange={(e) => patchCampo(seccion.id, c.id, { nota: e.target.value })} onKeyDown={onEnterGuardar} placeholder="Nota…" rows={2}
              className="w-full px-2.5 py-1.5 text-xs bg-amber-50/50 dark:bg-surface-700/40 border border-amber-100 dark:border-surface-600 rounded-md focus:outline-none focus:border-amber-300 resize-y" />
          </div>
        )}
        {archivos.length > 0 && <div className="mt-2 sm:pl-[8.5rem]"><ArchivosGrid archivos={archivos} onView={setViewer} onDelete={eliminarArchivo} /></div>}
      </div>
    );
  };

  return (
    <div className="animate-fade-in-up">
      <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} accept=".pdf,.zip,.jpg,.jpeg,.png,.webp,.gif,.docx,.doc" />
      <input ref={fotoInputRef} type="file" className="hidden" onChange={onFotoSelected} accept=".jpg,.jpeg,.png,.webp" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 dark:text-surface-100">Personal</h1>
          <p className="text-xs text-surface-400 mt-0.5">Fichas de técnicos y contratistas · {lista.length} registro{lista.length === 1 ? "" : "s"} · acceso restringido.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={() => setShowGestor(true)} className="px-3 py-2 text-xs font-medium rounded-lg border border-surface-200 dark:border-surface-600 text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700 inline-flex items-center gap-1.5">
              Proyectos
            </button>
          )}
          <a href="/api/personal/export?formato=xlsx" className="px-3 py-2 text-xs font-medium rounded-lg border border-surface-200 dark:border-surface-600 text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700 inline-flex items-center gap-1.5">
            <IconDownload className="w-4 h-4 text-emerald-600" /> Excel
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* Lista */}
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 overflow-hidden flex flex-col self-start shadow-sm">
          <div className="p-3 border-b border-surface-100 dark:border-surface-700 space-y-2">
            <button onClick={() => setShowNueva(true)} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 shadow-sm">
              <IconPlus className="w-4 h-4" /> Nueva ficha
            </button>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, dato, proyecto…"
              className="w-full px-2.5 py-1.5 text-xs border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md focus:outline-none focus:border-primary-400" />
            <div className="grid grid-cols-2 gap-2">
              <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} className="px-2 py-1.5 text-xs border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md focus:outline-none focus:border-surface-400">
                <option value="todos">Tipo: todos</option>
                <option value="TECNICO">Técnicos</option>
                <option value="CONTRATISTA">Contratistas</option>
              </select>
              <select value={filterProyecto} onChange={(e) => setFilterProyecto(e.target.value)} className="px-2 py-1.5 text-xs border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md focus:outline-none focus:border-surface-400">
                <option value="todos">Proyecto: todos</option>
                {catalogo.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between text-[11px] text-surface-400 px-0.5">
              <span>{listaFiltrada.length} de {lista.length}</span>
              {hayFiltros && (
                <button onClick={() => { setSearch(""); setFilterTipo("todos"); setFilterProyecto("todos"); }} className="text-primary-600 hover:underline">Limpiar filtros</button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-surface-100 dark:divide-surface-700/50 max-h-[72vh]">
            {loadingLista ? (
              <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" /></div>
            ) : listaError ? (
              <div className="p-4 text-center text-xs text-surface-400">No se pudo cargar. <button onClick={cargarLista} className="text-primary-600 hover:underline">Reintentar</button></div>
            ) : listaFiltrada.length === 0 ? (
              <p className="p-4 text-center text-xs text-surface-400">Sin resultados.</p>
            ) : listaFiltrada.map((f) => (
              <button key={f.id} onClick={() => seleccionar(f.id)}
                className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors ${selectedId === f.id ? "bg-primary-50 dark:bg-surface-700" : "hover:bg-surface-50 dark:hover:bg-surface-700/50"}`}>
                <Avatar ficha={f} size={8} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-surface-800 dark:text-surface-100 truncate">{f.nombre}</span>
                    {f._count?.archivos ? <span className="text-[10px] text-surface-400 shrink-0 inline-flex items-center gap-0.5"><PaperclipIcon className="w-3 h-3" />{f._count.archivos}</span> : null}
                  </span>
                  <span className="block text-[11px] text-surface-400 truncate">{[TIPO_LABEL[f.tipo] || f.tipo, ...(f.proyectos || []).map((p) => p.nombre)].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Detalle */}
        <div>
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-dashed border-surface-200 dark:border-surface-700 text-sm text-surface-400">
              Seleccioná una ficha o creá una nueva.
            </div>
          ) : loadingFicha || !ficha ? (
            <div className="flex justify-center py-20"><div className="w-5 h-5 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" /></div>
          ) : (
            <div className="space-y-3">
              {/* Header de la ficha (sticky) */}
              <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-white/95 dark:bg-surface-800/95 backdrop-blur px-4 py-3 shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative group/foto shrink-0">
                    <Avatar ficha={ficha} size={12} />
                    <button onClick={() => fotoInputRef.current?.click()} disabled={subiendoFoto} title="Cambiar foto"
                      className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 group-hover/foto:opacity-100 transition-opacity text-[9px] font-medium disabled:opacity-100">
                      {subiendoFoto ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : "Foto"}
                    </button>
                  </div>
                  <div className="min-w-0">
                    <input value={nombre} onChange={(e) => { setNombre(e.target.value); marcar(); }} onKeyDown={onEnterGuardar} placeholder="Nombre"
                      className="w-full bg-transparent text-base font-semibold text-surface-800 dark:text-surface-100 leading-tight focus:outline-none border-b border-transparent focus:border-surface-300" />
                    <div className="flex items-center gap-2">
                      <select value={tipo} onChange={(e) => { setTipo(e.target.value); marcar(); }}
                        className="mt-0.5 -ml-1 text-[11px] text-surface-500 bg-transparent focus:outline-none cursor-pointer rounded px-1">
                        <option value="TECNICO">Técnico</option>
                        <option value="CONTRATISTA">Contratista</option>
                      </select>
                      {ficha.fotoUrl && <button onClick={quitarFoto} className="mt-0.5 text-[10px] text-surface-300 hover:text-red-500">quitar foto</button>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="hidden sm:flex items-center gap-1 text-[11px] text-surface-400">
                    {saving ? (<><span className="w-3 h-3 border-2 border-surface-300 border-t-primary-500 rounded-full animate-spin" /> Guardando…</>)
                      : dirty ? <span className="text-amber-600">Sin guardar</span>
                      : (<><IconCheck className="w-3.5 h-3.5 text-emerald-500" /> Guardado</>)}
                  </span>
                  <button onClick={eliminarFicha} title="Eliminar ficha" className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-surface-700">
                    <IconTrash className="w-4 h-4" />
                  </button>
                  <button onClick={guardarActual} disabled={saving || !dirty}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-default">
                    Guardar
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-surface-400 px-1 -mt-1">Tip: <b>Enter</b> guarda · <b>Shift+Enter</b> salto de línea en notas · el nombre de cada campo se puede editar directo.</p>

              {/* Proyectos (multi-select desde el catálogo) */}
              <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 shadow-sm overflow-hidden">
                <div className="px-4 py-2 border-b border-surface-100 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-700/30 flex items-center justify-between">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">Proyectos</h2>
                  {isAdmin && <button onClick={() => setShowGestor(true)} className="text-[11px] font-medium text-primary-600 hover:text-primary-700">Gestionar</button>}
                </div>
                <div className="p-3">
                  {catalogo.length === 0 ? (
                    <p className="text-xs text-surface-400">No hay proyectos en el catálogo{isAdmin ? " — creá uno en “Gestionar”." : "."}</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {catalogo.map((p) => {
                        const on = proyectoIds.includes(p.id);
                        return (
                          <button key={p.id} onClick={() => toggleProyecto(p.id)}
                            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${on ? "bg-primary-600 border-primary-600 text-white" : "bg-surface-50 dark:bg-surface-700/50 border-surface-200 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:border-primary-300"}`}>
                            {on ? "✓ " : ""}{p.nombre}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Secciones dinámicas */}
              {secciones.map((seccion) => (
                <div key={seccion.id} className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 shadow-sm overflow-hidden">
                  <div className="px-4 py-2 border-b border-surface-100 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-700/30 flex items-center justify-between gap-2">
                    <input value={seccion.titulo} onChange={(e) => patchSeccion(seccion.id, { titulo: e.target.value })} placeholder="Título de la sección"
                      className="flex-1 min-w-0 bg-transparent text-[11px] font-semibold uppercase tracking-wider text-surface-500 placeholder:text-surface-300 focus:outline-none focus:text-surface-700 dark:focus:text-surface-200 border-b border-transparent focus:border-surface-300" />
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => agregarCampo(seccion.id)} className="text-[11px] font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-0.5"><IconPlus className="w-3.5 h-3.5" /> Campo</button>
                      <button onClick={() => borrarSeccion(seccion)} title="Eliminar sección" className="p-1 rounded text-surface-300 hover:text-red-500"><IconTrash className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  {seccion.campos.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-surface-400">Sin campos. Agregá uno con “+ Campo”.</p>
                  ) : (
                    <div className="divide-y divide-surface-100 dark:divide-surface-700/50">
                      {seccion.campos.map((c) => renderCampo(seccion, c))}
                    </div>
                  )}
                </div>
              ))}

              <button onClick={agregarSeccion} className="w-full py-2 text-xs font-medium rounded-xl border border-dashed border-surface-300 dark:border-surface-600 text-surface-500 hover:border-primary-400 hover:text-primary-600 inline-flex items-center justify-center gap-1.5">
                <IconPlus className="w-4 h-4" /> Agregar sección
              </button>

              {/* Notas generales */}
              <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 shadow-sm overflow-hidden">
                <div className="px-4 py-2 border-b border-surface-100 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-700/30 flex items-center justify-between">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">Notas generales</h2>
                  <button onClick={() => pedirSubida("general")} disabled={uploadingSeccion === "general"} title="Adjuntar archivo"
                    className="p-1 rounded text-surface-300 hover:text-primary-600 disabled:opacity-50">
                    {uploadingSeccion === "general" ? <span className="block w-3.5 h-3.5 border-2 border-surface-300 border-t-primary-500 rounded-full animate-spin" /> : <PaperclipIcon />}
                  </button>
                </div>
                <div className="p-4">
                  <textarea value={notasGen} onChange={(e) => { setNotasGen(e.target.value); marcar(); }} onKeyDown={onEnterGuardar}
                    placeholder="Notas generales… (Shift+Enter para salto de línea)" rows={4} className={INPUT_CLS + " resize-y"} />
                  {archivosDe("general").length > 0 && <div className="mt-2"><ArchivosGrid archivos={archivosDe("general")} onView={setViewer} onDelete={eliminarArchivo} /></div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal nueva ficha */}
      <Modal open={showNueva} onClose={() => setShowNueva(false)} title="Nueva ficha">
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-surface-500">Nombre</span>
            <input autoFocus value={nuevaNombre} onChange={(e) => setNuevaNombre(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") crearFicha(); }} className={INPUT_CLS + " mt-1"} />
          </label>
          <label className="block">
            <span className="text-xs text-surface-500">Tipo</span>
            <select value={nuevaTipo} onChange={(e) => setNuevaTipo(e.target.value)} className={INPUT_CLS + " mt-1"}>
              <option value="TECNICO">Técnico</option>
              <option value="CONTRATISTA">Contratista</option>
            </select>
          </label>
          <p className="text-[11px] text-surface-400">Arranca con las secciones estándar (Datos personales, Documentación, Vehículo). Después podés editarlas libremente.</p>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowNueva(false)} className="px-3 py-1.5 text-xs text-surface-500 hover:text-surface-700">Cancelar</button>
            <button onClick={crearFicha} disabled={creando} className="px-3 py-1.5 text-xs font-semibold rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
              {creando ? "Creando…" : "Crear"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Gestor de proyectos (catálogo global) */}
      <ProyectosManager open={showGestor} onClose={() => setShowGestor(false)} catalogo={catalogo}
        onChange={async () => { await cargarCatalogo(); cargarLista(); }} confirm={confirm} />

      {/* Visor de imágenes */}
      <Modal open={!!viewer} onClose={() => setViewer(null)} title={viewer?.nombre} maxWidth="max-w-3xl">
        {viewer && (
          <div className="space-y-3">
            <div className="flex items-center justify-center bg-surface-900/5 dark:bg-surface-900/40 rounded-lg overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={archivoUrl(viewer.id)} alt={viewer.nombre} className="max-h-[70vh] w-auto object-contain" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-surface-400">{formatSize(viewer.size)}</span>
              <a href={archivoUrl(viewer.id, true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700">
                <IconDownload className="w-4 h-4" /> Descargar
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Avatar({ ficha, size }: { ficha: { id: string; nombre: string; tipo: string; fotoUrl: string | null; updatedAt?: string }; size: number }) {
  const [err, setErr] = useState(false);
  const cls = `shrink-0 rounded-full flex items-center justify-center font-semibold overflow-hidden ${ficha.tipo === "CONTRATISTA" ? "bg-amber-100 text-amber-700" : "bg-primary-100 text-primary-700"}`;
  const style = { width: `${size * 0.25}rem`, height: `${size * 0.25}rem`, fontSize: size >= 12 ? "0.875rem" : "0.6875rem" } as React.CSSProperties;
  if (ficha.fotoUrl && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={fotoSrc(ficha)} alt={ficha.nombre} onError={() => setErr(true)} className={cls + " object-cover"} style={style} />
    );
  }
  return <span className={cls} style={style}>{iniciales(ficha.nombre)}</span>;
}

function ProyectosManager({ open, onClose, catalogo, onChange, confirm }: {
  open: boolean; onClose: () => void; catalogo: Proyecto[]; onChange: () => Promise<void>; confirm: ReturnType<typeof useConfirm>;
}) {
  const [nuevo, setNuevo] = useState("");
  const [creando, setCreando] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState("");

  const crear = async () => {
    const nombre = nuevo.trim();
    if (!nombre) return;
    setCreando(true);
    try {
      await fetchJson("/api/proyectos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre }) });
      setNuevo(""); await onChange();
    } catch (e) { toast.error(mensajeError(e, "No se pudo crear el proyecto")); }
    finally { setCreando(false); }
  };
  const renombrar = async (id: string) => {
    const nombre = editNombre.trim();
    if (!nombre) { setEditId(null); return; }
    try {
      await fetchJson(`/api/proyectos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre }) });
      setEditId(null); await onChange();
    } catch (e) { toast.error(mensajeError(e, "No se pudo renombrar")); }
  };
  const borrar = async (p: Proyecto) => {
    if (!(await confirm({ title: "Eliminar proyecto", message: `¿Eliminar “${p.nombre}” del catálogo? Se quita de todas las fichas que lo tengan.`, confirmLabel: "Eliminar" }))) return;
    try { await fetchJson(`/api/proyectos/${p.id}`, { method: "DELETE" }); await onChange(); }
    catch (e) { toast.error(mensajeError(e, "No se pudo eliminar")); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Proyectos (catálogo general)">
      <div className="space-y-3">
        <p className="text-[11px] text-surface-400">Estos proyectos aparecen como opciones para todas las personas. Cada uno puede tener varios.</p>
        <div className="flex gap-2">
          <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") crear(); }} placeholder="Nuevo proyecto…" className={INPUT_CLS} />
          <button onClick={crear} disabled={creando || !nuevo.trim()} className="px-3 py-1.5 text-xs font-semibold rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 shrink-0">Agregar</button>
        </div>
        <div className="divide-y divide-surface-100 dark:divide-surface-700/50 rounded-md border border-surface-200 dark:border-surface-700 max-h-64 overflow-y-auto">
          {catalogo.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-surface-400">Sin proyectos. Agregá el primero arriba.</p>
          ) : catalogo.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2">
              {editId === p.id ? (
                <input autoFocus value={editNombre} onChange={(e) => setEditNombre(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") renombrar(p.id); if (e.key === "Escape") setEditId(null); }} onBlur={() => renombrar(p.id)} className={INPUT_CLS} />
              ) : (
                <span className="flex-1 text-sm text-surface-700 dark:text-surface-200">{p.nombre}</span>
              )}
              <button onClick={() => { setEditId(p.id); setEditNombre(p.nombre); }} title="Renombrar" className="p-1.5 rounded text-surface-300 hover:text-surface-600"><IconEdit className="w-3.5 h-3.5" /></button>
              <button onClick={() => borrar(p)} title="Eliminar" className="p-1.5 rounded text-surface-300 hover:text-red-500"><IconTrash className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-1"><button onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-surface-600 hover:text-surface-800">Listo</button></div>
      </div>
    </Modal>
  );
}

function PaperclipIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
    </svg>
  );
}

function ArchivosGrid({ archivos, onView, onDelete }: { archivos: Archivo[]; onView: (a: Archivo) => void; onDelete: (a: Archivo) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {archivos.map((a) => {
        const esImagen = a.tipo.startsWith("image/");
        const card = esImagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={archivoUrl(a.id)} alt={a.nombre} className="h-20 w-28 object-cover" />
        ) : (
          <div className="h-20 w-28 flex flex-col items-center justify-center px-2 text-center">
            <span className="text-[10px] font-bold uppercase text-surface-500 tracking-wide">{a.nombre.split(".").pop()}</span>
            <span className="mt-0.5 text-[10px] text-surface-400 truncate w-full">{a.nombre}</span>
            <span className="mt-1 inline-flex items-center gap-0.5 text-[9px] text-primary-600"><IconDownload className="w-3 h-3" /> Descargar</span>
          </div>
        );
        return (
          <div key={a.id} className="group relative rounded-md border border-surface-200 dark:border-surface-700 overflow-hidden bg-surface-50 dark:bg-surface-700/40">
            {esImagen
              ? <button type="button" onClick={() => onView(a)} className="block" title="Ver imagen">{card}</button>
              : <a href={archivoUrl(a.id, true)} className="block" title={`Descargar ${a.nombre}`}>{card}</a>}
            <div className="flex items-center justify-between px-1.5 py-1 text-[10px] text-surface-400 border-t border-surface-200 dark:border-surface-700">
              <span>{formatSize(a.size)}</span>
              <button onClick={() => onDelete(a)} className="text-red-400 hover:text-red-600" title="Eliminar archivo" aria-label="Eliminar archivo">
                <IconX className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
