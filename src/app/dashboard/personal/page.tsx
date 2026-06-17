"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "@/hooks/useSession";
import { tieneAccesoFichas } from "@/lib/fichasAccess";
import { useConfirm } from "@/contexts/ConfirmContext";
import { fetchJson, mensajeError } from "@/lib/fetchJson";
import Modal from "@/components/ui/Modal";
import { toast } from "sonner";
import { IconPlus, IconTrash, IconX } from "@/components/ui/Icons";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Archivo { id: string; seccion: string; nombre: string; ruta: string; tipo: string; size: number; createdAt: string; }
interface FichaListItem { id: string; tipo: string; nombre: string; dni: string | null; telefono: string | null; proyecto: string | null; _count?: { archivos: number }; }
interface Ficha {
  id: string; tipo: string; nombre: string; dni: string | null; direccion: string | null;
  telefono: string | null; carnet: string | null; seguro: string | null; monotributo: string | null;
  autoModelo: string | null; autoPatente: string | null; autoKmts: number | null; autoTarjetaRed: string | null;
  proyecto: string | null; notasGenerales: string | null; notasSecciones: Record<string, string> | null;
  archivos: Archivo[];
}

type Campo = { name: keyof Ficha; label: string; type?: "text" | "number" };
type SeccionDef = { key: string; label: string; campos: Campo[] };

// Apartados de la ficha: cada uno tiene sus campos, notas y archivos.
const SECCIONES: SeccionDef[] = [
  { key: "nombre", label: "Nombre", campos: [{ name: "nombre", label: "Nombre" }] },
  { key: "dni", label: "DNI", campos: [{ name: "dni", label: "DNI" }] },
  { key: "direccion", label: "Dirección", campos: [{ name: "direccion", label: "Dirección" }] },
  { key: "telefono", label: "Teléfono", campos: [{ name: "telefono", label: "Teléfono" }] },
  { key: "carnet", label: "Carnet", campos: [{ name: "carnet", label: "Carnet" }] },
  { key: "seguro", label: "Seguro", campos: [{ name: "seguro", label: "Seguro" }] },
  { key: "monotributo", label: "Monotributo", campos: [{ name: "monotributo", label: "Monotributo" }] },
  {
    key: "auto", label: "Auto", campos: [
      { name: "autoModelo", label: "Modelo" },
      { name: "autoPatente", label: "Patente" },
      { name: "autoKmts", label: "Kilómetros", type: "number" },
      { name: "autoTarjetaRed", label: "Tarjeta en red" },
    ],
  },
  { key: "proyecto", label: "Proyecto", campos: [{ name: "proyecto", label: "Proyecto" }] },
];

