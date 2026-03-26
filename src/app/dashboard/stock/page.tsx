"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSession } from "@/hooks/useSession";
import { useSearchContext } from "@/contexts/SearchContext";
import { TableSkeleton } from "@/components/ui/Skeletons";
import SectionSettings from "@/components/ui/SectionSettings";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ESTADOS_EQUIPO = ["DISPONIBLE", "INSTALADO", "EN_TRANSITO", "ROTO", "PERDIDO", "EN_REPARACION"];

const ESTADO_COLORS: Record<string, string> = {
  DISPONIBLE: "bg-green-100 text-green-700",
  INSTALADO: "bg-blue-100 text-blue-700",
  EN_TRANSITO: "bg-yellow-100 text-yellow-700",
  ROTO: "bg-red-100 text-red-700",
  PERDIDO: "bg-gray-100 text-gray-600",
  EN_REPARACION: "bg-orange-100 text-orange-700",
};

/* ── Column System ──────────────────────────────────────────── */
interface StockColumn {
  id: string;
  label: string;
  field: string;
  visible: boolean;
  editable: boolean;
  type: "text" | "select" | "number";
  options?: string[];
}

const STORAGE_KEY = "pmn-stock-col-config";

const ETIQUETA_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#1e293b",
];

/* ── Auto-fill por prefijo de serial ── */
const SERIAL_PREFIX_MAP: Record<string, { nombre: string; modelo: string }> = {
  Q2PD: { nombre: "AP", modelo: "MR33" },
  Q3AJ: { nombre: "AP", modelo: "MR36" },
  Q3AL: { nombre: "AP", modelo: "MR44" },
  Q2GW: { nombre: "SWITCH 24P", modelo: "MS225" },
  Q2CX: { nombre: "SWITCH 8P", modelo: "MS120" },
  Q2PN: { nombre: "UTM", modelo: "MX84" },
  Q2YN: { nombre: "UTM", modelo: "MX85" },
  Q2TN: { nombre: "Gateway", modelo: "Z3" },
};

const DEFAULT_COLUMNS: StockColumn[] = [
  { id: "nombre",      label: "Equipo",      field: "nombre",      visible: true,  editable: true,  type: "text" },
  { id: "modelo",      label: "Modelo",      field: "modelo",      visible: true,  editable: true,  type: "text" },
  { id: "numeroSerie", label: "N/S",         field: "numeroSerie", visible: true,  editable: true,  type: "text" },
  { id: "estado",      label: "Estado",       field: "estado",      visible: true,  editable: true,  type: "select", options: ESTADOS_EQUIPO },
  { id: "asignado",    label: "Asignado",     field: "asignadoId",  visible: true,  editable: true,  type: "select" },
  { id: "ubicacion",   label: "Ubicación",    field: "ubicacion",   visible: true,  editable: true,  type: "text" },  { id: "fecha",       label: "Fecha",        field: "fecha",       visible: true,  editable: true,  type: "text" },  { id: "notas",       label: "Notas",        field: "notas",       visible: false, editable: true,  type: "text" },
  { id: "descripcion", label: "Descripción",  field: "descripcion", visible: false, editable: true,  type: "text" },
];

