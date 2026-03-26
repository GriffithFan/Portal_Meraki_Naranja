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

/* eslint-disable @typescript-eslint/no-explicit-any */

const ESTADOS_EQUIPO = ["DISPONIBLE", "INSTALADO", "EN_TRANSICION", "ROTO", "PERDIDO", "EN_REPARACION"];

const ESTADO_COLORS: Record<string, string> = {
  DISPONIBLE: "bg-green-100 text-green-700",
  INSTALADO: "bg-blue-100 text-blue-700",
  EN_TRANSICION: "bg-yellow-100 text-yellow-700",
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

const DEFAULT_COLUMNS: StockColumn[] = [
  { id: "nombre",      label: "Equipo",      field: "nombre",      visible: true,  editable: true,  type: "text" },
  { id: "modelo",      label: "Modelo",      field: "modelo",      visible: true,  editable: true,  type: "text" },
  { id: "marca",       label: "Marca",       field: "marca",       visible: true,  editable: true,  type: "text" },
  { id: "numeroSerie", label: "N/S",         field: "numeroSerie", visible: true,  editable: true,  type: "text" },
  { id: "cantidad",    label: "Cant.",        field: "cantidad",    visible: true,  editable: true,  type: "number" },
  { id: "estado",      label: "Estado",       field: "estado",      visible: true,  editable: true,  type: "select", options: ESTADOS_EQUIPO },
  { id: "categoria",   label: "Categoría",    field: "categoria",   visible: true,  editable: true,  type: "text" },
  { id: "ubicacion",   label: "Ubicación",    field: "ubicacion",   visible: true,  editable: true,  type: "text" },
  { id: "notas",       label: "Notas",        field: "notas",       visible: false, editable: true,  type: "text" },
  { id: "descripcion", label: "Descripción",  field: "descripcion", visible: false, editable: true,  type: "text" },
];

export default function StockPage() {
  const { isModOrAdmin } = useSession();
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
  const [form, setForm] = useState({ nombre: "", descripcion: "", numeroSerie: "", modelo: "", marca: "", cantidad: "1", estado: "DISPONIBLE", categoria: "", ubicacion: "", notas: "" });

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
      setForm({ nombre: "", descripcion: "", numeroSerie: "", modelo: "", marca: "", cantidad: "1", estado: "DISPONIBLE", categoria: "", ubicacion: "", notas: "" });
      toast.success("Equipo creado exitosamente");
      fetchEquipos();
    } else {
      toast.error("Error al crear equipo");
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

    // Inline editing input
    if (isEditing) {
      return (
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
      );
    }

    // Display value — double click to edit
    const val = eq[col.field];
    const display = col.id === "ubicacion" ? (val || eq.predio?.nombre || "—") : (val ?? "—");
    return (
      <span
        className={`${isModOrAdmin && col.editable ? "cursor-pointer hover:bg-primary-50 hover:text-primary-700 px-1 -mx-1 rounded transition-colors" : ""} ${col.id === "numeroSerie" ? "font-mono text-[10px]" : "text-[11px]"} ${col.id === "nombre" ? "font-medium text-surface-800" : "text-surface-600"}`}
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
          Arrastra las cabeceras para reordenar · Doble clic en una celda para editar
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
            <p className="text-xs">{search || filtroEstado ? "No se encontraron resultados" : "Agrega tu primer equipo al inventario"}</p>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {sortedEquipos.map((eq) => (
                <tr key={eq.id} className="hover:bg-surface-50 transition-colors row-animate">
                  {visibleColumns.map(col => (
                    <td key={col.id} className="px-2.5 py-1.5">
                      {renderCell(eq, col)}
                    </td>
                  ))}
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
              <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre *" className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} placeholder="Modelo" className="px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
                <input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} placeholder="Marca" className="px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              </div>
              <input value={form.numeroSerie} onChange={(e) => setForm({ ...form, numeroSerie: e.target.value })} placeholder="Número de serie" className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input type="number" min="1" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} placeholder="Cantidad" className="px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
                <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} className="px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400">
                  {ESTADOS_EQUIPO.map((e) => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}
                </select>
                <input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Categoría" className="px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              </div>
              <input value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} placeholder="Ubicación" className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
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
    </motion.div>
  );
}