const TIPO_LABEL: Record<string, string> = { TECNICO: "Técnico", CONTRATISTA: "Contratista" };

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function PersonalPage() {
  const { session, loading: sessionLoading } = useSession();
  const acceso = tieneAccesoFichas(session?.email);
  const confirm = useConfirm();

  const [lista, setLista] = useState<FichaListItem[]>([]);
  const [loadingLista, setLoadingLista] = useState(true);
  const [listaError, setListaError] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("todos");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [form, setForm] = useState<Partial<Ficha>>({});
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [loadingFicha, setLoadingFicha] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showNueva, setShowNueva] = useState(false);
  const [nuevaNombre, setNuevaNombre] = useState("");
  const [nuevaTipo, setNuevaTipo] = useState("TECNICO");
  const [creando, setCreando] = useState(false);

  const [uploadingSeccion, setUploadingSeccion] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSeccionRef = useRef<string>("general");

  const cargarLista = useCallback(async () => {
    setLoadingLista(true);
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

  const cargarFicha = useCallback(async (id: string) => {
    setLoadingFicha(true);
    try {
      const data = await fetchJson<Ficha>(`/api/personal/${id}`);
      setFicha(data);
      setForm(data);
      setNotas((data.notasSecciones && typeof data.notasSecciones === "object") ? data.notasSecciones : {});
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo cargar la ficha"));
    } finally {
      setLoadingFicha(false);
    }
  }, []);

  useEffect(() => { if (selectedId) cargarFicha(selectedId); else { setFicha(null); setForm({}); setNotas({}); } }, [selectedId, cargarFicha]);

  const setCampo = (name: keyof Ficha, value: string) => setForm((p) => ({ ...p, [name]: value }));
  const setNota = (seccion: string, value: string) => setNotas((p) => ({ ...p, [seccion]: value }));

  const guardar = async () => {
    if (!selectedId) return;
    if (!String(form.nombre || "").trim()) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      const payload = {
        tipo: form.tipo, nombre: form.nombre, dni: form.dni, direccion: form.direccion,
        telefono: form.telefono, carnet: form.carnet, seguro: form.seguro, monotributo: form.monotributo,
        autoModelo: form.autoModelo, autoPatente: form.autoPatente, autoKmts: form.autoKmts,
        autoTarjetaRed: form.autoTarjetaRed, proyecto: form.proyecto, notasGenerales: form.notasGenerales,
        notasSecciones: notas,
      };
      const data = await fetchJson<Ficha>(`/api/personal/${selectedId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      setFicha(data);
      toast.success("Ficha guardada");
      cargarLista();
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo guardar la ficha"));
    } finally {
      setSaving(false);
    }
  };

  const crearFicha = async () => {
    if (!nuevaNombre.trim()) { toast.error("El nombre es obligatorio"); return; }
    setCreando(true);
    try {
      const ficha = await fetchJson<Ficha>("/api/personal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nuevaNombre.trim(), tipo: nuevaTipo }),
      });
      setShowNueva(false);
      setNuevaNombre("");
      setNuevaTipo("TECNICO");
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

  const pedirSubida = (seccion: string) => {
    pendingSeccionRef.current = seccion;
    fileInputRef.current?.click();
  };

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
      toast.success("Archivo eliminado");
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo eliminar el archivo"));
    }
  };

  // ── Sin acceso (fallback de cliente; el candado real está en middleware + API) ──
  if (sessionLoading) {
    return <div className="flex justify-center py-20"><div className="w-5 h-5 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" /></div>;
  }
  if (!acceso) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-surface-400">No tenés acceso a esta sección.</p>
      </div>
    );
  }

  const listaFiltrada = lista.filter((f) => {
    if (filterTipo !== "todos" && f.tipo !== filterTipo) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [f.nombre, f.dni, f.proyecto].some((v) => (v || "").toLowerCase().includes(q));
  });

  const archivosDe = (seccion: string) => (ficha?.archivos || []).filter((a) => a.seccion === seccion);

  return (
    <div className="animate-fade-in-up">
      <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected}
        accept=".pdf,.zip,.jpg,.jpeg,.png,.webp,.gif,.docx,.doc" />

      <div className="mb-4">
        <h1 className="text-xl font-semibold text-surface-800 dark:text-surface-100">Personal</h1>
        <p className="text-xs text-surface-400 mt-0.5">Fichas de técnicos y contratistas. Sección de acceso restringido.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
        {/* Lista */}
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-surface-100 dark:border-surface-700 space-y-2">
            <button onClick={() => setShowNueva(true)} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700">
              <IconPlus className="w-4 h-4" /> Nueva ficha
            </button>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, DNI, proyecto…"
              className="w-full px-2.5 py-1.5 text-xs border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md focus:outline-none focus:border-surface-400" />
            <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md focus:outline-none focus:border-surface-400">
              <option value="todos">Todos</option>
              <option value="TECNICO">Técnicos</option>
              <option value="CONTRATISTA">Contratistas</option>
            </select>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-surface-100 dark:divide-surface-700/50 max-h-[70vh]">
            {loadingLista ? (
              <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" /></div>
            ) : listaError ? (
              <div className="p-4 text-center text-xs text-surface-400">
                No se pudo cargar. <button onClick={cargarLista} className="text-primary-600 hover:underline">Reintentar</button>
              </div>
            ) : listaFiltrada.length === 0 ? (
              <p className="p-4 text-center text-xs text-surface-400">Sin fichas.</p>
            ) : listaFiltrada.map((f) => (
              <button key={f.id} onClick={() => setSelectedId(f.id)}
                className={`w-full text-left px-3 py-2.5 transition-colors ${selectedId === f.id ? "bg-primary-50 dark:bg-surface-700" : "hover:bg-surface-50 dark:hover:bg-surface-700/50"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-surface-800 dark:text-surface-100 truncate">{f.nombre}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-700 text-surface-500 shrink-0">{TIPO_LABEL[f.tipo] || f.tipo}</span>
                </div>
                <div className="text-[11px] text-surface-400 truncate">
                  {[f.dni && `DNI ${f.dni}`, f.proyecto].filter(Boolean).join(" · ") || "—"}
                  {f._count?.archivos ? ` · ${f._count.archivos} archivo${f._count.archivos === 1 ? "" : "s"}` : ""}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detalle */}
        <div>
          {!selectedId ? (
            <div className="flex items-center justify-center h-64 rounded-xl border border-dashed border-surface-200 dark:border-surface-700 text-sm text-surface-400">
              Seleccioná una ficha o creá una nueva.
            </div>
          ) : loadingFicha || !ficha ? (
            <div className="flex justify-center py-20"><div className="w-5 h-5 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" /></div>
          ) : (
            <div className="space-y-3">
              {/* Barra de acciones */}
              <div className="flex items-center justify-between gap-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-2.5">
                <select value={form.tipo || "TECNICO"} onChange={(e) => setCampo("tipo", e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md focus:outline-none focus:border-surface-400">
                  <option value="TECNICO">Técnico</option>
                  <option value="CONTRATISTA">Contratista</option>
                </select>
                <div className="flex items-center gap-2">
                  <button onClick={eliminarFicha} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-surface-700 rounded-md">
                    <IconTrash className="w-3.5 h-3.5" /> Eliminar
                  </button>
                  <button onClick={guardar} disabled={saving} className="px-3 py-1.5 text-xs font-semibold rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
                    {saving ? "Guardando…" : "Guardar cambios"}
                  </button>
                </div>
              </div>

              {/* Apartados */}
              {SECCIONES.map((sec) => {
                const archivos = archivosDe(sec.key);
                return (
                  <div key={sec.key} className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200">{sec.label}</h3>
                      <button onClick={() => pedirSubida(sec.key)} disabled={uploadingSeccion === sec.key}
                        className="text-[11px] text-primary-600 hover:text-primary-700 disabled:opacity-50">
                        {uploadingSeccion === sec.key ? "Subiendo…" : "+ Adjuntar archivo"}
                      </button>
                    </div>

                    <div className={`grid gap-2 ${sec.campos.length > 1 ? "sm:grid-cols-2" : ""}`}>
                      {sec.campos.map((c) => (
                        <label key={c.name as string} className="block">
                          <span className="text-[11px] text-surface-400">{c.label}</span>
                          <input
                            type={c.type === "number" ? "number" : "text"}
                            value={(form[c.name] as any) ?? ""}
                            onChange={(e) => setCampo(c.name, e.target.value)}
                            className="w-full mt-0.5 px-2.5 py-1.5 text-sm border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md focus:outline-none focus:border-surface-400"
                          />
                        </label>
                      ))}
                    </div>

                    <textarea
                      value={notas[sec.key] || ""}
                      onChange={(e) => setNota(sec.key, e.target.value)}
                      placeholder={`Notas de ${sec.label.toLowerCase()}…`}
                      rows={2}
                      className="w-full mt-2 px-2.5 py-1.5 text-xs border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md focus:outline-none focus:border-surface-400 resize-y"
                    />

                    {archivos.length > 0 && <ArchivosGrid archivos={archivos} onDelete={eliminarArchivo} />}
                  </div>
                );
              })}

              {/* Notas generales + archivos generales */}
              <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200">Notas generales</h3>
                  <button onClick={() => pedirSubida("general")} disabled={uploadingSeccion === "general"}
                    className="text-[11px] text-primary-600 hover:text-primary-700 disabled:opacity-50">
                    {uploadingSeccion === "general" ? "Subiendo…" : "+ Adjuntar archivo"}
                  </button>
                </div>
                <textarea
                  value={(form.notasGenerales as any) ?? ""}
                  onChange={(e) => setCampo("notasGenerales", e.target.value)}
                  placeholder="Notas generales del técnico/contratista…"
                  rows={4}
                  className="w-full px-2.5 py-1.5 text-sm border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md focus:outline-none focus:border-surface-400 resize-y"
                />
                {archivosDe("general").length > 0 && <ArchivosGrid archivos={archivosDe("general")} onDelete={eliminarArchivo} />}
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
            <input autoFocus value={nuevaNombre} onChange={(e) => setNuevaNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") crearFicha(); }}
              className="w-full mt-1 px-3 py-2 text-sm border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md focus:outline-none focus:border-surface-400" />
          </label>
          <label className="block">
            <span className="text-xs text-surface-500">Tipo</span>
            <select value={nuevaTipo} onChange={(e) => setNuevaTipo(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md focus:outline-none focus:border-surface-400">
              <option value="TECNICO">Técnico</option>
              <option value="CONTRATISTA">Contratista</option>
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowNueva(false)} className="px-3 py-1.5 text-xs text-surface-500 hover:text-surface-700">Cancelar</button>
            <button onClick={crearFicha} disabled={creando} className="px-3 py-1.5 text-xs font-semibold rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
              {creando ? "Creando…" : "Crear"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ArchivosGrid({ archivos, onDelete }: { archivos: Archivo[]; onDelete: (a: Archivo) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {archivos.map((a) => {
        const url = `/api/personal/archivo/${a.id}`;
        const esImagen = a.tipo.startsWith("image/");
        return (
          <div key={a.id} className="group relative rounded-md border border-surface-200 dark:border-surface-700 overflow-hidden bg-surface-50 dark:bg-surface-700/40">
            <a href={url} target="_blank" rel="noopener noreferrer" className="block" title={a.nombre}>
              {esImagen ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={a.nombre} className="h-20 w-28 object-cover" />
              ) : (
                <div className="h-20 w-28 flex flex-col items-center justify-center px-2 text-center">
                  <span className="text-[10px] font-semibold uppercase text-surface-500">{a.nombre.split(".").pop()}</span>
                  <span className="mt-0.5 text-[10px] text-surface-400 truncate w-full">{a.nombre}</span>
                </div>
              )}
            </a>
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
