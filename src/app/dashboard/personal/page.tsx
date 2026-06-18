"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSession } from "@/hooks/useSession";
import { tieneAccesoFichas } from "@/lib/fichasAccess";
import { useConfirm } from "@/contexts/ConfirmContext";
import { fetchJson, mensajeError } from "@/lib/fetchJson";
import Modal from "@/components/ui/Modal";
import { toast } from "sonner";
import { IconPlus, IconTrash, IconX, IconDownload, IconEdit, IconCheck } from "@/components/ui/Icons";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Archivo { id: string; seccion: string; nombre: string; ruta: string; tipo: string; size: number; createdAt: string; }
interface FichaListItem {
  id: string; tipo: string; nombre: string; dni: string | null; direccion: string | null; telefono: string | null;
  carnet: string | null; seguro: string | null; monotributo: string | null; autoModelo: string | null;
  autoPatente: string | null; autoTarjetaRed: string | null; proyecto: string | null; _count?: { archivos: number };
}
interface Ficha {
  id: string; tipo: string; nombre: string; dni: string | null; direccion: string | null;
  telefono: string | null; carnet: string | null; seguro: string | null; monotributo: string | null;
  autoModelo: string | null; autoPatente: string | null; autoKmts: number | null; autoTarjetaRed: string | null;
  proyecto: string | null; notasGenerales: string | null; notasSecciones: Record<string, string> | null;
  camposExtra: Record<string, string> | null; archivos: Archivo[];
}

type Campo = { name: keyof Ficha; label: string; type?: "text" | "number" };
type SeccionDef = { key: string; label: string; campos: Campo[] };

const SECCIONES: SeccionDef[] = [
  { key: "nombre", label: "Nombre", campos: [{ name: "nombre", label: "Nombre" }] },
  { key: "dni", label: "DNI", campos: [{ name: "dni", label: "DNI" }] },
  { key: "direccion", label: "Dirección", campos: [{ name: "direccion", label: "Dirección" }] },
  { key: "telefono", label: "Teléfono", campos: [{ name: "telefono", label: "Teléfono" }] },
  { key: "carnet", label: "Carnet", campos: [{ name: "carnet", label: "Carnet" }] },
  { key: "seguro", label: "Seguro", campos: [{ name: "seguro", label: "Seguro" }] },
  { key: "monotributo", label: "Monotributo", campos: [{ name: "monotributo", label: "Monotributo" }] },
  {
    key: "auto", label: "Vehículo", campos: [
      { name: "autoModelo", label: "Modelo" },
      { name: "autoPatente", label: "Patente" },
      { name: "autoKmts", label: "Kilómetros", type: "number" },
      { name: "autoTarjetaRed", label: "Tarjeta en red" },
    ],
  },
  { key: "proyecto", label: "Proyecto", campos: [{ name: "proyecto", label: "Proyecto" }] },
];
const SECCION_POR_CLAVE = Object.fromEntries(SECCIONES.map((s) => [s.key, s]));

const GRUPOS: { titulo: string; claves: string[] }[] = [
  { titulo: "Datos personales", claves: ["nombre", "dni", "direccion", "telefono"] },
  { titulo: "Documentación", claves: ["carnet", "seguro", "monotributo"] },
  { titulo: "Vehículo", claves: ["auto"] },
  { titulo: "Asignación", claves: ["proyecto"] },
];