export default function StockPage() {
  const { isModOrAdmin, isAdmin } = useSession();
  const { headerSearch } = useSearchContext();
  const [equipos, setEquipos] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => { if (headerSearch !== undefined) setSearch(headerSearch); }, [headerSearch]);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroCat, setFiltroCat] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ nombre: "", descripcion: "", numeroSerie: "", modelo: "", estado: "DISPONIBLE", ubicacion: "", notas: "", asignadoId: "", fecha: "" });

  /* ── Técnicos (para columna Asignado) ── */
  const [tecnicos, setTecnicos] = useState<{ id: string; nombre: string }[]>([]);
  useEffect(() => {
    fetch("/api/usuarios", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((users: any[]) => setTecnicos(users.map(u => ({ id: u.id, nombre: u.nombre }))))
      .catch(() => {});
  }, []);

  /* ── Etiqueta editing ── */
  const [editingEtiqueta, setEditingEtiqueta] = useState<string | null>(null);
  const [etiquetaForm, setEtiquetaForm] = useState({ texto: "", color: ETIQUETA_COLORS[0] });

  /* ── Column state ── */
  const [columns, setColumns] = useState<StockColumn[]>(DEFAULT_COLUMNS);
  const colConfigLoaded = useRef(false);

  // Load column config from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const config: { id: string; visible: boolean; order: number }[] = JSON.parse(saved);
        const configMap = new Map(config.map((c, i) => [c.id, { visible: c.visible, order: c.order ?? i }]));
        setColumns(prev =>
          [...prev]
            .map(col => ({ ...col, visible: configMap.get(col.id)?.visible ?? col.visible }))
            .sort((a, b) => (configMap.get(a.id)?.order ?? 999) - (configMap.get(b.id)?.order ?? 999))
        );
      }
    } catch { /* ignore corrupt data */ }
    colConfigLoaded.current = true;
  }, []);

  // Persist column config
  useEffect(() => {
    if (!colConfigLoaded.current) return;
    const config = columns.map((c, i) => ({ id: c.id, visible: c.visible, order: i }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [columns]);

  /* ── Sorting ── */
  const [sortConfig, setSortConfig] = useState<{ field: string; dir: "asc" | "desc" } | null>(null);

  function toggleSort(field: string) {
    setSortConfig(prev => {
      if (prev?.field === field) return prev.dir === "asc" ? { field, dir: "desc" } : null;
      return { field, dir: "asc" };
    });
  }

  const sortedEquipos = useMemo(() => {
    if (!sortConfig) return equipos;
    return [...equipos].sort((a, b) => {
      const aVal = a[sortConfig.field] ?? "";
      const bVal = b[sortConfig.field] ?? "";
      const cmp = String(aVal).localeCompare(String(bVal), "es", { numeric: true });
      return sortConfig.dir === "asc" ? cmp : -cmp;
    });
  }, [equipos, sortConfig]);

  /* ── Drag & Drop columns ── */
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const didDragRef = useRef(false);

  function handleColDragStart(e: React.DragEvent, colId: string) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/x-col-id", colId);
    setDragColId(colId);
    didDragRef.current = false;
  }
  function handleColDragOver(e: React.DragEvent, colId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    didDragRef.current = true;
    setDragOverColId(colId);
  }
  function handleColDrop(e: React.DragEvent, colId: string) {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/x-col-id");
    if (!sourceId || sourceId === colId) { setDragColId(null); setDragOverColId(null); return; }
    setColumns(prev => {
      const n = [...prev];
      const srcIdx = n.findIndex(c => c.id === sourceId);
      const [moved] = n.splice(srcIdx, 1);
      const tgtIdx = n.findIndex(c => c.id === colId);
      n.splice(tgtIdx, 0, moved);
      return n;
    });
    setDragColId(null);
    setDragOverColId(null);
  }
  function handleColDragEnd() { setDragColId(null); setDragOverColId(null); }

  /* ── Inline editing ── */
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  function startEdit(equipoId: string, field: string, currentValue: string) {
    if (!isModOrAdmin) return;
    setEditingCell({ id: equipoId, field });
    setEditValue(currentValue || "");
  }

  async function saveEdit() {
    if (!editingCell) return;
    const { id, field } = editingCell;
    const val = field === "cantidad" ? parseInt(editValue) || 1 : editValue.trim();
    setEditingCell(null);

    // Skip if unchanged
    const prev = equipos.find(e => e.id === id);
    if (prev && String(prev[field] ?? "") === String(val)) return;

    // Optimistic update
    setEquipos(es => es.map(e => e.id === id ? { ...e, [field]: val } : e));
    const res = await fetch(`/api/stock/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ [field]: val }),
    });
    if (res.ok) {
      toast.success("Campo actualizado");
    } else {
      setEquipos(es => es.map(e => e.id === id ? { ...e, [field]: prev?.[field] } : e));
      toast.error("Error al actualizar");
    }
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
    if (e.key === "Escape") setEditingCell(null);
  }

  /* ── Data fetching ── */
  const fetchEquipos = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", "5000");
    if (search) params.set("buscar", search);
    if (filtroEstado) params.set("estado", filtroEstado);
    if (filtroCat) params.set("categoria", filtroCat);
    const res = await fetch(`/api/stock?${params}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setEquipos(data.equipos || []);
      setTotal(data.total || 0);
      setCategorias(data.categorias || []);
    }
    setLoading(false);
  }, [search, filtroEstado, filtroCat]);

  useEffect(() => { fetchEquipos(); }, [fetchEquipos]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const nombre = form.nombre.trim();
    if (!nombre) return;
    const res = await fetch("/api/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...form, nombre }),
    });
    if (res.ok) {
      setShowModal(false);
      setForm({ nombre: "", descripcion: "", numeroSerie: "", modelo: "", estado: "DISPONIBLE", ubicacion: "", notas: "", asignadoId: "", fecha: "" });
      toast.success("Equipo creado exitosamente");
      fetchEquipos();
    } else {
      toast.error("Error al crear equipo");
    }
  }

  async function cambiarAsignado(id: string, asignadoId: string) {
    const prev = equipos.find(e => e.id === id);
    const tecnico = tecnicos.find(t => t.id === asignadoId);
    setEquipos(es => es.map(e => e.id === id ? { ...e, asignadoId: asignadoId || null, asignado: tecnico ? { id: tecnico.id, nombre: tecnico.nombre } : null } : e));
    const res = await fetch(`/api/stock/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ asignadoId: asignadoId || "" }),
    });
    if (res.ok) {
      toast.success(asignadoId ? `Asignado a ${tecnico?.nombre}` : "Asignación removida");
    } else {
      if (prev) setEquipos(es => es.map(e => e.id === id ? prev : e));
      toast.error("Error al asignar");
    }
  }

  async function guardarEtiqueta(id: string, overrideTexto?: string) {
    const prev = equipos.find(e => e.id === id);
    const texto = overrideTexto !== undefined ? overrideTexto : etiquetaForm.texto.trim();
    const color = etiquetaForm.color;
    setEquipos(es => es.map(e => e.id === id ? { ...e, etiqueta: texto || null, etiquetaColor: texto ? color : null } : e));
    setEditingEtiqueta(null);
    const res = await fetch(`/api/stock/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ etiqueta: texto || "", etiquetaColor: texto ? color : "" }),
    });
    if (res.ok) {
      toast.success(texto ? "Etiqueta guardada" : "Etiqueta removida");
    } else {
      if (prev) setEquipos(es => es.map(e => e.id === id ? prev : e));
      toast.error("Error al guardar etiqueta");
    }
  }

  async function cambiarEstado(id: string, nuevoEstado: string) {
    const prev = equipos.find(e => e.id === id)?.estado;
    setEquipos(es => es.map(e => e.id === id ? { ...e, estado: nuevoEstado } : e));
    const res = await fetch(`/api/stock/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ estado: nuevoEstado }),
    });
    if (res.ok) {
      toast.success(`Estado cambiado a ${nuevoEstado.replace(/_/g, " ")}`);
    } else {
      setEquipos(es => es.map(e => e.id === id ? { ...e, estado: prev } : e));
      toast.error("Error al cambiar estado");
    }
  }

  const visibleColumns = useMemo(() => columns.filter(c => c.visible), [columns]);

  /* ── Delete equipo ── */
  const [confirmDelete, setConfirmDelete] = useState<{ type: "row"; id: string; nombre: string } | { type: "bulk" } | null>(null);

  async function eliminarEquipo(id: string) {
    const prev = equipos.find(e => e.id === id);
    setEquipos(es => es.filter(e => e.id !== id));
    setTotal(t => t - 1);
    const res = await fetch(`/api/stock/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      toast.success("Equipo eliminado");
    } else {
      if (prev) setEquipos(es => [...es, prev]);
      setTotal(t => t + 1);
      toast.error("Error al eliminar equipo");
    }
    setConfirmDelete(null);
  }

  async function eliminarTodoStock() {
    const res = await fetch("/api/stock", { method: "DELETE", credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setEquipos([]);
      setTotal(0);
      toast.success(`Stock eliminado (${data.count} equipos)`);
    } else {
      toast.error("Error al eliminar stock");
    }
    setConfirmDelete(null);
  }

  async function limpiarCampo(equipoId: string, field: string) {
    const prev = equipos.find(e => e.id === equipoId);
    const val = field === "cantidad" ? 1 : "";
    setEquipos(es => es.map(e => e.id === equipoId ? { ...e, [field]: field === "cantidad" ? 1 : null } : e));
    const res = await fetch(`/api/stock/${equipoId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ [field]: val }),
    });
    if (res.ok) {
      toast.success("Campo limpiado");
    } else {
      if (prev) setEquipos(es => es.map(e => e.id === equipoId ? prev : e));
      toast.error("Error al limpiar campo");
    }
  }

  /* ── Render cell ── */
  function renderCell(eq: any, col: StockColumn) {
    const isEditing = editingCell?.id === eq.id && editingCell?.field === col.field;

    // Estado always uses dropdown for mod/admin
    if (col.id === "estado") {
      if (isModOrAdmin) {
        return (
          <select
            value={eq.estado}
            onChange={(e) => cambiarEstado(eq.id, e.target.value)}
            className={`px-2 py-1 rounded-lg text-xs font-medium border-0 cursor-pointer ${ESTADO_COLORS[eq.estado] || "bg-gray-100 text-gray-600"}`}
          >
            {ESTADOS_EQUIPO.map((e) => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}
          </select>
        );
      }
      return (
        <Badge variant="secondary" className={`${ESTADO_COLORS[eq.estado] || "bg-gray-100 text-gray-600"}`}>
          {eq.estado.replace(/_/g, " ")}
        </Badge>
      );
    }

    // Asignado — dropdown de técnicos
    if (col.id === "asignado") {
      if (isModOrAdmin) {
        return (
          <select
            value={eq.asignadoId || ""}
            onChange={(e) => cambiarAsignado(eq.id, e.target.value)}
            className="px-1.5 py-0.5 rounded text-[11px] border border-surface-200 bg-white focus:outline-none focus:border-primary-400 cursor-pointer max-w-[130px]"
          >
            <option value="">Sin asignar</option>
            {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        );
      }
      return <span className="text-[11px] text-surface-600">{eq.asignado?.nombre || "—"}</span>;
    }

    // Nombre — includes etiqueta badge
    if (col.id === "nombre") {
      const isEditingTag = editingEtiqueta === eq.id;
      return (
        <div className="flex items-center gap-1.5">
          {isEditing ? (
            <input
              autoFocus
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={handleEditKeyDown}
              className="px-1.5 py-0.5 border border-primary-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white font-medium"
            />
          ) : (
            <span
              className={`font-medium text-surface-800 text-[11px] ${isModOrAdmin ? "cursor-pointer hover:bg-primary-50 hover:text-primary-700 px-1 -mx-1 rounded transition-colors" : ""}`}
              onDoubleClick={() => startEdit(eq.id, col.field, eq.nombre || "")}
              title={isModOrAdmin ? "Doble clic para editar" : undefined}
            >
              {eq.nombre || "—"}
            </span>
          )}
          {/* Etiqueta badge */}
          {eq.etiqueta && !isEditingTag && (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium text-white shrink-0 ${isModOrAdmin ? "cursor-pointer" : ""}`}
              style={{ backgroundColor: eq.etiquetaColor || "#6b7280" }}
              onClick={() => {
                if (isModOrAdmin) {
                  setEditingEtiqueta(eq.id);
                  setEtiquetaForm({ texto: eq.etiqueta, color: eq.etiquetaColor || ETIQUETA_COLORS[0] });
                }
              }}
              title={isModOrAdmin ? "Clic para editar etiqueta" : eq.etiqueta}
            >
              {eq.etiqueta}
            </span>
          )}
          {!eq.etiqueta && !isEditingTag && isModOrAdmin && (
            <button
              onClick={() => { setEditingEtiqueta(eq.id); setEtiquetaForm({ texto: "", color: ETIQUETA_COLORS[0] }); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-surface-300 hover:text-primary-500 shrink-0"
              title="Agregar etiqueta"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>
            </button>
          )}
          {isEditingTag && (
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                type="text"
                value={etiquetaForm.texto}
                onChange={(e) => setEtiquetaForm(f => ({ ...f, texto: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") guardarEtiqueta(eq.id); if (e.key === "Escape") setEditingEtiqueta(null); }}
                placeholder="Etiqueta"
                className="w-16 px-1 py-0.5 border border-primary-300 rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white"
                maxLength={30}
              />
              <div className="flex gap-0.5">
                {ETIQUETA_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setEtiquetaForm(f => ({ ...f, color: c }))}
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-transform ${etiquetaForm.color === c ? "border-surface-800 scale-125" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <button onClick={() => guardarEtiqueta(eq.id)} className="text-green-600 hover:text-green-700 p-0.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </button>
              <button onClick={() => setEditingEtiqueta(null)} className="text-surface-400 hover:text-surface-600 p-0.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              {eq.etiqueta && (
                <button onClick={() => guardarEtiqueta(eq.id, "")} className="text-red-400 hover:text-red-600 p-0.5" title="Quitar etiqueta">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                  </button>
              )}
            </div>
          )}
        </div>
      );
    }

    // Inline editing input
    if (isEditing) {
      return (
        <div className="flex items-center gap-0.5">
          <input
            autoFocus
            type={col.type === "number" ? "number" : "text"}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={handleEditKeyDown}
            className="w-full px-1.5 py-0.5 border border-primary-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white"
            min={col.type === "number" ? 1 : undefined}
          />
          <button
            onMouseDown={(e) => { e.preventDefault(); setEditingCell(null); limpiarCampo(eq.id, col.field); }}
            className="shrink-0 p-0.5 rounded hover:bg-red-50 text-surface-300 hover:text-red-500"
            title="Limpiar campo"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      );
    }

    // Display value — double click to edit
    const val = eq[col.field];
    const display = col.id === "ubicacion" ? (val || eq.predio?.nombre || "—") : (val ?? "—");
    return (
      <span
        className={`${isModOrAdmin && col.editable ? "cursor-pointer hover:bg-primary-50 hover:text-primary-700 px-1 -mx-1 rounded transition-colors" : ""} ${col.id === "numeroSerie" ? "font-mono text-[10px]" : "text-[11px]"} text-surface-600`}
        onDoubleClick={() => col.editable && startEdit(eq.id, col.field, String(val ?? ""))}
        title={isModOrAdmin && col.editable ? "Doble clic para editar" : undefined}
      >
        {display || "—"}
      </span>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800">Stock</h1>
          <p className="text-xs text-surface-400">Inventario de equipos · {total} registros</p>
        </div>
        <div className="flex items-center gap-1.5">
          <SectionSettings seccion="stock">
            {/* Column visibility toggles */}
            <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Columnas visibles</p>
            {columns.map(col => (
              <label key={col.id} className="flex items-center gap-2 text-xs text-surface-600 cursor-pointer py-0.5">
                <input
                  type="checkbox"
                  checked={col.visible}
                  onChange={() => setColumns(prev => prev.map(c => c.id === col.id ? { ...c, visible: !c.visible } : c))}
                  className="rounded border-surface-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                />
                {col.label}
              </label>
            ))}
            <hr className="border-surface-100 my-2" />
            <button
              onClick={() => setColumns(DEFAULT_COLUMNS)}
              className="text-[10px] text-primary-600 hover:text-primary-700 font-medium"
            >
              Restablecer columnas
            </button>
            {isAdmin && equipos.length > 0 && (
              <>
                <hr className="border-surface-100 my-2" />
                <button
                  onClick={() => setConfirmDelete({ type: "bulk" })}
                  className="text-[10px] text-red-500 hover:text-red-600 font-medium"
                >
                  Eliminar todo el stock ({total})
                </button>
              </>
            )}
          </SectionSettings>
          {isModOrAdmin && (
            <button onClick={() => setShowModal(true)} className="px-3 py-1.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 transition-colors flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Agregar equipo
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar equipo..." className="flex-1 min-w-0 px-3 py-2 sm:py-1.5 border border-surface-200 rounded-lg sm:rounded-md text-sm sm:text-xs focus:outline-none focus:border-surface-400" />
        <div className="flex gap-2">
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 border border-surface-200 rounded-lg sm:rounded-md text-sm sm:text-xs focus:outline-none focus:border-surface-400">
          <option value="">Todos los estados</option>
          {ESTADOS_EQUIPO.map((e) => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}
        </select>
        {categorias.length > 0 && (
          <select value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)} className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 border border-surface-200 rounded-lg sm:rounded-md text-sm sm:text-xs focus:outline-none focus:border-surface-400">
            <option value="">Todas las categorías</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        </div>
      </div>

      {isModOrAdmin && (
        <p className="text-[10px] text-surface-400 mb-2 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
          Arrastra cabeceras para reordenar · Doble clic para editar · ✕ para limpiar campo
        </p>
      )}

      {/* Tabla */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
        {loading ? (
          <TableSkeleton rows={6} cols={visibleColumns.length || 6} />
        ) : equipos.length === 0 ? (
          <div className="text-center py-16 text-surface-400">
            <svg className="w-10 h-10 mx-auto mb-3 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
            <p className="text-sm font-medium mb-1">Sin equipos</p>
            <p className="text-xs mb-4">{search || filtroEstado ? "No se encontraron resultados" : "Agrega tu primer equipo al inventario"}</p>
            {!search && !filtroEstado && isModOrAdmin && (
              <Link
                href="/dashboard/importar"
                className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-surface-300 rounded-lg text-xs text-surface-500 hover:border-surface-400 hover:text-surface-600 hover:bg-surface-50 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                Importar desde Excel
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-surface-200">
              <tr>
                {visibleColumns.map(col => (
                  <th
                    key={col.id}
                    draggable={isModOrAdmin}
                    onDragStart={(e) => handleColDragStart(e, col.id)}
                    onDragOver={(e) => handleColDragOver(e, col.id)}
                    onDrop={(e) => handleColDrop(e, col.id)}
                    onDragEnd={handleColDragEnd}
                    onClick={() => { if (!didDragRef.current) toggleSort(col.field); didDragRef.current = false; }}
                    className={`text-left px-2.5 py-2 uppercase text-[10px] tracking-wider font-medium select-none transition-all ${
                      isModOrAdmin ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                    } ${dragColId === col.id ? "opacity-40" : ""} ${
                      dragOverColId === col.id && dragColId !== col.id ? "border-l-2 border-primary-400" : ""
                    } ${sortConfig?.field === col.field ? "text-primary-600" : "text-surface-400"}`}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {sortConfig?.field === col.field && (
                        <span className="text-[9px]">{sortConfig.dir === "asc" ? "▲" : "▼"}</span>
                      )}
                    </span>
                  </th>
                ))}
                {isAdmin && <th className="w-8 px-1.5 py-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {sortedEquipos.map((eq) => (
                <tr key={eq.id} className="hover:bg-surface-50 transition-colors row-animate group">
                  {visibleColumns.map(col => (
                    <td key={col.id} className="px-2.5 py-1.5">
                      {renderCell(eq, col)}
                    </td>
                  ))}
                  {isAdmin && (
                    <td className="px-1.5 py-1.5">
                      <button
                        onClick={() => setConfirmDelete({ type: "row", id: eq.id, nombre: eq.nombre })}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 text-surface-300 hover:text-red-500"
                        title="Eliminar equipo"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
      </Card>

      {/* Modal crear equipo */}
      <AnimatePresence>
      {showModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
        >
          <motion.form
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={handleCreate}
            className="bg-white rounded-t-2xl sm:rounded-lg shadow-xl p-5 sm:p-6 w-full sm:max-w-lg sm:mx-4 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-base font-semibold text-surface-800 mb-4">Agregar Equipo</h2>
            <div className="space-y-3">
              <div>
                <input value={form.numeroSerie} onChange={(e) => {
                  const val = e.target.value;
                  const prefix = val.slice(0, 4).toUpperCase();
                  const match = prefix.length === 4 ? SERIAL_PREFIX_MAP[prefix] : null;
                  setForm(f => ({
                    ...f,
                    numeroSerie: val,
                    ...(match ? { nombre: match.nombre, modelo: match.modelo } : {}),
                  }));
                }} placeholder="Número de serie" className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
                {form.numeroSerie.length >= 4 && SERIAL_PREFIX_MAP[form.numeroSerie.slice(0, 4).toUpperCase()] && (
                  <p className="text-[10px] text-green-600 mt-0.5 ml-1">Auto-completado: {SERIAL_PREFIX_MAP[form.numeroSerie.slice(0, 4).toUpperCase()].nombre} · {SERIAL_PREFIX_MAP[form.numeroSerie.slice(0, 4).toUpperCase()].modelo}</p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre *" className="px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
                <input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} placeholder="Modelo" className="px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} className="px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400">
                  {ESTADOS_EQUIPO.map((e) => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}
                </select>
                <select value={form.asignadoId} onChange={(e) => setForm({ ...form, asignadoId: e.target.value })} className="px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400">
                  <option value="">Sin asignar</option>
                  {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} placeholder="Ubicación" className="px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
                <input value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} placeholder="Fecha" className="px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              </div>
              <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Notas" rows={2} className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 sm:py-2 text-sm sm:text-xs text-surface-600 hover:bg-surface-100 rounded-md">Cancelar</button>
              <button type="submit" className="px-4 py-2.5 sm:py-2 text-sm sm:text-xs bg-surface-800 text-white rounded-md hover:bg-surface-700 font-medium">Crear</button>
            </div>
          </motion.form>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Modal confirmar eliminación */}
      <AnimatePresence>
      {confirmDelete && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-lg shadow-xl p-5 w-full max-w-sm mx-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              </div>
              <h3 className="text-sm font-semibold text-surface-800">
                {confirmDelete.type === "bulk" ? "Eliminar todo el stock" : "Eliminar equipo"}
              </h3>
            </div>
            <p className="text-xs text-surface-500 mb-4">
              {confirmDelete.type === "bulk"
                ? `¿Estás seguro de eliminar los ${total} equipos del stock? Se guardarán en la papelera.`
                : `¿Eliminar "${confirmDelete.nombre}"? Se guardará en la papelera.`}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 text-xs text-surface-600 hover:bg-surface-100 rounded-md">
                Cancelar
              </button>
              <button
                onClick={() => confirmDelete.type === "bulk" ? eliminarTodoStock() : eliminarEquipo(confirmDelete.id)}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 font-medium"
              >
                Eliminar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </motion.div>
  );
}