const CLAVES_RESERVADAS = new Set([...SECCIONES.map((s) => s.key), "general"]);
const TIPO_LABEL: Record<string, string> = { TECNICO: "Técnico", CONTRATISTA: "Contratista" };
const SEARCH_FIELDS: (keyof FichaListItem)[] = [
  "nombre", "dni", "direccion", "telefono", "carnet", "seguro", "monotributo", "autoModelo", "autoPatente", "autoTarjetaRed", "proyecto",
];
const DOC_FILTROS: { value: string; label: string }[] = [
  { value: "todos", label: "Documentación: todas" },
  { value: "sin-carnet", label: "Sin carnet" },
  { value: "sin-seguro", label: "Sin seguro" },
  { value: "sin-monotributo", label: "Sin monotributo" },
  { value: "sin-auto", label: "Sin vehículo" },
  { value: "con-auto", label: "Con vehículo" },
  { value: "con-adjuntos", label: "Con adjuntos" },
  { value: "sin-adjuntos", label: "Sin adjuntos" },
  { value: "sin-proyecto", label: "Sin proyecto" },
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function iniciales(nombre: string) {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}
function archivoUrl(id: string, descargar = false) {
  return `/api/personal/archivo/${id}${descargar ? "?dl=1" : ""}`;
}

const INPUT_CLS = "w-full bg-surface-50 dark:bg-surface-700/50 border border-transparent rounded-md px-2.5 py-1.5 text-sm text-surface-800 dark:text-surface-100 placeholder:text-surface-300 focus:bg-white dark:focus:bg-surface-700 focus:border-primary-300 focus:ring-2 focus:ring-primary-500/15 focus:outline-none transition-colors";

export default function PersonalPage() {
  const { session, loading: sessionLoading } = useSession();
  const acceso = tieneAccesoFichas(session?.email);
  const confirm = useConfirm();

  const [lista, setLista] = useState<FichaListItem[]>([]);
  const [loadingLista, setLoadingLista] = useState(true);
  const [listaError, setListaError] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [filterProyecto, setFilterProyecto] = useState("todos");
  const [filterDoc, setFilterDoc] = useState("todos");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [form, setForm] = useState<Partial<Ficha>>({});
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [notasAbiertas, setNotasAbiertas] = useState<Set<string>>(new Set());
  const [loadingFicha, setLoadingFicha] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [showNueva, setShowNueva] = useState(false);
  const [nuevaNombre, setNuevaNombre] = useState("");
  const [nuevaTipo, setNuevaTipo] = useState("TECNICO");
  const [creando, setCreando] = useState(false);

  const [showCampo, setShowCampo] = useState(false);
  const [nuevoCampo, setNuevoCampo] = useState("");

  const [uploadingSeccion, setUploadingSeccion] = useState<string | null>(null);
  const [viewer, setViewer] = useState<Archivo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSeccionRef = useRef<string>("general");

  const closeNueva = useCallback(() => setShowNueva(false), []);
  const closeCampo = useCallback(() => setShowCampo(false), []);
  const closeViewer = useCallback(() => setViewer(null), []);

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

  useEffect(() => { if (acceso) cargarLista(); }, [acceso, cargarLista]);

  const aplicarFicha = (data: Ficha) => {
    setFicha(data);
    setForm(data);
    setNotas(data.notasSecciones && typeof data.notasSecciones === "object" ? data.notasSecciones : {});
    setCampos(data.camposExtra && typeof data.camposExtra === "object" ? data.camposExtra : {});
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
    else { setFicha(null); setForm({}); setNotas({}); setCampos({}); setDirty(false); }
  }, [selectedId, cargarFicha]);

  const setCampoForm = (name: keyof Ficha, value: string) => { setForm((p) => ({ ...p, [name]: value })); setDirty(true); };
  const setNota = (seccion: string, value: string) => { setNotas((p) => ({ ...p, [seccion]: value })); setDirty(true); };
  const setValorExtra = (key: string, value: string) => { setCampos((p) => ({ ...p, [key]: value })); setDirty(true); };
  const toggleNota = (key: string) => setNotasAbiertas((p) => {
    const n = new Set(p); if (n.has(key)) n.delete(key); else n.add(key); return n;
  });

  const buildPayload = (overrides?: { campos?: Record<string, string>; notas?: Record<string, string> }) => ({
    tipo: form.tipo, nombre: form.nombre, dni: form.dni, direccion: form.direccion,
    telefono: form.telefono, carnet: form.carnet, seguro: form.seguro, monotributo: form.monotributo,
    autoModelo: form.autoModelo, autoPatente: form.autoPatente, autoKmts: form.autoKmts,
    autoTarjetaRed: form.autoTarjetaRed, proyecto: form.proyecto, notasGenerales: form.notasGenerales,
    notasSecciones: overrides?.notas ?? notas, camposExtra: overrides?.campos ?? campos,
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
  }, [selectedId, dirty, saving, guardar, form, notas, campos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guardar al presionar ENTER (SHIFT+ENTER = salto de línea en notas).
  const onEnterGuardar = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      guardarActual();
    }
  };

  // Al cambiar de ficha, guardar lo pendiente para no perder cambios.
  const seleccionar = async (id: string) => {
    if (id === selectedId) return;
    if (dirty && selectedId && !saving) await guardar(selectedId, buildPayload());
    setSelectedId(id);
  };

  const crearFicha = async () => {
    if (!nuevaNombre.trim()) { toast.error("El nombre es obligatorio"); return; }
    setCreando(true);
    try {
      const ficha = await fetchJson<Ficha>("/api/personal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nuevaNombre.trim(), tipo: nuevaTipo }),
      });
      setShowNueva(false); setNuevaNombre(""); setNuevaTipo("TECNICO");
      await cargarLista();
      setSelectedId(ficha.id);
      toast.success("Ficha creada");
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo crear la ficha"));
    } finally {
      setCreando(false);
    }
  };

  const eliminarFicha = async () => {
    if (!selectedId || !ficha) return;
    if (!(await confirm({ title: "Eliminar ficha", message: `¿Eliminar la ficha de "${ficha.nombre}"? Se borrarán también sus archivos.`, confirmLabel: "Eliminar" }))) return;
    try {
      await fetchJson(`/api/personal/${selectedId}`, { method: "DELETE" });
      setSelectedId(null);
      await cargarLista();
      toast.success("Ficha eliminada");
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo eliminar la ficha"));
    }
  };

  // ── Campos personalizados ──
  const agregarCampo = async () => {
    const nombre = nuevoCampo.trim().slice(0, 60);
    if (!nombre || !selectedId) return;
    const clave = nombre.toLowerCase();
    if (CLAVES_RESERVADAS.has(clave) || Object.keys(campos).some((k) => k.toLowerCase() === clave)) {
      toast.error("Ya existe un campo con ese nombre"); return;
    }
    const next = { ...campos, [nombre]: "" };
    setShowCampo(false); setNuevoCampo("");
    await guardar(selectedId, buildPayload({ campos: next }));
  };

  const eliminarCampo = async (key: string) => {
    if (!selectedId) return;
    if (!(await confirm({ title: "Eliminar campo", message: `¿Eliminar el campo "${key}" y sus archivos?`, confirmLabel: "Eliminar" }))) return;
    try {
      for (const a of (ficha?.archivos || []).filter((x) => x.seccion === key)) {
        await fetchJson(`/api/personal/archivo/${a.id}`, { method: "DELETE" }).catch(() => {});
      }
      const nextCampos = { ...campos }; delete nextCampos[key];
      const nextNotas = { ...notas }; delete nextNotas[key];
      await guardar(selectedId, buildPayload({ campos: nextCampos, notas: nextNotas }));
      toast.success("Campo eliminado");
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo eliminar el campo"));
    }
  };

  // ── Archivos ──
  const pedirSubida = (seccion: string) => { pendingSeccionRef.current = seccion; fileInputRef.current?.click(); };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedId) return;
    const seccion = pendingSeccionRef.current;
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

  const proyectos = useMemo(
    () => Array.from(new Set(lista.map((f) => (f.proyecto || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es")),
    [lista]
  );

  if (sessionLoading) {
    return <div className="flex justify-center py-20"><div className="w-5 h-5 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" /></div>;
  }
  if (!acceso) {
    return <div className="flex items-center justify-center py-20"><p className="text-sm text-surface-400">No tenés acceso a esta sección.</p></div>;
  }

  const cumpleDoc = (f: FichaListItem) => {
    switch (filterDoc) {
      case "sin-carnet": return !f.carnet?.trim();
      case "sin-seguro": return !f.seguro?.trim();
      case "sin-monotributo": return !f.monotributo?.trim();
      case "sin-auto": return !f.autoModelo?.trim() && !f.autoPatente?.trim();
      case "con-auto": return Boolean(f.autoModelo?.trim() || f.autoPatente?.trim());
      case "con-adjuntos": return (f._count?.archivos || 0) > 0;
      case "sin-adjuntos": return (f._count?.archivos || 0) === 0;
      case "sin-proyecto": return !f.proyecto?.trim();
      default: return true;
    }
  };

  const listaFiltrada = lista.filter((f) => {
    if (filterTipo !== "todos" && f.tipo !== filterTipo) return false;
    if (filterProyecto !== "todos" && (f.proyecto || "").trim() !== filterProyecto) return false;
    if (!cumpleDoc(f)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return SEARCH_FIELDS.some((k) => String(f[k] || "").toLowerCase().includes(q));
  });

  const hayFiltros = filterTipo !== "todos" || filterProyecto !== "todos" || filterDoc !== "todos" || search.trim() !== "";
  const archivosDe = (seccion: string) => (ficha?.archivos || []).filter((a) => a.seccion === seccion);

  // Render de una fila de campo dentro de una tarjeta de grupo.
  const renderCampoRow = (key: string, label: string, opts: { custom?: boolean; campos?: Campo[] }) => {
    const archivos = archivosDe(key);
    const tieneNota = Boolean((notas[key] || "").trim());
    const notaVisible = tieneNota || notasAbiertas.has(key);
    const multi = (opts.campos?.length || 1) > 1;
    return (
      <div key={key} className="group/row px-4 py-2.5 hover:bg-surface-50/60 dark:hover:bg-surface-700/20 transition-colors">
        <div className="flex items-start gap-3">
          <span className="w-24 shrink-0 pt-2 text-[11px] font-medium uppercase tracking-wide text-surface-400">{label}</span>
          <div className="flex-1 min-w-0">
            {opts.custom ? (
              <input type="text" value={campos[key] ?? ""} onChange={(e) => setValorExtra(key, e.target.value)} onKeyDown={onEnterGuardar} placeholder={label} className={INPUT_CLS} />
            ) : multi ? (
              <div className="grid grid-cols-2 gap-2">
                {(opts.campos || []).map((c) => (
                  <input key={c.name as string} type={c.type === "number" ? "number" : "text"} value={(form[c.name] as any) ?? ""}
                    onChange={(e) => setCampoForm(c.name, e.target.value)} onKeyDown={onEnterGuardar} placeholder={c.label} className={INPUT_CLS} />
                ))}
              </div>
            ) : (
              <input type={(opts.campos?.[0]?.type) === "number" ? "number" : "text"} value={(form[opts.campos![0].name] as any) ?? ""}
                onChange={(e) => setCampoForm(opts.campos![0].name, e.target.value)} onKeyDown={onEnterGuardar} className={INPUT_CLS} />
            )}
          </div>
          <div className="flex items-center gap-0.5 pt-1 shrink-0">
            <button onClick={() => toggleNota(key)} title={notaVisible ? "Ocultar nota" : "Agregar nota"}
              className={`p-1.5 rounded-md transition-colors ${tieneNota ? "text-amber-500 bg-amber-50 dark:bg-transparent" : "text-surface-300 hover:text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700"}`}>
              <IconEdit className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => pedirSubida(key)} disabled={uploadingSeccion === key} title="Adjuntar archivo"
              className="p-1.5 rounded-md text-surface-300 hover:text-primary-600 hover:bg-surface-100 dark:hover:bg-surface-700 disabled:opacity-50">
              {uploadingSeccion === key ? <span className="block w-3.5 h-3.5 border-2 border-surface-300 border-t-primary-500 rounded-full animate-spin" /> : <PaperclipIcon />}
            </button>
            {opts.custom && (
              <button onClick={() => eliminarCampo(key)} title="Eliminar campo" className="p-1.5 rounded-md text-surface-300 hover:text-red-500 hover:bg-surface-100 dark:hover:bg-surface-700">
                <IconTrash className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        {notaVisible && (
          <div className="mt-2 pl-0 sm:pl-[6.75rem]">
            <textarea value={notas[key] || ""} onChange={(e) => setNota(key, e.target.value)} onKeyDown={onEnterGuardar} placeholder={`Nota de ${label.toLowerCase()}…`} rows={2}
              className="w-full px-2.5 py-1.5 text-xs bg-amber-50/50 dark:bg-surface-700/40 border border-amber-100 dark:border-surface-600 rounded-md focus:outline-none focus:border-amber-300 resize-y" />
          </div>
        )}
        {archivos.length > 0 && <div className="mt-2 sm:pl-[6.75rem]"><ArchivosGrid archivos={archivos} onView={setViewer} onDelete={eliminarArchivo} /></div>}
      </div>
    );
  };

  return (
    <div className="animate-fade-in-up">
      <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected}
        accept=".pdf,.zip,.jpg,.jpeg,.png,.webp,.gif,.docx,.doc" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 dark:text-surface-100">Personal</h1>
          <p className="text-xs text-surface-400 mt-0.5">Fichas de técnicos y contratistas · {lista.length} registro{lista.length === 1 ? "" : "s"} · acceso restringido.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/personal/export?formato=xlsx" className="px-3 py-2 text-xs font-medium rounded-lg border border-surface-200 dark:border-surface-600 text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700 inline-flex items-center gap-1.5">
            <IconDownload className="w-4 h-4 text-emerald-600" /> Excel
          </a>
          <a href="/api/personal/export?formato=csv" className="px-3 py-2 text-xs font-medium rounded-lg border border-surface-200 dark:border-surface-600 text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700 inline-flex items-center gap-1.5">
            <IconDownload className="w-4 h-4 text-surface-500" /> CSV
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
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, DNI, dirección…"
              className="w-full px-2.5 py-1.5 text-xs border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md focus:outline-none focus:border-primary-400" />
            <div className="grid grid-cols-2 gap-2">
              <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} className="px-2 py-1.5 text-xs border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md focus:outline-none focus:border-surface-400">
                <option value="todos">Tipo: todos</option>
                <option value="TECNICO">Técnicos</option>
                <option value="CONTRATISTA">Contratistas</option>
              </select>
              <select value={filterProyecto} onChange={(e) => setFilterProyecto(e.target.value)} className="px-2 py-1.5 text-xs border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md focus:outline-none focus:border-surface-400">
                <option value="todos">Proyecto: todos</option>
                {proyectos.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <select value={filterDoc} onChange={(e) => setFilterDoc(e.target.value)} className="w-full px-2 py-1.5 text-xs border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md focus:outline-none focus:border-surface-400">
              {DOC_FILTROS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div className="flex items-center justify-between text-[11px] text-surface-400 px-0.5">
              <span>{listaFiltrada.length} de {lista.length}</span>
              {hayFiltros && (
                <button onClick={() => { setSearch(""); setFilterTipo("todos"); setFilterProyecto("todos"); setFilterDoc("todos"); }} className="text-primary-600 hover:underline">Limpiar filtros</button>
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
                <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold ${f.tipo === "CONTRATISTA" ? "bg-amber-100 text-amber-700" : "bg-primary-100 text-primary-700"}`}>
                  {iniciales(f.nombre)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-surface-800 dark:text-surface-100 truncate">{f.nombre}</span>
                    {f._count?.archivos ? <span className="text-[10px] text-surface-400 shrink-0 inline-flex items-center gap-0.5"><PaperclipIcon className="w-3 h-3" />{f._count.archivos}</span> : null}
                  </span>
                  <span className="block text-[11px] text-surface-400 truncate">{[TIPO_LABEL[f.tipo] || f.tipo, f.dni && `DNI ${f.dni}`, f.proyecto].filter(Boolean).join(" · ")}</span>
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
                  <span className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${form.tipo === "CONTRATISTA" ? "bg-amber-100 text-amber-700" : "bg-primary-100 text-primary-700"}`}>
                    {iniciales(String(form.nombre || ficha.nombre))}
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-surface-800 dark:text-surface-100 truncate leading-tight">{form.nombre || "—"}</p>
                    <select value={form.tipo || "TECNICO"} onChange={(e) => setCampoForm("tipo", e.target.value)} onKeyDown={onEnterGuardar}
                      className="mt-0.5 -ml-1 text-[11px] text-surface-500 bg-transparent focus:outline-none cursor-pointer rounded px-1">
                      <option value="TECNICO">Técnico</option>
                      <option value="CONTRATISTA">Contratista</option>
                    </select>
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

              <p className="text-[11px] text-surface-400 px-1 -mt-1">Tip: <b>Enter</b> guarda · <b>Shift+Enter</b> hace salto de línea en las notas.</p>

              {/* Grupos fijos */}
              {GRUPOS.map((g) => (
                <div key={g.titulo} className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 shadow-sm overflow-hidden">
                  <div className="px-4 py-2 border-b border-surface-100 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-700/30">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">{g.titulo}</h2>
                  </div>
                  <div className="divide-y divide-surface-100 dark:divide-surface-700/50">
                    {g.claves.map((k) => {
                      const sec = SECCION_POR_CLAVE[k];
                      return sec ? renderCampoRow(sec.key, sec.label, { campos: sec.campos }) : null;
                    })}
                  </div>
                </div>
              ))}

              {/* Campos personalizados */}
              <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 shadow-sm overflow-hidden">
                <div className="px-4 py-2 border-b border-surface-100 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-700/30 flex items-center justify-between">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">Campos personalizados</h2>
                  <button onClick={() => setShowCampo(true)} className="text-[11px] font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-0.5">
                    <IconPlus className="w-3.5 h-3.5" /> Agregar
                  </button>
                </div>
                {Object.keys(campos).length === 0 ? (
                  <p className="px-4 py-3 text-xs text-surface-400">Sin campos personalizados. Agregá uno para datos extra (ej: Email, Talle, Grupo sanguíneo).</p>
                ) : (
                  <div className="divide-y divide-surface-100 dark:divide-surface-700/50">
                    {Object.keys(campos).map((key) => renderCampoRow(key, key, { custom: true }))}
                  </div>
                )}
              </div>

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
                  <textarea value={(form.notasGenerales as any) ?? ""} onChange={(e) => setCampoForm("notasGenerales", e.target.value)} onKeyDown={onEnterGuardar}
                    placeholder="Notas generales… (Shift+Enter para salto de línea)" rows={4} className={INPUT_CLS + " resize-y"} />
                  {archivosDe("general").length > 0 && <div className="mt-2"><ArchivosGrid archivos={archivosDe("general")} onView={setViewer} onDelete={eliminarArchivo} /></div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal nueva ficha */}
      <Modal open={showNueva} onClose={closeNueva} title="Nueva ficha">
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
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={closeNueva} className="px-3 py-1.5 text-xs text-surface-500 hover:text-surface-700">Cancelar</button>
            <button onClick={crearFicha} disabled={creando} className="px-3 py-1.5 text-xs font-semibold rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
              {creando ? "Creando…" : "Crear"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal nuevo campo */}
      <Modal open={showCampo} onClose={closeCampo} title="Agregar campo personalizado">
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-surface-500">Nombre del campo (ej: Email, Talle de ropa, Grupo sanguíneo)</span>
            <input autoFocus value={nuevoCampo} onChange={(e) => setNuevoCampo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") agregarCampo(); }} className={INPUT_CLS + " mt-1"} />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={closeCampo} className="px-3 py-1.5 text-xs text-surface-500 hover:text-surface-700">Cancelar</button>
            <button onClick={agregarCampo} className="px-3 py-1.5 text-xs font-semibold rounded-md bg-primary-600 text-white hover:bg-primary-700">Agregar</button>
          </div>
        </div>
      </Modal>

      {/* Visor de imágenes */}
      <Modal open={!!viewer} onClose={closeViewer} title={viewer?.nombre} maxWidth="max-w-3xl">
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
