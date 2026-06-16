"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSession } from "@/hooks/useSession";
import { useSearchContext } from "@/contexts/SearchContext";
import { TableSkeleton } from "@/components/ui/Skeletons";
import EmptyState from "@/components/ui/EmptyState";
import SectionSettings from "@/components/ui/SectionSettings";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Bookmark, PackageSearch, Save, SearchX, Trash2 } from "lucide-react";
import { dedupeUsersByName } from "@/utils/asignacionUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

type TecnicoOption = { id: string; nombre: string; email?: string | null };

const ESTADOS_EQUIPO = ["DISPONIBLE", "INSTALADO", "EN_TRANSITO", "ROTO", "PERDIDO", "EN_REPARACION", "BAJA"];

const ESTADO_COLORS: Record<string, string> = {
  DISPONIBLE: "bg-green-100 text-green-700",
  INSTALADO: "bg-blue-100 text-blue-700",
  EN_TRANSITO: "bg-yellow-100 text-yellow-700",
  ROTO: "bg-red-100 text-red-700",
  PERDIDO: "bg-gray-100 text-gray-600",
  EN_REPARACION: "bg-orange-100 text-orange-700",
  BAJA: "bg-slate-200 text-slate-700",
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
  custom?: boolean;
}

interface StockSavedView {
  id: string;
  name: string;
  search: string;
  activeFilters: Record<string, string[]>;
  sortConfig: { field: string; dir: "asc" | "desc" } | null;
  columns: Array<{ id: string; visible: boolean; order: number }>;
  updatedAt?: string;
}

const STORAGE_KEY = "pmn-stock-col-config";
const STOCK_CUSTOM_FIELDS_KEY = "stock-custom-fields";
const PROVEEDORES = ["", "OCP", "DINATECH", "THNET", "BAPRO"];
const UBICACION_PRESETS = ["THNET", "Dinatech"];
const STOCK_ROWS_PER_PAGE = 100;

const ETIQUETA_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#1e293b",
];

const FILTER_COLUMNS = [
  { field: "nombre", label: "Equipo" },
  { field: "modelo", label: "Modelo" },
  { field: "estado", label: "Estado" },
  { field: "ubicacion", label: "Ubicación" },
  { field: "asignado", label: "Asignado" },
  { field: "etiqueta", label: "Etiqueta" },
  { field: "numeroSerie", label: "N/S" },
  { field: "proveedor", label: "Proveedor" },
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
  { id: "etiqueta",    label: "Etiqueta",    field: "etiqueta",    visible: true,  editable: false, type: "text" },
  { id: "modelo",      label: "Modelo",      field: "modelo",      visible: true,  editable: true,  type: "text" },
  { id: "numeroSerie", label: "N/S",         field: "numeroSerie", visible: true,  editable: true,  type: "text" },
  { id: "estado",      label: "Estado",       field: "estado",      visible: true,  editable: true,  type: "select", options: ESTADOS_EQUIPO },
  { id: "asignado",    label: "Asignado",     field: "asignadoId",  visible: true,  editable: true,  type: "select" },
  { id: "ubicacion",   label: "Ubicación",    field: "ubicacion",   visible: true,  editable: true,  type: "text", options: ["", "THNET", "Dinatech"] },
  { id: "fecha",       label: "Fecha",        field: "fecha",       visible: true,  editable: true,  type: "text" },
  { id: "proveedor",   label: "Proveedor",    field: "proveedor",   visible: true,  editable: true,  type: "text", options: PROVEEDORES },
  { id: "notas",       label: "Notas",        field: "notas",       visible: false, editable: true,  type: "text" },
  { id: "descripcion", label: "Descripción",  field: "descripcion", visible: false, editable: true,  type: "text" },
];

const MODAL_FIELD_IDS = ["numeroSerie", "nombre", "modelo", "estado", "asignado", "ubicacion", "fecha", "proveedor", "notas"];
const FORCE_VISIBLE_COLUMNS = new Set(["etiqueta"]);

function mergeStockColumns(savedColumns: StockColumn[]) {
  const byId = new Map(savedColumns.map((column) => [column.id, column]));
  const merged = savedColumns.map((column) => {
    const base = DEFAULT_COLUMNS.find((defaultColumn) => defaultColumn.id === column.id);
    return {
      ...(base || {}),
      ...column,
      visible: FORCE_VISIBLE_COLUMNS.has(column.id) ? true : column.visible,
    } as StockColumn;
  });

  DEFAULT_COLUMNS.forEach((defaultColumn, defaultIndex) => {
    if (byId.has(defaultColumn.id)) return;
    merged.splice(Math.min(defaultIndex, merged.length), 0, defaultColumn);
  });

  return merged;
}

function slugFieldName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || `campo_${Date.now()}`;
}

function emptyStockForm(fecha = "") {
  return { nombre: "", descripcion: "", numeroSerie: "", modelo: "", estado: "DISPONIBLE", ubicacion: "", notas: "", asignadoId: "", fecha, proveedor: "", camposExtra: {} as Record<string, string> };
}

export default function StockPage() {
  const { isModOrAdmin, isAdmin } = useSession();
  const { headerSearch } = useSearchContext();
  const [equipos, setEquipos] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stockAlerts, setStockAlerts] = useState<any>(null);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const urlParamsRef = useRef<URLSearchParams | null>(null);
  if (typeof window !== "undefined" && !urlParamsRef.current) {
    urlParamsRef.current = new URLSearchParams(window.location.search);
  }
  const [search, setSearch] = useState(() => urlParamsRef.current?.get("search") || "");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => { if (headerSearch !== undefined) setSearch(headerSearch); }, [headerSearch]);
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  const [sortConfig, setSortConfig] = useState<{ field: string; dir: "asc" | "desc" } | null>(null);
  const [savedViews, setSavedViews] = useState<StockSavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [showViewsMenu, setShowViewsMenu] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [savingView, setSavingView] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [filterMenuField, setFilterMenuField] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const viewsMenuRef = useRef<HTMLDivElement>(null);
  const scrollRestoreRef = useRef<number | null>(null);
  const serialInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEquipo, setEditingEquipo] = useState<any>(null);
  const [form, setForm] = useState({ nombre: "", descripcion: "", numeroSerie: "", modelo: "", estado: "DISPONIBLE", ubicacion: "", notas: "", asignadoId: "", fecha: "", proveedor: "", camposExtra: {} as Record<string, string> });
  const [duplicateEquipo, setDuplicateEquipo] = useState<any | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [customFieldName, setCustomFieldName] = useState("");
  const [editingCustomField, setEditingCustomField] = useState<string | null>(null);
  const [editingCustomFieldName, setEditingCustomFieldName] = useState("");
  const [stockFieldsOpen, setStockFieldsOpen] = useState(false);

  const closeStockPanel = useCallback(() => {
    setShowModal(false);
    setDuplicateEquipo(null);
    setEditingEquipo(null);
  }, []);

  useEffect(() => {
    if (!showModal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeStockPanel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showModal, closeStockPanel]);

  useEffect(() => {
    if (!showModal || editingEquipo || duplicateEquipo) return;
    const frame = requestAnimationFrame(() => {
      serialInputRef.current?.focus();
      serialInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [showModal, editingEquipo, duplicateEquipo]);

  /* ── Técnicos (para columna Asignado) ── */
  const [tecnicos, setTecnicos] = useState<TecnicoOption[]>([]);
  useEffect(() => {
    fetch("/api/usuarios", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((users: any[]) => setTecnicos(dedupeUsersByName(Array.isArray(users) ? users : []).map(u => ({ id: u.id, nombre: u.nombre, email: u.email }))))
      .catch(() => {});
  }, []);

  const getTecnicoOptions = useCallback((current?: { id?: string | null; nombre?: string | null; email?: string | null } | null) => {
    if (!current?.id || tecnicos.some((tecnico) => tecnico.id === current.id)) return tecnicos;
    return [...tecnicos, { id: current.id, nombre: current.nombre || "Usuario asignado", email: current.email }]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [tecnicos]);

  const tecnicoLabel = useCallback((tecnico: TecnicoOption, currentId?: string | null) => {
    const isContextualCurrent = currentId === tecnico.id && !tecnicos.some((base) => base.id === tecnico.id);
    return isContextualCurrent ? `${tecnico.nombre} (actual)` : tecnico.nombre;
  }, [tecnicos]);

  /* ── Etiqueta editing ── */
  const [editingEtiqueta, setEditingEtiqueta] = useState<string | null>(null);
  const [etiquetaForm, setEtiquetaForm] = useState({ texto: "", color: ETIQUETA_COLORS[0] });

  /* ── Export & Report ── */
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  /* ── Column state ── */
  const [columns, setColumns] = useState<StockColumn[]>(DEFAULT_COLUMNS);
  const colConfigLoaded = useRef(false);

  // Load column config from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const config: Array<Partial<StockColumn> & { id: string; order?: number }> = JSON.parse(saved);
        const defaultMap = new Map(DEFAULT_COLUMNS.map(col => [col.id, col]));
        const restored: StockColumn[] = config
          .map((savedCol, i) => {
            const base = defaultMap.get(savedCol.id);
            if (!base && (!savedCol.field || !savedCol.label)) return null;
            return {
              ...(base || {}),
              ...savedCol,
              visible: savedCol.visible ?? base?.visible ?? true,
              editable: savedCol.editable ?? base?.editable ?? true,
              type: savedCol.type ?? base?.type ?? "text",
              order: savedCol.order ?? i,
            } as StockColumn & { order: number };
          })
          .filter(Boolean)
          .sort((a, b) => (a!.order ?? 999) - (b!.order ?? 999))
          .map((col) => {
            const cleanCol = { ...col } as StockColumn & { order?: number };
            delete cleanCol.order;
            return cleanCol;
          });
        if (restored.length > 0) setColumns(mergeStockColumns(restored));
      }
    } catch { /* ignore corrupt data */ }
    colConfigLoaded.current = true;
  }, []);

  // Persist column config
  useEffect(() => {
    if (!colConfigLoaded.current) return;
    const config = columns.map((c, i) => ({ ...c, order: i }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [columns]);

  useEffect(() => {
    fetch(`/api/config-vista?clave=${STOCK_CUSTOM_FIELDS_KEY}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        const customFields = Array.isArray(data?.config) ? data.config : [];
        if (customFields.length === 0) return;
        setColumns(prev => {
          const byId = new Map(prev.map(col => [col.id, col]));
          for (const field of customFields) {
            if (!field?.id || !field?.field) continue;
            const existing = byId.get(field.id);
            byId.set(field.id, { ...field, visible: existing?.visible ?? field.visible !== false, editable: true, type: "text", custom: true });
          }
          return Array.from(byId.values());
        });
      })
      .catch(() => {});
  }, []);

  async function persistStockCustomFields(nextColumns: StockColumn[]) {
    const config = nextColumns
      .filter(col => col.custom)
      .map(col => ({ id: col.id, label: col.label, field: col.field, visible: col.visible, editable: true, type: col.type, custom: true }));
    await fetch("/api/config-vista", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ clave: STOCK_CUSTOM_FIELDS_KEY, config }),
    });
  }

  async function addCustomField() {
    const label = customFieldName.trim();
    if (!label) return;
    const clave = slugFieldName(label);
    const col: StockColumn = { id: `custom_${clave}`, label, field: `_custom_${clave}`, visible: true, editable: true, type: "text", custom: true };
    const next = columns.some(c => c.id === col.id) ? columns : [...columns, col];
    setColumns(next);
    setCustomFieldName("");
    await persistStockCustomFields(next);
    toast.success("Campo agregado");
  }

  async function renameCustomField(colId: string) {
    const label = editingCustomFieldName.trim();
    if (!label) return;
    const next = columns.map(col => col.id === colId ? { ...col, label } : col);
    setColumns(next);
    setEditingCustomField(null);
    setEditingCustomFieldName("");
    await persistStockCustomFields(next);
    toast.success("Campo actualizado");
  }

  async function removeCustomField(colId: string) {
    const col = columns.find(c => c.id === colId);
    if (!col) return;
    if (col.id === "nombre") {
      toast.error("El campo Nombre es obligatorio");
      return;
    }
    const next = columns.filter(c => c.id !== colId);
    setColumns(next);
    if (col.field.startsWith("_custom_")) {
      const key = col.field.replace("_custom_", "");
      setForm((prev) => {
        const rest = { ...prev.camposExtra };
        delete rest[key];
        return { ...prev, camposExtra: rest };
      });
    }
    await persistStockCustomFields(next);
    toast.success("Campo quitado");
  }

  const hasStockField = useCallback((id: string) => columns.some(col => col.id === id), [columns]);
  const stockFieldLabel = useCallback((id: string, fallback: string) => columns.find(col => col.id === id)?.label || fallback, [columns]);
  const modalFields = useMemo(() => columns.filter(col => MODAL_FIELD_IDS.includes(col.id)), [columns]);

  /* ── Filter helpers ── */
  const hasActiveFilters = Object.values(activeFilters).some(v => v.length > 0);

  function addFilter(field: string, value: string) {
    setActiveFilters(prev => {
      const current = prev[field] || [];
      if (current.includes(value)) {
        const next = current.filter(v => v !== value);
        if (next.length === 0) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [field]: _, ...rest } = prev; return rest;
        }
        return { ...prev, [field]: next };
      }
      return { ...prev, [field]: [...current, value] };
    });
  }

  function removeFilterGroup(field: string) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setActiveFilters(prev => { const { [field]: _, ...rest } = prev; return rest; });
  }

  function clearAllFilters() { setActiveFilters({}); }

  const createViewSnapshot = useCallback((name: string, id?: string): StockSavedView => ({
    id: id || `stock-view-${Date.now()}`,
    name: name.trim().slice(0, 60) || "Vista de stock",
    search,
    activeFilters,
    sortConfig,
    columns: columns.map((col, index) => ({ id: col.id, visible: col.visible, order: index })),
    updatedAt: new Date().toISOString(),
  }), [activeFilters, columns, search, sortConfig]);

  const persistSavedViews = useCallback(async (nextViews: StockSavedView[]) => {
    setSavingView(true);
    try {
      const res = await fetch("/api/preferencias/stock-vistas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ views: nextViews }),
      });
      if (!res.ok) throw new Error("save-failed");
      const data = await res.json();
      const views = Array.isArray(data.views) ? data.views : nextViews;
      setSavedViews(views);
      return views as StockSavedView[];
    } finally {
      setSavingView(false);
    }
  }, []);

  async function saveNewView() {
    const name = newViewName.trim() || `Vista ${savedViews.length + 1}`;
    const view = createViewSnapshot(name);
    try {
      const views = await persistSavedViews([view, ...savedViews].slice(0, 20));
      setActiveViewId(views[0]?.id || view.id);
      setNewViewName("");
      toast.success("Vista guardada");
    } catch {
      toast.error("No se pudo guardar la vista");
    }
  }

  async function updateActiveView() {
    const current = savedViews.find((view) => view.id === activeViewId);
    if (!current) return;
    const updated = createViewSnapshot(current.name, current.id);
    try {
      await persistSavedViews(savedViews.map((view) => view.id === current.id ? updated : view));
      toast.success("Vista actualizada");
    } catch {
      toast.error("No se pudo actualizar la vista");
    }
  }

  function applySavedView(view: StockSavedView) {
    setSearch(view.search || "");
    setActiveFilters(view.activeFilters || {});
    setSortConfig(view.sortConfig || null);
    if (Array.isArray(view.columns) && view.columns.length > 0) {
      setColumns((current) => {
        const byId = new Map(current.map((col) => [col.id, col]));
        const used = new Set<string>();
        const ordered = [...view.columns]
          .sort((a, b) => a.order - b.order)
          .map((savedCol) => {
            const col = byId.get(savedCol.id);
            if (!col) return null;
            used.add(savedCol.id);
            return { ...col, visible: FORCE_VISIBLE_COLUMNS.has(col.id) ? true : savedCol.visible !== false };
          })
          .filter(Boolean) as StockColumn[];
        const missing = current
          .filter((col) => !used.has(col.id))
          .map((col) => FORCE_VISIBLE_COLUMNS.has(col.id) ? { ...col, visible: true } : col);
        return [...ordered, ...missing];
      });
    }
    setActiveViewId(view.id);
    setShowViewsMenu(false);
    toast.success(`Vista aplicada: ${view.name}`);
  }

  async function deleteSavedView(id: string) {
    const next = savedViews.filter((view) => view.id !== id);
    try {
      await persistSavedViews(next);
      if (activeViewId === id) setActiveViewId(null);
      toast.success("Vista eliminada");
    } catch {
      toast.error("No se pudo eliminar la vista");
    }
  }

  // Close filter menu on click outside
  useEffect(() => {
    if (!showFilterMenu) return;
    const handler = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false); setFilterMenuField(null); setFilterSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFilterMenu]);

  useEffect(() => {
    fetch("/api/preferencias/stock-vistas", { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setSavedViews(Array.isArray(data?.views) ? data.views : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!showViewsMenu) return;
    const handler = (e: MouseEvent) => {
      if (viewsMenuRef.current && !viewsMenuRef.current.contains(e.target as Node)) setShowViewsMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showViewsMenu]);

  // Extract unique values per filterable column
  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    const sets: Record<string, Set<string>> = {};
    FILTER_COLUMNS.forEach(fc => { sets[fc.field] = new Set(); });
    equipos.forEach((eq: any) => {
      FILTER_COLUMNS.forEach(fc => {
        let val: string;
        if (fc.field === "asignado") val = eq.asignado?.nombre || "";
        else if (fc.field === "ubicacion") val = eq.ubicacion || eq.predio?.nombre || "";
        else if (fc.field === "estado") val = (eq.estado || "").replace(/_/g, " ");
        else val = eq[fc.field] || "";
        if (val) sets[fc.field].add(val);
      });
    });
    FILTER_COLUMNS.forEach(fc => {
      opts[fc.field] = Array.from(sets[fc.field]).sort((a, b) => a.localeCompare(b, "es"));
    });
    return opts;
  }, [equipos]);

  /* ── Sorting ── */

  function toggleSort(field: string) {
    setSortConfig(prev => {
      if (prev?.field === field) return prev.dir === "asc" ? { field, dir: "desc" } : null;
      return { field, dir: "asc" };
    });
  }

  const sortedEquipos = useMemo(() => {
    let filtered = equipos;
    // Apply active multi-column filters
    Object.entries(activeFilters).forEach(([field, values]) => {
      if (values.length === 0) return;
      filtered = filtered.filter((eq: any) => {
        let eqVal: string;
        if (field === "asignado") eqVal = eq.asignado?.nombre || "";
        else if (field === "ubicacion") eqVal = eq.ubicacion || eq.predio?.nombre || "";
        else if (field === "estado") eqVal = (eq.estado || "").replace(/_/g, " ");
        else eqVal = eq[field] || "";
        return values.includes(eqVal);
      });
    });
    if (!sortConfig) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = a[sortConfig.field] ?? "";
      const bVal = b[sortConfig.field] ?? "";
      const cmp = String(aVal).localeCompare(String(bVal), "es", { numeric: true });
      return sortConfig.dir === "asc" ? cmp : -cmp;
    });
  }, [equipos, activeFilters, sortConfig]);

  useEffect(() => { setCurrentPage(1); }, [search, activeFilters, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedEquipos.length / STOCK_ROWS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * STOCK_ROWS_PER_PAGE;
  const paginatedEquipos = useMemo(
    () => sortedEquipos.slice(pageStart, pageStart + STOCK_ROWS_PER_PAGE),
    [sortedEquipos, pageStart]
  );
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

    const prev = equipos.find(e => e.id === id);
    if (!prev) return;
    if (field.startsWith("_custom_")) {
      const key = field.replace("_custom_", "");
      const prevExtra = prev.camposExtra || {};
      if (String(prevExtra[key] ?? "") === String(val)) return;
      const nextExtra = { ...prevExtra, [key]: val };
      setEquipos(es => es.map(e => e.id === id ? { ...e, camposExtra: nextExtra } : e));
      const res = await fetch(`/api/stock/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ camposExtra: nextExtra }),
      });
      if (res.ok) {
        const today = new Date().toISOString().split("T")[0];
        setEquipos(es => es.map(e => e.id === id ? { ...e, camposExtra: nextExtra, fecha: today } : e));
        toast.success("Campo actualizado");
      } else {
        setEquipos(es => es.map(e => e.id === id ? { ...e, camposExtra: prevExtra } : e));
        toast.error("Error al actualizar");
      }
      return;
    }

    if (String(prev[field] ?? "") === String(val)) return;

    setEquipos(es => es.map(e => e.id === id ? { ...e, [field]: val } : e));
    const res = await fetch(`/api/stock/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ [field]: val }),
    });
    if (res.ok) {
      const today = new Date().toISOString().split("T")[0];
      setEquipos(es => es.map(e => e.id === id ? { ...e, fecha: today } : e));
      toast.success("Campo actualizado");
    } else {
      setEquipos(es => es.map(e => e.id === id ? { ...e, [field]: prev?.[field] } : e));
      toast.error("Error al actualizar");
    }
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      void saveEdit();
    }
    if (e.key === "Escape") setEditingCell(null);
  }

  function preventStockFormEnter(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") return;
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "TEXTAREA") return;
    event.preventDefault();
    event.stopPropagation();
  }

  /* ── Data fetching ── */
  const fetchStockAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const res = await fetch("/api/stock/alertas", { credentials: "include" });
      if (res.ok) setStockAlerts(await res.json());
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  const fetchEquipos = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", "5000");
    if (search) params.set("buscar", search);
    try {
      const res = await fetch(`/api/stock?${params}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEquipos(data.equipos || []);
      setTotal(data.total || 0);
      if (scrollRestoreRef.current !== null) {
        const y = scrollRestoreRef.current;
        scrollRestoreRef.current = null;
        requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" })));
      }
    } catch {
      toast.error("No se pudo cargar el stock");
    } finally {
      setLoading(false);
    }
    fetchStockAlerts();
  }, [search, fetchStockAlerts]);

  useEffect(() => { fetchEquipos(); }, [fetchEquipos]);

  function openEditModal(eq: any) {
    setEditingEquipo(eq);
    setDuplicateEquipo(null);
    setModalTab("editar");
    setActividadEquipo([]);
    setForm({
      nombre: eq.nombre || "",
      descripcion: eq.descripcion || "",
      numeroSerie: eq.numeroSerie || "",
      modelo: eq.modelo || "",
      estado: eq.estado || "DISPONIBLE",
      ubicacion: eq.ubicacion || "",
      notas: eq.notas || "",
      asignadoId: eq.asignadoId || "",
      fecha: eq.fecha || "",
      proveedor: eq.proveedor || "",
      camposExtra: eq.camposExtra || {},
    });
    setShowModal(true);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEquipo) return;
    const nombre = form.nombre.trim();
    if (!nombre) return;
    scrollRestoreRef.current = window.scrollY;
    const res = await fetch(`/api/stock/${editingEquipo.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...form, nombre }),
    });
    if (res.ok) {
      setShowModal(false);
      setEditingEquipo(null);
      setForm(emptyStockForm());
      toast.success("Equipo actualizado");
      fetchEquipos();
    } else {
      toast.error("Error al actualizar equipo");
    }
  }

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
      setForm(emptyStockForm());
      toast.success("Equipo creado exitosamente");
      fetchEquipos();
    } else if (res.status === 409) {
      // Serial duplicado — buscar el equipo existente y ofrecer edición
      const serial = form.numeroSerie.trim();
      const existing = equipos.find(eq => eq.numeroSerie?.toUpperCase() === serial.toUpperCase());
      if (existing) {
        setDuplicateEquipo(existing);
        setShowDuplicateModal(true);
      } else {
        toast.error("El número de serie ya existe");
      }
    } else {
      toast.error("Error al crear equipo");
    }
  }

  function handleLoadDuplicate() {
    if (!duplicateEquipo) return;
    setForm({
      nombre: duplicateEquipo.nombre || "",
      descripcion: duplicateEquipo.descripcion || "",
      numeroSerie: duplicateEquipo.numeroSerie || "",
      modelo: duplicateEquipo.modelo || "",
      estado: duplicateEquipo.estado || "DISPONIBLE",
      ubicacion: duplicateEquipo.ubicacion || "",
      notas: duplicateEquipo.notas || "",
      asignadoId: duplicateEquipo.asignadoId || "",
      fecha: duplicateEquipo.fecha || "",
      proveedor: duplicateEquipo.proveedor || "",
      camposExtra: duplicateEquipo.camposExtra || {},
    });
    setShowDuplicateModal(false);
    setShowModal(true);
    toast.info("Datos cargados — modificá lo que necesites y guardá");
  }

  async function handleUpdateDuplicate(e: React.FormEvent) {
    e.preventDefault();
    if (!duplicateEquipo) return;
    const nombre = form.nombre.trim();
    if (!nombre) return;
    const res = await fetch(`/api/stock/${duplicateEquipo.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...form, nombre }),
    });
    if (res.ok) {
      setShowModal(false);
      setDuplicateEquipo(null);
      setForm(emptyStockForm());
      toast.success("Equipo actualizado exitosamente");
      fetchEquipos();
    } else {
      toast.error("Error al actualizar equipo");
    }
  }

  /* ── Check serial on blur ── */
  function handleSerialBlur() {
    const serial = form.numeroSerie.trim();
    if (!serial || duplicateEquipo) return;
    const existing = equipos.find(eq => eq.numeroSerie?.toUpperCase() === serial.toUpperCase());
    if (existing) {
      setDuplicateEquipo(existing);
      setShowDuplicateModal(true);
    }
  }

  /* ── Export functions ── */
  async function exportStock(format: "csv" | "xlsx") {
    const XLSX = await import("xlsx");
    const customColumns = columns.filter(col => col.custom);
    const data = sortedEquipos.map((eq: any) => {
      let fecha = eq.fecha || "";
      // Normalizar fecha a DD/MM/AAAA en la exportación
      if (fecha) {
        const isoMatch = fecha.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
        if (isoMatch) fecha = `${isoMatch[3].padStart(2, "0")}/${isoMatch[2].padStart(2, "0")}/${isoMatch[1]}`;
      }
      const row: Record<string, string> = {
        Equipo: eq.nombre || "",
        Modelo: eq.modelo || "",
        "N/S": eq.numeroSerie || "",
        Estado: (eq.estado || "").replace(/_/g, " "),
        Asignado: eq.asignado?.nombre || "",
        Ubicación: eq.ubicacion || eq.predio?.nombre || "",
        Fecha: fecha,
        Notas: eq.notas || "",
        Etiqueta: eq.etiqueta || "",
        Categoría: eq.categoria || "",
        Proveedor: eq.proveedor || "",
      };
      for (const col of customColumns) row[col.label] = eq.camposExtra?.[col.field.replace("_custom_", "")] || "";
      return row;
    });

    if (data.length === 0) { toast.error("No hay datos para exportar"); return; }

    const ws = XLSX.utils.json_to_sheet(data);
    // Auto-width
    const colWidths = Object.keys(data[0]).map(key => ({
      wch: Math.max(key.length, ...data.map((r: any) => String(r[key] ?? "").length)) + 2,
    }));
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock");

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

    if (format === "csv") {
      const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      downloadBlob(blob, `stock_${dateStr}.csv`);
    } else {
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      downloadBlob(blob, `stock_${dateStr}.xlsx`);
    }
    setShowExportMenu(false);
    toast.success(`Stock exportado a ${format.toUpperCase()}`);
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ── Stock summary report ── */
  const stockSummary = useMemo(() => {
    // Inicializar todos los estados con 0
    const porEstado: Record<string, number> = {};
    ESTADOS_EQUIPO.forEach(e => { porEstado[e.replace(/_/g, " ")] = 0; });
    const porNombre: Record<string, Record<string, number>> = {};
    const porUbicacion: Record<string, number> = {};

    equipos.forEach((eq: any) => {
      const estado = (eq.estado || "SIN_ESTADO").replace(/_/g, " ");
      const nombre = eq.nombre || "Sin nombre";
      const ubicacion = eq.ubicacion || eq.predio?.nombre || "Sin ubicación";

      porEstado[estado] = (porEstado[estado] || 0) + 1;
      porUbicacion[ubicacion] = (porUbicacion[ubicacion] || 0) + 1;

      if (!porNombre[nombre]) porNombre[nombre] = {};
      porNombre[nombre][estado] = (porNombre[nombre][estado] || 0) + 1;
    });

    return { totalItems: equipos.length, porEstado, porNombre, porUbicacion };
  }, [equipos]);

  async function exportSummaryToExcel() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    // Hoja resumen
    const resumenRows: any[] = [
      { Categoría: "TOTAL DE EQUIPOS", Cantidad: stockSummary.totalItems },
      { Categoría: "", Cantidad: "" },
      { Categoría: "── POR ESTADO ──", Cantidad: "" },
      ...Object.entries(stockSummary.porEstado).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ Categoría: k, Cantidad: v })),
      { Categoría: "", Cantidad: "" },
      { Categoría: "── POR UBICACIÓN ──", Cantidad: "" },
      ...Object.entries(stockSummary.porUbicacion).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ Categoría: k, Cantidad: v })),
    ];
    const ws1 = XLSX.utils.json_to_sheet(resumenRows);
    ws1["!cols"] = [{ wch: 35 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Resumen General");

    // Hoja detalle
    const detalleRows: any[] = [];
    Object.entries(stockSummary.porNombre).forEach(([nombre, estados]) => {
      Object.entries(estados).forEach(([estado, cantidad]) => {
        detalleRows.push({ Equipo: nombre, Estado: estado, Cantidad: cantidad });
      });
    });
    if (detalleRows.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(detalleRows.sort((a, b) => b.Cantidad - a.Cantidad));
      ws2["!cols"] = [{ wch: 25 }, { wch: 20 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Detalle Equipo-Estado");
    }

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    downloadBlob(blob, `reporte_stock_${dateStr}.xlsx`);
    toast.success("Reporte exportado a Excel");
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
      const today = new Date().toISOString().split("T")[0];
      setEquipos(es => es.map(e => e.id === id ? { ...e, fecha: today } : e));
      toast.success(texto ? "Etiqueta guardada" : "Etiqueta removida");
    } else {
      if (prev) setEquipos(es => es.map(e => e.id === id ? prev : e));
      toast.error("Error al guardar etiqueta");
    }
  }

  async function cambiarProveedor(id: string, nuevoProveedor: string, prevOverride?: string | null) {
    const prev = prevOverride ?? equipos.find(e => e.id === id)?.proveedor;
    if (String(prev || "") === String(nuevoProveedor || "")) return;
    setEquipos(es => es.map(e => e.id === id ? { ...e, proveedor: nuevoProveedor || null } : e));
    const res = await fetch(`/api/stock/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ proveedor: nuevoProveedor || "" }),
    });
    if (res.ok) {
      const today = new Date().toISOString().split("T")[0];
      setEquipos(es => es.map(e => e.id === id ? { ...e, fecha: today } : e));
      toast.success(nuevoProveedor ? `Proveedor: ${nuevoProveedor}` : "Proveedor removido");
    } else {
      setEquipos(es => es.map(e => e.id === id ? { ...e, proveedor: prev } : e));
      toast.error("Error al cambiar proveedor");
    }
  }

  async function cambiarUbicacion(id: string, nuevaUbicacion: string) {
    const prev = equipos.find(e => e.id === id)?.ubicacion;
    if (String(prev || "") === String(nuevaUbicacion || "")) return;
    setEquipos(es => es.map(e => e.id === id ? { ...e, ubicacion: nuevaUbicacion || null } : e));
    const res = await fetch(`/api/stock/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ubicacion: nuevaUbicacion || "" }),
    });
    if (res.ok) {
      const today = new Date().toISOString().split("T")[0];
      setEquipos(es => es.map(e => e.id === id ? { ...e, fecha: today } : e));
      toast.success(nuevaUbicacion ? `Ubicación: ${nuevaUbicacion}` : "Ubicación removida");
    } else {
      setEquipos(es => es.map(e => e.id === id ? { ...e, ubicacion: prev } : e));
      toast.error("Error al cambiar ubicación");
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
      const today = new Date().toISOString().split("T")[0];
      setEquipos(es => es.map(e => e.id === id ? { ...e, fecha: today } : e));
      toast.success(`Estado cambiado a ${nuevoEstado.replace(/_/g, " ")}`);
    } else {
      setEquipos(es => es.map(e => e.id === id ? { ...e, estado: prev } : e));
      toast.error("Error al cambiar estado");
    }
  }

  const visibleColumns = useMemo(() => columns.filter(c => c.visible || FORCE_VISIBLE_COLUMNS.has(c.id)), [columns]);
  const activeView = useMemo(() => savedViews.find((view) => view.id === activeViewId) || null, [activeViewId, savedViews]);

  /* ── Bulk select ── */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkField, setBulkField] = useState<string>("");
  const [bulkValue, setBulkValue] = useState<string>("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const someSelected = selectedIds.size > 0;
  // allPageSelected depende de paginatedEquipos y selectedIds
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allPageSelected = useMemo(
    () => paginatedEquipos.length > 0 && paginatedEquipos.every(e => selectedIds.has(e.id)),
    // selectedIds es Set; usamos el objeto mismo para detectar cambios
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paginatedEquipos, selectedIds]
  );

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelectedIds(prev => { const next = new Set(prev); paginatedEquipos.forEach(e => next.delete(e.id)); return next; });
    } else {
      setSelectedIds(prev => { const next = new Set(prev); paginatedEquipos.forEach(e => next.add(e.id)); return next; });
    }
  }

  function toggleSelectOne(id: string) {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function applyBulkEdit() {
    if (!bulkField || selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/stock/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: Array.from(selectedIds), field: bulkField, value: bulkValue || null }),
      });
      if (res.ok) {
        const data = await res.json();
        setEquipos(prev => prev.map(e => selectedIds.has(e.id) ? { ...e, [bulkField]: bulkValue || null } : e));
        toast.success(`${data.count} equipos actualizados`);
        setSelectedIds(new Set());
        setBulkField("");
        setBulkValue("");
      } else {
        toast.error("Error al actualizar equipos");
      }
    } finally {
      setBulkLoading(false);
    }
  }

  /* ── Historial actividad equipo ── */
  const [actividadEquipo, setActividadEquipo] = useState<any[]>([]);
  const [actividadLoading, setActividadLoading] = useState(false);
  const [modalTab, setModalTab] = useState<"editar" | "historial">("editar");

  async function loadActividadEquipo(equipoId: string) {
    setActividadLoading(true);
    try {
      const res = await fetch(`/api/stock/${equipoId}/actividad`, { credentials: "include" });
      if (res.ok) setActividadEquipo(await res.json());
    } finally {
      setActividadLoading(false);
    }
  }

  /* ── Delete equipo ── */
  const [confirmDelete, setConfirmDelete] = useState<{ type: "row"; id: string; nombre: string } | { type: "bulk" } | { type: "custom-field"; id: string; label: string } | null>(null);

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
    if (!prev) return;
    if (field.startsWith("_custom_")) {
      const key = field.replace("_custom_", "");
      const nextExtra = { ...(prev.camposExtra || {}), [key]: "" };
      setEquipos(es => es.map(e => e.id === equipoId ? { ...e, camposExtra: nextExtra } : e));
      const res = await fetch(`/api/stock/${equipoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ camposExtra: nextExtra }),
      });
      if (res.ok) toast.success("Campo limpiado");
      else {
        setEquipos(es => es.map(e => e.id === equipoId ? prev : e));
        toast.error("Error al limpiar campo");
      }
      return;
    }
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

    // Proveedor — editable con sugerencias, sin bloquear valores nuevos
    if (col.id === "proveedor" && !isEditing) {
      if (isModOrAdmin) {
        const currentProveedor = eq.proveedor || "";
        const proveedorOptions = PROVEEDORES.filter(Boolean);
        const customProveedor = currentProveedor && !proveedorOptions.includes(currentProveedor);
        return (
          <select
            value={currentProveedor}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                startEdit(eq.id, "proveedor", currentProveedor);
                return;
              }
              cambiarProveedor(eq.id, e.target.value, currentProveedor);
            }}
            className="px-1.5 py-0.5 rounded text-[11px] border border-surface-200 bg-white focus:outline-none focus:border-primary-400 cursor-pointer max-w-[150px]"
          >
            <option value="">Sin proveedor</option>
            {proveedorOptions.map(p => <option key={p} value={p}>{p}</option>)}
            {customProveedor && <option value={currentProveedor}>{currentProveedor}</option>}
            <option value="__custom__">Editar...</option>
          </select>
        );
      }
      return <span className="text-[11px] text-surface-600">{eq.proveedor || "—"}</span>;
    }

    if (col.id === "ubicacion" && !isEditing) {
      if (isModOrAdmin) {
        const currentUbicacion = eq.ubicacion || "";
        const customUbicacion = currentUbicacion && !UBICACION_PRESETS.includes(currentUbicacion);
        return (
          <select
            value={currentUbicacion}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                startEdit(eq.id, "ubicacion", currentUbicacion);
                return;
              }
              cambiarUbicacion(eq.id, e.target.value);
            }}
            className="px-1.5 py-0.5 rounded text-[11px] border border-surface-200 bg-white focus:outline-none focus:border-primary-400 cursor-pointer max-w-[150px]"
          >
            <option value="">{eq.predio?.nombre ? `Predio: ${eq.predio.nombre}` : "Sin ubicación"}</option>
            {UBICACION_PRESETS.map(u => <option key={u} value={u}>{u}</option>)}
            {customUbicacion && <option value={currentUbicacion}>{currentUbicacion}</option>}
            <option value="__custom__">Editar...</option>
          </select>
        );
      }
      return <span className="text-[11px] text-surface-600">{eq.ubicacion || eq.predio?.nombre || "—"}</span>;
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
            {getTecnicoOptions(eq.asignado).map(t => <option key={t.id} value={t.id}>{tecnicoLabel(t, eq.asignadoId)}</option>)}
          </select>
        );
      }
      return <span className="text-[11px] text-surface-600">{eq.asignado?.nombre || "—"}</span>;
    }

    if (col.id === "etiqueta") {
      const isEditingTag = editingEtiqueta === eq.id;
      if (!isEditingTag) {
        return eq.etiqueta ? (
          <span
            className={`inline-flex min-w-[74px] items-center justify-center rounded-full px-2 py-1 text-[11px] font-semibold text-white shadow-sm ring-1 ring-black/5 shrink-0 ${isModOrAdmin ? "cursor-pointer transition hover:brightness-95" : ""}`}
            style={{ backgroundColor: eq.etiquetaColor || "#6b7280" }}
            onClick={(e) => {
              e.stopPropagation();
              if (isModOrAdmin) {
                setEditingEtiqueta(eq.id);
                setEtiquetaForm({ texto: eq.etiqueta, color: eq.etiquetaColor || ETIQUETA_COLORS[0] });
              }
            }}
            title={isModOrAdmin ? "Clic para editar etiqueta" : eq.etiqueta}
          >
            {eq.etiqueta}
          </span>
        ) : isModOrAdmin ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEditingEtiqueta(eq.id); setEtiquetaForm({ texto: "", color: ETIQUETA_COLORS[0] }); }}
            className="inline-flex items-center gap-1 rounded border border-dashed border-surface-200 px-1.5 py-0.5 text-[10px] text-surface-400 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600"
            title="Agregar etiqueta"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>
            Agregar
          </button>
        ) : <span className="text-[11px] text-surface-400">—</span>;
      }
      return (
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            type="text"
            value={etiquetaForm.texto}
            onChange={(e) => setEtiquetaForm(f => ({ ...f, texto: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void guardarEtiqueta(eq.id); } if (e.key === "Escape") setEditingEtiqueta(null); }}
            placeholder="Etiqueta"
            className="w-24 px-1.5 py-1 border border-primary-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white"
            maxLength={30}
          />
          <div className="flex gap-0.5">
            {ETIQUETA_COLORS.map(c => (
              <button
                type="button"
                key={c}
                onClick={(e) => { e.stopPropagation(); setEtiquetaForm(f => ({ ...f, color: c })); }}
                className={`w-3.5 h-3.5 rounded-full border-2 transition-transform ${etiquetaForm.color === c ? "border-surface-800 scale-125" : "border-transparent"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); void guardarEtiqueta(eq.id); }} className="text-green-600 hover:text-green-700 p-0.5">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); setEditingEtiqueta(null); }} className="text-surface-400 hover:text-surface-600 p-0.5">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          {eq.etiqueta && (
            <button type="button" onClick={(e) => { e.stopPropagation(); void guardarEtiqueta(eq.id, ""); }} className="text-red-400 hover:text-red-600 p-0.5" title="Quitar etiqueta">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
            </button>
          )}
        </div>
      );
    }

    // Nombre — includes etiqueta badge
    if (col.id === "nombre") {
      const isEditingTag = editingEtiqueta === eq.id;
      const showEtiquetaInNombre = !visibleColumns.some((visibleCol) => visibleCol.id === "etiqueta");
      return (
        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
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
          {eq.notas && (
            <span title={eq.notas} className="shrink-0">
              <svg className="w-3.5 h-3.5 text-yellow-500" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h10v2H7zm0-3h10v2H7zm0 6h7v2H7z"/></svg>
            </span>
          )}
          {/* Etiqueta badge */}
          {showEtiquetaInNombre && eq.etiqueta && !isEditingTag && (
            <span
              className={`inline-flex min-w-[74px] items-center justify-center rounded-full px-2 py-1 text-[11px] font-semibold text-white shadow-sm ring-1 ring-black/5 shrink-0 ${isModOrAdmin ? "cursor-pointer transition hover:brightness-95" : ""}`}
              style={{ backgroundColor: eq.etiquetaColor || "#6b7280" }}
              onClick={(e) => {
                e.stopPropagation();
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
          {showEtiquetaInNombre && !eq.etiqueta && !isEditingTag && isModOrAdmin && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setEditingEtiqueta(eq.id); setEtiquetaForm({ texto: "", color: ETIQUETA_COLORS[0] }); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-surface-300 hover:text-primary-500 shrink-0"
              title="Agregar etiqueta"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>
            </button>
          )}
          {showEtiquetaInNombre && isEditingTag && (
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                type="text"
                value={etiquetaForm.texto}
                onChange={(e) => setEtiquetaForm(f => ({ ...f, texto: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void guardarEtiqueta(eq.id); } if (e.key === "Escape") setEditingEtiqueta(null); }}
                placeholder="Etiqueta"
                className="w-24 px-1.5 py-1 border border-primary-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white"
                maxLength={30}
              />
              <div className="flex gap-0.5">
                {ETIQUETA_COLORS.map(c => (
                  <button
                    type="button"
                    key={c}
                    onClick={(e) => { e.stopPropagation(); setEtiquetaForm(f => ({ ...f, color: c })); }}
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-transform ${etiquetaForm.color === c ? "border-surface-800 scale-125" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <button type="button" onClick={(e) => { e.stopPropagation(); void guardarEtiqueta(eq.id); }} className="text-green-600 hover:text-green-700 p-0.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setEditingEtiqueta(null); }} className="text-surface-400 hover:text-surface-600 p-0.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              {eq.etiqueta && (
                <button type="button" onClick={(e) => { e.stopPropagation(); void guardarEtiqueta(eq.id, ""); }} className="text-red-400 hover:text-red-600 p-0.5" title="Quitar etiqueta">
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
          {col.type === "select" && col.options ? (
            <select
              autoFocus
              value={editValue}
              onChange={(e) => { setEditValue(e.target.value); }}
              onBlur={saveEdit}
              onKeyDown={handleEditKeyDown}
              className="w-full px-1 py-0.5 border border-primary-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white"
            >
              {col.options.map(o => <option key={o} value={o}>{o || "— Vacío (predio) —"}</option>)}
            </select>
          ) : (
            <input
              autoFocus
              type={col.type === "number" ? "number" : "text"}
              list={col.id === "proveedor" ? "stock-proveedores-list" : col.id === "ubicacion" ? "stock-ubicaciones-list" : undefined}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={handleEditKeyDown}
              className="w-full px-1.5 py-0.5 border border-primary-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-primary-400 bg-white"
              min={col.type === "number" ? 1 : undefined}
            />
          )}
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
    const val = col.field.startsWith("_custom_") ? eq.camposExtra?.[col.field.replace("_custom_", "")] : eq[col.field];
    let display: string = col.id === "ubicacion" ? (val || eq.predio?.nombre || "—") : (val ?? "—");
    // Formatear fecha a DD/MM/AAAA
    if (col.id === "fecha" && val) {
      const raw = String(val).trim();
      // Si viene en formato ISO (YYYY-MM-DD) o similar, convertir
      const isoMatch = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
      if (isoMatch) {
        display = `${isoMatch[3].padStart(2, "0")}/${isoMatch[2].padStart(2, "0")}/${isoMatch[1]}`;
      } else {
        // Si ya viene DD/MM/AAAA dejarlo así
        display = raw;
      }
    }
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
      <datalist id="stock-proveedores-list">
        {PROVEEDORES.filter(Boolean).map((proveedor) => <option key={proveedor} value={proveedor} />)}
      </datalist>
      <datalist id="stock-ubicaciones-list">
        <option value="THNET" />
        <option value="Dinatech" />
        <option value="OCP" />
      </datalist>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800">Stock</h1>
          <p className="text-xs text-surface-400">Inventario de equipos · {hasActiveFilters ? `${sortedEquipos.length} de ${total}` : `${total}`} registros</p>
        </div>
        <div className="flex items-center gap-1.5">
          <SectionSettings seccion="stock">
            {/* Column visibility toggles */}
            <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Columnas visibles</p>
            {columns.map(col => (
              <div key={col.id} className="flex items-center gap-2 py-0.5">
                <label className="flex items-center gap-2 text-xs text-surface-600 cursor-pointer flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={col.visible}
                    onChange={() => setColumns(prev => prev.map(c => c.id === col.id ? { ...c, visible: !c.visible } : c))}
                    className="rounded border-surface-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                  />
                  <span className="truncate">{col.label}</span>
                </label>
                {col.custom && isModOrAdmin && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditingCustomField(col.id); setEditingCustomFieldName(col.label); }} className="p-0.5 text-surface-400 hover:text-primary-600 rounded" title="Editar campo">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                    </button>
                    <button onClick={() => setConfirmDelete({ type: "custom-field", id: col.id, label: col.label })} className="p-0.5 text-surface-400 hover:text-red-500 rounded" title="Quitar campo">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
            {isModOrAdmin && (
              <>
                <hr className="border-surface-100 my-2" />
                <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Campos personalizados</p>
                {editingCustomField ? (
                  <div className="flex items-center gap-1 mb-2">
                    <input value={editingCustomFieldName} onChange={(e) => setEditingCustomFieldName(e.target.value)} className="min-w-0 flex-1 px-2 py-1 text-xs border border-surface-200 rounded-md focus:outline-none focus:border-primary-400" placeholder="Nombre del campo" />
                    <button onClick={() => renameCustomField(editingCustomField)} className="px-2 py-1 text-[10px] rounded-md bg-primary-600 text-white">OK</button>
                    <button onClick={() => setEditingCustomField(null)} className="px-2 py-1 text-[10px] rounded-md bg-surface-100 text-surface-500">X</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 mb-2">
                    <input value={customFieldName} onChange={(e) => setCustomFieldName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomField(); } }} className="min-w-0 flex-1 px-2 py-1 text-xs border border-surface-200 rounded-md focus:outline-none focus:border-primary-400" placeholder="Ej: Orden de compra" />
                    <button onClick={addCustomField} className="px-2 py-1 text-[10px] rounded-md bg-primary-600 text-white">Agregar</button>
                  </div>
                )}
              </>
            )}
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
          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-3 py-1.5 border border-surface-200 text-surface-600 rounded-md text-xs font-medium hover:bg-surface-50 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Exportar
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                <div className="fixed inset-x-3 top-28 z-50 overflow-hidden rounded-lg border border-surface-200 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1 sm:min-w-[160px]">
                  <button onClick={() => exportStock("csv")} className="w-full px-3 py-2 text-left text-xs text-surface-700 hover:bg-surface-50 flex items-center gap-2">
                    <svg className="w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    Exportar a CSV
                  </button>
                  <button onClick={() => exportStock("xlsx")} className="w-full px-3 py-2 text-left text-xs text-surface-700 hover:bg-surface-50 border-t border-surface-100 flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375" /><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625" /></svg>
                    Exportar a Excel
                  </button>
                </div>
              </>
            )}
          </div>
          {/* Report button */}
          <button
            onClick={() => setShowReportModal(true)}
            className="px-3 py-1.5 border border-surface-200 text-surface-600 rounded-md text-xs font-medium hover:bg-surface-50 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
            Resumen
          </button>
          {isModOrAdmin && (
            <button onClick={() => { setEditingEquipo(null); setDuplicateEquipo(null); const hoy = new Date(); const dd = String(hoy.getDate()).padStart(2,"0"); const mm = String(hoy.getMonth()+1).padStart(2,"0"); const yyyy = hoy.getFullYear(); setForm(emptyStockForm(`${dd}/${mm}/${yyyy}`)); setShowModal(true); }} className="px-3 py-1.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 transition-colors flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Agregar equipo
            </button>
          )}
        </div>
      </div>

      <StockAlertsPanel data={stockAlerts} loading={alertsLoading} />

      {/* Vistas guardadas */}
      <div className="mb-3 flex flex-col gap-2 rounded-xl border border-surface-200 bg-white px-3 py-2 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
            <Bookmark className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-surface-700">Vistas guardadas</p>
            <p className="truncate text-[11px] text-surface-400">
              {activeView ? `Activa: ${activeView.name}` : savedViews.length > 0 ? `${savedViews.length} vista${savedViews.length === 1 ? "" : "s"} disponible${savedViews.length === 1 ? "" : "s"}` : "Guardá filtros, orden y columnas para reutilizarlos"}
            </p>
          </div>
        </div>
        <div className="relative" ref={viewsMenuRef}>
          <button
            type="button"
            onClick={() => setShowViewsMenu((value) => !value)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-surface-200 px-3 py-2 text-xs font-medium text-surface-600 transition hover:bg-surface-50 sm:w-auto"
          >
            <Bookmark className="h-3.5 w-3.5" />
            Gestionar vistas
          </button>
          {showViewsMenu && (
            <div className="fixed inset-x-3 top-28 z-50 overflow-hidden rounded-xl border border-surface-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
              <div className="border-b border-surface-100 p-3">
                <p className="text-xs font-semibold text-surface-700">Guardar vista actual</p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={newViewName}
                    onChange={(event) => setNewViewName(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") saveNewView(); }}
                    placeholder="Ej: Rotos OCP, THNET disponible..."
                    className="min-w-0 flex-1 rounded-lg border border-surface-200 px-2 py-1.5 text-xs outline-none focus:border-primary-400"
                    maxLength={60}
                  />
                  <button
                    type="button"
                    onClick={saveNewView}
                    disabled={savingView}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Guardar
                  </button>
                </div>
                {activeView && (
                  <button
                    type="button"
                    onClick={updateActiveView}
                    disabled={savingView}
                    className="mt-2 text-[11px] font-medium text-primary-600 transition hover:text-primary-700 disabled:opacity-50"
                  >
                    Actualizar vista {activeView.name} con filtros actuales
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto p-2">
                {savedViews.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-surface-400">Todavía no hay vistas guardadas</p>
                ) : savedViews.map((view) => (
                  <div key={view.id} className="group/view flex items-center gap-2 rounded-lg px-2 py-2 transition hover:bg-surface-50">
                    <button
                      type="button"
                      onClick={() => applySavedView(view)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-xs font-semibold text-surface-700">{view.name}</p>
                      <p className="truncate text-[10px] text-surface-400">
                        {Object.values(view.activeFilters || {}).reduce((totalCount, values) => totalCount + values.length, 0)} filtros · {view.search ? `busca "${view.search}"` : "sin búsqueda"}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedView(view.id)}
                      className="rounded-md p-1 text-surface-300 opacity-100 transition hover:bg-red-50 hover:text-red-500 sm:opacity-0 sm:group-hover/view:opacity-100"
                      title="Eliminar vista"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar equipo..." className="flex-1 min-w-0 px-3 py-2 sm:py-1.5 border border-surface-200 rounded-lg sm:rounded-md text-sm sm:text-xs focus:outline-none focus:border-surface-400" />
          <div className="relative" ref={filterMenuRef}>
            <button
              onClick={() => { setShowFilterMenu(!showFilterMenu); setFilterMenuField(null); setFilterSearch(""); }}
              className={`px-3 py-2 sm:py-1.5 border rounded-lg sm:rounded-md text-sm sm:text-xs font-medium transition-colors flex items-center gap-1.5 ${hasActiveFilters ? "border-primary-300 bg-primary-50 text-primary-700" : "border-surface-200 text-surface-600 hover:bg-surface-50"}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" /></svg>
              Filtros{hasActiveFilters && ` (${Object.values(activeFilters).reduce((s, v) => s + v.length, 0)})`}
            </button>
            {showFilterMenu && (
              <div className="fixed inset-x-3 top-28 z-50 max-h-[70vh] overflow-hidden rounded-lg border border-surface-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:left-auto sm:right-0 sm:top-full sm:mt-1 sm:w-64">
                {!filterMenuField ? (
                  <>
                    <div className="px-3 py-2 border-b border-surface-100">
                      <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Filtrar por</p>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {FILTER_COLUMNS.map(fc => {
                        const count = (activeFilters[fc.field] || []).length;
                        return (
                          <button
                            key={fc.field}
                            onClick={() => { setFilterMenuField(fc.field); setFilterSearch(""); }}
                            className="w-full px-3 py-2 text-left text-xs text-surface-700 hover:bg-surface-50 flex items-center justify-between transition-colors"
                          >
                            <span>{fc.label}</span>
                            <span className="flex items-center gap-1.5">
                              {count > 0 && <span className="bg-primary-100 text-primary-700 text-[10px] font-medium px-1.5 py-0.5 rounded-full">{count}</span>}
                              <svg className="w-3.5 h-3.5 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {hasActiveFilters && (
                      <div className="border-t border-surface-100 px-3 py-2">
                        <button onClick={() => { clearAllFilters(); setShowFilterMenu(false); }} className="text-[10px] text-red-500 hover:text-red-600 font-medium">
                          Limpiar todos los filtros
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="px-3 py-2 border-b border-surface-100 flex items-center gap-2">
                      <button onClick={() => { setFilterMenuField(null); setFilterSearch(""); }} className="p-0.5 hover:bg-surface-100 rounded text-surface-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                      </button>
                      <p className="text-xs font-semibold text-surface-700">{FILTER_COLUMNS.find(fc => fc.field === filterMenuField)?.label}</p>
                    </div>
                    <div className="px-2 py-1.5 border-b border-surface-100">
                      <input
                        autoFocus
                        type="text"
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                        placeholder="Buscar valor..."
                        className="w-full px-2 py-1 border border-surface-200 rounded text-xs focus:outline-none focus:border-primary-400"
                      />
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      {(filterOptions[filterMenuField] || [])
                        .filter(v => !filterSearch || v.toLowerCase().includes(filterSearch.toLowerCase()))
                        .map(val => {
                          const isActive = (activeFilters[filterMenuField] || []).includes(val);
                          return (
                            <button
                              key={val}
                              onClick={() => addFilter(filterMenuField, val)}
                              className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors ${isActive ? "bg-primary-50 text-primary-700" : "text-surface-600 hover:bg-surface-50"}`}
                            >
                              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${isActive ? "bg-primary-600 border-primary-600" : "border-surface-300"}`}>
                                {isActive && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                              </span>
                              {val}
                            </button>
                          );
                        })}
                      {(filterOptions[filterMenuField] || []).filter(v => !filterSearch || v.toLowerCase().includes(filterSearch.toLowerCase())).length === 0 && (
                        <p className="px-3 py-3 text-xs text-surface-400 text-center">Sin valores</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5">
            {Object.entries(activeFilters).map(([field, values]) => {
              if (values.length === 0) return null;
              const label = FILTER_COLUMNS.find(fc => fc.field === field)?.label || field;
              return (
                <div key={field} className="inline-flex items-center gap-1 px-2 py-1 bg-primary-50 border border-primary-200 rounded-md text-[11px] text-primary-700">
                  <span className="font-medium">{label}:</span>
                  <span>{values.length <= 2 ? values.join(", ") : `${values.length} seleccionados`}</span>
                  <button onClick={() => removeFilterGroup(field)} className="ml-0.5 p-0.5 hover:bg-primary-100 rounded text-primary-400 hover:text-primary-600">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              );
            })}
            <button onClick={clearAllFilters} className="text-[10px] text-surface-400 hover:text-red-500 px-1 transition-colors">
              Limpiar todo
            </button>
          </div>
        )}
      </div>

      {isModOrAdmin && (
        <p className="mb-2 hidden items-center gap-1 text-[10px] text-surface-400 sm:flex">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
          Arrastra cabeceras para reordenar · Doble clic para editar · ✕ para limpiar campo
        </p>
      )}

      {/* Barra acciones masivas */}
      {isModOrAdmin && someSelected && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
          <span className="text-xs font-medium text-orange-800">{selectedIds.size} seleccionado{selectedIds.size !== 1 ? "s" : ""}</span>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <select
              value={bulkField}
              onChange={e => { setBulkField(e.target.value); setBulkValue(""); }}
              className="rounded border border-surface-200 bg-white px-2 py-1 text-xs focus:outline-none"
            >
              <option value="">Cambiar campo…</option>
              <option value="estado">Estado</option>
              <option value="ubicacion">Ubicación</option>
              <option value="proveedor">Proveedor</option>
              <option value="categoria">Categoría</option>
              <option value="asignadoId">Asignado</option>
            </select>
            {bulkField === "estado" && (
              <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="rounded border border-surface-200 bg-white px-2 py-1 text-xs focus:outline-none">
                <option value="">Seleccionar…</option>
                {ESTADOS_EQUIPO.map(e => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}
              </select>
            )}
            {bulkField === "ubicacion" && (
              <input list="stock-ubicaciones-list" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Escribir ubicación…" className="rounded border border-surface-200 bg-white px-2 py-1 text-xs focus:outline-none w-36" />
            )}
            {bulkField === "proveedor" && (
              <input list="stock-proveedores-list" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Escribir proveedor…" className="rounded border border-surface-200 bg-white px-2 py-1 text-xs focus:outline-none w-36" />
            )}
            {bulkField === "categoria" && (
              <input value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Categoría…" className="rounded border border-surface-200 bg-white px-2 py-1 text-xs focus:outline-none w-36" />
            )}
            {bulkField === "asignadoId" && (
              <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="rounded border border-surface-200 bg-white px-2 py-1 text-xs focus:outline-none">
                <option value="">Sin asignar</option>
                {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            )}
            {bulkField && (
              <button
                onClick={applyBulkEdit}
                disabled={bulkLoading || !bulkField}
                className="rounded bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-60"
              >
                {bulkLoading ? "Aplicando…" : "Aplicar"}
              </button>
            )}
          </div>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-surface-400 hover:text-surface-700">Deseleccionar todo</button>
        </div>
      )}

      {/* Tabla */}
      <Card>
        <CardContent className="overflow-hidden p-0 md:overflow-x-auto">
        {loading ? (
          <TableSkeleton rows={6} cols={visibleColumns.length || 6} />
        ) : sortedEquipos.length === 0 ? (
          <EmptyState
            className="py-16"
            icon={search || hasActiveFilters ? <SearchX className="h-7 w-7" /> : <PackageSearch className="h-7 w-7" />}
            title={search || hasActiveFilters ? "No se encontraron equipos" : "Sin equipos en stock"}
            description={search || hasActiveFilters ? "Probá limpiar la búsqueda o quitar filtros para volver al inventario completo." : "Agregá equipos manualmente o importalos desde un archivo."}
            action={search || hasActiveFilters ? (
              <button
                type="button"
                onClick={() => { setSearch(""); clearAllFilters(); }}
                className="rounded-lg border border-surface-200 px-3 py-2 text-xs font-medium text-surface-600 transition hover:bg-surface-50"
              >
                Limpiar búsqueda y filtros
              </button>
            ) : isModOrAdmin ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => { setEditingEquipo(null); setDuplicateEquipo(null); const hoy = new Date(); const dd = String(hoy.getDate()).padStart(2,"0"); const mm = String(hoy.getMonth()+1).padStart(2,"0"); const yyyy = hoy.getFullYear(); setForm(emptyStockForm(`${dd}/${mm}/${yyyy}`)); setShowModal(true); }}
                  className="rounded-lg bg-surface-800 px-3 py-2 text-xs font-semibold text-white transition hover:bg-surface-700"
                >
                  Agregar equipo
                </button>
                <Link
                  href="/dashboard/importar"
                  className="inline-flex items-center justify-center rounded-lg border border-surface-200 px-3 py-2 text-xs font-medium text-surface-600 transition hover:bg-surface-50"
                >
                  Importar desde Excel
                </Link>
              </div>
            ) : undefined}
          />
        ) : (
          <>
          <div className="divide-y divide-surface-100 md:hidden">
            {paginatedEquipos.map((eq) => (
              <div
                key={`mobile-${eq.id}`}
                role="button"
                tabIndex={0}
                className="p-3 transition-colors active:bg-surface-50"
                onClick={(event) => {
                  const tag = (event.target as HTMLElement).closest("select, input, button, a, textarea");
                  if (tag) return;
                  if (editingCell || editingEtiqueta) return;
                  openEditModal(eq);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") openEditModal(eq);
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-surface-800">{eq.nombre || "Equipo sin nombre"}</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-surface-400">{eq.numeroSerie || "Sin serie"}</p>
                  </div>
                  <div className="shrink-0">{renderCell(eq, DEFAULT_COLUMNS.find((col) => col.id === "estado") || visibleColumns[0])}</div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {visibleColumns.filter((col) => col.id !== "nombre" && col.id !== "estado").slice(0, 6).map((col) => (
                    <div key={`${eq.id}-mobile-${col.id}`} className="min-w-0 rounded-lg bg-surface-50 px-2 py-1.5">
                      <p className="mb-0.5 truncate text-[10px] font-semibold uppercase tracking-wide text-surface-400">{col.label}</p>
                      <div className="min-w-0 truncate text-xs text-surface-700">{renderCell(eq, col)}</div>
                    </div>
                  ))}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => setConfirmDelete({ type: "row", id: eq.id, nombre: eq.nombre })}
                    className="mt-3 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-red-500 hover:bg-red-50"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <thead className="border-b border-surface-200 bg-white">
              <tr>
                {isModOrAdmin && (
                  <th className="w-8 px-2.5 py-2">
                    <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} className="h-3.5 w-3.5 cursor-pointer rounded border-surface-300 accent-orange-500" title="Seleccionar página" />
                  </th>
                )}
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
                        <span className="text-[9px]">{sortConfig.dir === "asc" ? "Asc" : "Desc"}</span>
                      )}
                    </span>
                  </th>
                ))}
                {isAdmin && <th className="w-8 px-1.5 py-2" />}
              </tr>
              </thead>
              <tbody>
                {paginatedEquipos.map((eq) => (
                  <tr key={eq.id} className={`group cursor-pointer border-b border-surface-100 transition-colors hover:bg-surface-50 ${selectedIds.has(eq.id) ? "bg-orange-50" : ""}`}>
                    {isModOrAdmin && (
                      <td className="px-2.5 py-1.5" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(eq.id)} onChange={() => toggleSelectOne(eq.id)} className="h-3.5 w-3.5 cursor-pointer rounded border-surface-300 accent-orange-500" />
                      </td>
                    )}
                    {visibleColumns.map(col => (
                      <td
                        key={col.id}
                        className="px-2.5 py-1.5"
                        onClick={(e) => {
                          const tag = (e.target as HTMLElement).closest("select, input, button, a, textarea");
                          if (tag) return;
                          if (editingCell || editingEtiqueta) return;
                          openEditModal(eq);
                        }}
                      >
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
          </div>
          {sortedEquipos.length > STOCK_ROWS_PER_PAGE && (
            <div className="flex flex-col gap-2 border-t border-surface-100 px-3 py-2 text-xs text-surface-500 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Mostrando {pageStart + 1}-{Math.min(pageStart + STOCK_ROWS_PER_PAGE, sortedEquipos.length)} de {sortedEquipos.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={safeCurrentPage <= 1}
                  className="rounded-md border border-surface-200 px-2 py-1 font-medium text-surface-600 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-surface-50"
                >
                  Anterior
                </button>
                <span className="font-medium text-surface-600">{safeCurrentPage} / {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={safeCurrentPage >= totalPages}
                  className="rounded-md border border-surface-200 px-2 py-1 font-medium text-surface-600 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-surface-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </CardContent>
      </Card>

      {/* Modal crear/editar equipo */}
      <AnimatePresence>
      {showModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[70] flex items-stretch justify-end bg-black/40 sm:bg-black/20"
          onClick={closeStockPanel}
        >
          <motion.form
            initial={{ opacity: 0, x: 48 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 48 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={editingEquipo ? handleUpdate : (duplicateEquipo ? handleUpdateDuplicate : handleCreate)}
            onKeyDown={preventStockFormEnter}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={editingEquipo ? "Editar equipo" : (duplicateEquipo ? "Modificar equipo" : "Agregar equipo")}
            className="h-[100dvh] w-full overflow-y-auto bg-white p-5 shadow-xl sm:max-w-xl sm:border-l sm:border-surface-200 sm:p-6"
          >
            <h2 className="text-base font-semibold text-surface-800 mb-4">
              {editingEquipo ? "Editar Equipo" : (duplicateEquipo ? "Modificar Equipo" : "Agregar Equipo")}
            </h2>
            {editingEquipo && (
              <div className="flex gap-1 mb-4 border-b border-surface-100 pb-3">
                <button type="button" onClick={() => setModalTab("editar")} className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${modalTab === "editar" ? "bg-surface-800 text-white" : "text-surface-500 hover:bg-surface-100"}`}>Editar</button>
                <button type="button" onClick={() => { setModalTab("historial"); loadActividadEquipo(editingEquipo.id); }} className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${modalTab === "historial" ? "bg-surface-800 text-white" : "text-surface-500 hover:bg-surface-100"}`}>Historial</button>
              </div>
            )}
            {modalTab === "historial" && editingEquipo ? (
              <div className="space-y-2">
                {actividadLoading ? (
                  <p className="text-xs text-surface-400 py-4 text-center">Cargando historial…</p>
                ) : actividadEquipo.length === 0 ? (
                  <p className="text-xs text-surface-400 py-4 text-center">Sin actividad registrada.</p>
                ) : actividadEquipo.map((act: any) => (
                  <div key={act.id} className="rounded-md border border-surface-100 bg-surface-50 px-3 py-2">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-600">{act.accion}</span>
                      <span className="text-[10px] text-surface-400">{new Date(act.createdAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</span>
                    </div>
                    <p className="text-xs text-surface-700 break-words">{act.descripcion}</p>
                    {act.usuario && <p className="text-[10px] text-surface-400 mt-0.5">Por {act.usuario.nombre}</p>}
                  </div>
                ))}
              </div>
            ) : (
            <>
            {duplicateEquipo && (
              <div className="mb-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-[11px] text-yellow-700">⚠️ Editando equipo existente con serial <strong>{duplicateEquipo.numeroSerie}</strong></p>
              </div>
            )}
            <div className="space-y-3">
              {hasStockField("numeroSerie") && (
              <div>
                <label className="block text-[10px] font-medium text-surface-500 uppercase tracking-wider mb-1">{stockFieldLabel("numeroSerie", "Número de serie")}</label>
                <input ref={serialInputRef} value={form.numeroSerie} onChange={(e) => {
                  const val = e.target.value;
                  const prefix = val.slice(0, 4).toUpperCase();
                  const match = prefix.length === 4 ? SERIAL_PREFIX_MAP[prefix] : null;
                  setForm(f => ({
                    ...f,
                    numeroSerie: val,
                    ...(match ? { nombre: match.nombre, modelo: match.modelo } : {}),
                  }));
                }} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} onBlur={handleSerialBlur} placeholder="Ej: Q2PD-XXXX-XXXX" className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" disabled={!!duplicateEquipo || !!editingEquipo} />
                {form.numeroSerie.length >= 4 && SERIAL_PREFIX_MAP[form.numeroSerie.slice(0, 4).toUpperCase()] && (
                  <p className="text-[10px] text-green-600 mt-0.5 ml-1">Auto-completado: {SERIAL_PREFIX_MAP[form.numeroSerie.slice(0, 4).toUpperCase()].nombre} · {SERIAL_PREFIX_MAP[form.numeroSerie.slice(0, 4).toUpperCase()].modelo}</p>
                )}
              </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-surface-500 uppercase tracking-wider mb-1">{stockFieldLabel("nombre", "Nombre")} *</label>
                  <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: AP, SWITCH, UTM" className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
                </div>
                {hasStockField("modelo") && (
                <div>
                  <label className="block text-[10px] font-medium text-surface-500 uppercase tracking-wider mb-1">{stockFieldLabel("modelo", "Modelo")}</label>
                  <input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} placeholder="Ej: MR33, MS225" className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
                </div>
                )}
              </div>
              {(hasStockField("estado") || hasStockField("asignado")) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {hasStockField("estado") && (
                <div>
                  <label className="block text-[10px] font-medium text-surface-500 uppercase tracking-wider mb-1">{stockFieldLabel("estado", "Estado")}</label>
                  <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400">
                    {ESTADOS_EQUIPO.map((e) => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                )}
                {hasStockField("asignado") && (
                <div>
                  <label className="block text-[10px] font-medium text-surface-500 uppercase tracking-wider mb-1">{stockFieldLabel("asignado", "Asignado")}</label>
                  <select value={form.asignadoId} onChange={(e) => setForm({ ...form, asignadoId: e.target.value })} className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400">
                    <option value="">Sin asignar</option>
                    {getTecnicoOptions(editingEquipo?.asignado || duplicateEquipo?.asignado).map(t => <option key={t.id} value={t.id}>{tecnicoLabel(t, form.asignadoId)}</option>)}
                  </select>
                </div>
                )}
              </div>
              )}
              {(hasStockField("ubicacion") || hasStockField("fecha")) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {hasStockField("ubicacion") && (
                <div>
                  <label className="block text-[10px] font-medium text-surface-500 uppercase tracking-wider mb-1">{stockFieldLabel("ubicacion", "Ubicación")}</label>
                  <div className="flex gap-2">
                    <select value={UBICACION_PRESETS.includes(form.ubicacion) || !form.ubicacion ? form.ubicacion : "__custom__"} onChange={(e) => { if (e.target.value !== "__custom__") setForm({ ...form, ubicacion: e.target.value }); }} className="w-32 px-2 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400">
                      <option value="">Vacío</option>
                      {UBICACION_PRESETS.map((ubicacion) => <option key={ubicacion} value={ubicacion}>{ubicacion}</option>)}
                      <option value="__custom__">Otra</option>
                    </select>
                    <input value={form.ubicacion} list="stock-ubicaciones-list" onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} placeholder="Ubicación personalizada" className="min-w-0 flex-1 px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
                  </div>
                </div>
                )}
                {hasStockField("fecha") && (
                <div>
                  <label className="block text-[10px] font-medium text-surface-500 uppercase tracking-wider mb-1">{stockFieldLabel("fecha", "Fecha")}</label>
                  <input value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} placeholder="DD/MM/AAAA" className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
                </div>
                )}
              </div>
              )}
              {hasStockField("proveedor") && (
              <div>
                <label className="block text-[10px] font-medium text-surface-500 uppercase tracking-wider mb-1">{stockFieldLabel("proveedor", "Proveedor")}</label>
                <div className="flex gap-2">
                  <select value={PROVEEDORES.filter(Boolean).includes(form.proveedor) || !form.proveedor ? form.proveedor : "__custom__"} onChange={(e) => { if (e.target.value !== "__custom__") setForm({ ...form, proveedor: e.target.value }); }} className="w-36 px-2 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400">
                    <option value="">Sin proveedor</option>
                    {PROVEEDORES.filter(Boolean).map((proveedor) => <option key={proveedor} value={proveedor}>{proveedor}</option>)}
                    <option value="__custom__">Otro</option>
                  </select>
                  <input value={form.proveedor} list="stock-proveedores-list" onChange={(e) => setForm({ ...form, proveedor: e.target.value })} placeholder="Proveedor personalizado" className="min-w-0 flex-1 px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
                </div>
              </div>
              )}
              {isModOrAdmin && (
                <div className="overflow-hidden rounded-lg border border-surface-200 bg-surface-50/60">
                  <button
                    type="button"
                    onClick={() => setStockFieldsOpen((value) => !value)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-surface-100/70"
                  >
                    <div className="min-w-0">
                      <h3 className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Campos de stock</h3>
                      <p className="mt-0.5 truncate text-[11px] text-surface-400">
                        {columns.filter(col => col.custom).length > 0
                          ? `${columns.filter(col => col.custom).length} personalizado${columns.filter(col => col.custom).length === 1 ? "" : "s"}`
                          : "Configurar columnas y campos personalizados"}
                      </p>
                    </div>
                    <svg className={`h-4 w-4 shrink-0 text-surface-400 transition-transform ${stockFieldsOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>

                  {stockFieldsOpen && (
                    <div className="space-y-3 border-t border-surface-200 p-3">
                    <div className="flex items-center justify-end gap-1 min-w-0">
                      <input
                        value={customFieldName}
                        onChange={(e) => setCustomFieldName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomField(); } }}
                        placeholder="Nuevo campo"
                        className="w-32 sm:w-40 px-2 py-1.5 border border-surface-200 bg-white rounded-md text-xs focus:outline-none focus:border-surface-400"
                      />
                      <button type="button" onClick={addCustomField} className="p-1.5 rounded-md bg-surface-800 text-white hover:bg-surface-700" title="Agregar campo">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      </button>
                    </div>

                    <div className="rounded-md border border-surface-200 bg-white divide-y divide-surface-100">
                    {modalFields.filter(col => !col.custom).map((col) => {
                      const isRenaming = editingCustomField === col.id;
                      return (
                        <div key={col.id} className="flex items-center gap-2 px-2 py-1.5">
                          {isRenaming ? (
                            <input
                              autoFocus
                              value={editingCustomFieldName}
                              onChange={(e) => setEditingCustomFieldName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); renameCustomField(col.id); } if (e.key === "Escape") setEditingCustomField(null); }}
                              className="min-w-0 flex-1 px-2 py-1 border border-primary-300 rounded-md text-[11px] focus:outline-none focus:ring-1 focus:ring-primary-400"
                            />
                          ) : (
                            <span className="min-w-0 flex-1 truncate text-xs text-surface-600">{col.label}</span>
                          )}
                          {isRenaming ? (
                            <>
                              <button type="button" onClick={() => renameCustomField(col.id)} className="p-1 rounded text-emerald-600 hover:bg-emerald-50" title="Guardar nombre">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                              </button>
                              <button type="button" onClick={() => setEditingCustomField(null)} className="p-1 rounded text-surface-400 hover:bg-surface-100" title="Cancelar">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" onClick={() => { setEditingCustomField(col.id); setEditingCustomFieldName(col.label); }} className="p-1 rounded text-surface-400 hover:text-primary-600 hover:bg-surface-50" title="Editar campo">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                              </button>
                              {col.id !== "nombre" && (
                                <button type="button" onClick={() => setConfirmDelete({ type: "custom-field", id: col.id, label: col.label })} className="p-1 rounded text-surface-400 hover:text-red-500 hover:bg-surface-50" title="Quitar campo">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {columns.filter(col => col.custom).length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {columns.filter(col => col.custom).map(col => {
                        const key = col.field.replace("_custom_", "");
                        const isRenaming = editingCustomField === col.id;
                        return (
                          <div key={col.id} className="space-y-1">
                            <div className="flex items-center gap-1">
                              {isRenaming ? (
                                <input
                                  autoFocus
                                  value={editingCustomFieldName}
                                  onChange={(e) => setEditingCustomFieldName(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); renameCustomField(col.id); } if (e.key === "Escape") setEditingCustomField(null); }}
                                  className="min-w-0 flex-1 px-2 py-1 border border-primary-300 bg-white rounded-md text-[11px] focus:outline-none focus:ring-1 focus:ring-primary-400"
                                />
                              ) : (
                                <label className="min-w-0 flex-1 truncate text-[10px] font-medium text-surface-500 uppercase tracking-wider">{col.label}</label>
                              )}
                              {isRenaming ? (
                                <>
                                  <button type="button" onClick={() => renameCustomField(col.id)} className="p-1 rounded text-emerald-600 hover:bg-emerald-50" title="Guardar nombre">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                  </button>
                                  <button type="button" onClick={() => setEditingCustomField(null)} className="p-1 rounded text-surface-400 hover:bg-surface-100" title="Cancelar">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button type="button" onClick={() => { setEditingCustomField(col.id); setEditingCustomFieldName(col.label); }} className="p-1 rounded text-surface-400 hover:text-primary-600 hover:bg-white" title="Editar campo">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                                  </button>
                                  <button type="button" onClick={() => setConfirmDelete({ type: "custom-field", id: col.id, label: col.label })} className="p-1 rounded text-surface-400 hover:text-red-500 hover:bg-white" title="Quitar campo">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                  </button>
                                </>
                              )}
                            </div>
                            <input
                              value={form.camposExtra[key] || ""}
                              onChange={(e) => setForm({ ...form, camposExtra: { ...form.camposExtra, [key]: e.target.value } })}
                              className="w-full px-3 py-2 border border-surface-200 bg-white rounded-md text-xs focus:outline-none focus:border-surface-400"
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-surface-400">Sin campos personalizados.</p>
                  )}
                    </div>
                  )}
                </div>
              )}
              {hasStockField("notas") && (
              <div>
                <label className="block text-[10px] font-medium text-surface-500 uppercase tracking-wider mb-1">{stockFieldLabel("notas", "Notas")}</label>
                <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Agregar notas..." rows={2} className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={closeStockPanel} className="px-4 py-2.5 sm:py-2 text-sm sm:text-xs text-surface-600 hover:bg-surface-100 rounded-md">Cancelar</button>
              <button type="submit" className="px-4 py-2.5 sm:py-2 text-sm sm:text-xs bg-surface-800 text-white rounded-md hover:bg-surface-700 font-medium">
                {editingEquipo || duplicateEquipo ? "Guardar cambios" : "Crear"}
              </button>
            </div>
            </>
            )}
          </motion.form>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Modal serial duplicado */}
      <AnimatePresence>
      {showDuplicateModal && duplicateEquipo && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-lg shadow-xl p-5 w-full max-w-md mx-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              </div>
              <h3 className="text-sm font-semibold text-surface-800">Serial ya existente</h3>
            </div>
            <p className="text-xs text-surface-500 mb-3">
              El serial <strong className="text-surface-800">{duplicateEquipo.numeroSerie}</strong> ya existe con estos datos:
            </p>
            <div className="bg-surface-50 rounded-md p-3 mb-4 space-y-1.5">
              <div className="flex justify-between text-xs"><span className="text-surface-400">Equipo:</span> <span className="font-medium">{duplicateEquipo.nombre || "—"}</span></div>
              <div className="flex justify-between text-xs"><span className="text-surface-400">Modelo:</span> <span className="font-medium">{duplicateEquipo.modelo || "—"}</span></div>
              <div className="flex justify-between text-xs"><span className="text-surface-400">Estado:</span> <Badge variant="secondary" className={`text-[10px] ${ESTADO_COLORS[duplicateEquipo.estado] || ""}`}>{(duplicateEquipo.estado || "").replace(/_/g, " ")}</Badge></div>
              <div className="flex justify-between text-xs"><span className="text-surface-400">Ubicación:</span> <span className="font-medium">{duplicateEquipo.ubicacion || "—"}</span></div>
              {duplicateEquipo.asignado && <div className="flex justify-between text-xs"><span className="text-surface-400">Asignado:</span> <span className="font-medium">{duplicateEquipo.asignado.nombre}</span></div>}
            </div>
            <p className="text-xs text-surface-500 mb-4">¿Querés cargar estos datos para modificarlos?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowDuplicateModal(false); setDuplicateEquipo(null); setForm(f => ({ ...f, numeroSerie: "" })); }} className="px-3 py-1.5 text-xs text-surface-600 hover:bg-surface-100 rounded-md">
                Cancelar
              </button>
              <button onClick={handleLoadDuplicate} className="px-3 py-1.5 text-xs bg-surface-800 text-white rounded-md hover:bg-surface-700 font-medium">
                Sí, modificar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Modal reporte resumen */}
      <AnimatePresence>
      {showReportModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
        >
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white rounded-t-2xl sm:rounded-lg shadow-xl p-5 sm:p-6 w-full sm:max-w-2xl sm:mx-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-surface-800 flex items-center gap-2"><svg className="w-5 h-5 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" /></svg> Resumen de Stock</h2>
              <button onClick={() => setShowReportModal(false)} className="p-1 hover:bg-surface-100 rounded-md text-surface-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Total */}
            <div className="bg-surface-50 border border-surface-200 rounded-lg p-4 text-center mb-5">
              <p className="text-[10px] text-surface-400 uppercase tracking-wider">Total de equipos</p>
              <p className="text-3xl font-bold text-surface-800">{stockSummary.totalItems}</p>
            </div>

            {/* Por estado */}
            <h3 className="text-xs font-semibold text-surface-600 uppercase tracking-wider mb-2">Por Estado</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
              {Object.entries(stockSummary.porEstado).sort((a, b) => b[1] - a[1]).map(([estado, cantidad]) => (
                <div key={estado} className="bg-surface-50 rounded-lg p-3 border border-surface-100">
                  <Badge variant="secondary" className={`text-[9px] mb-1 ${ESTADO_COLORS[estado.replace(/ /g, "_")] || "bg-gray-100 text-gray-600"}`}>{estado}</Badge>
                  <p className="text-lg font-bold text-surface-800">{cantidad}</p>
                </div>
              ))}
            </div>

            {/* Por tipo/nombre de equipo */}
            <h3 className="text-xs font-semibold text-surface-600 uppercase tracking-wider mb-2">Por Tipo de Equipo</h3>
            <div className="bg-surface-50 rounded-lg border border-surface-100 overflow-hidden mb-5">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-200">
                    <th className="text-left px-3 py-2 text-surface-400 font-medium">Equipo</th>
                    <th className="text-left px-3 py-2 text-surface-400 font-medium">Estado</th>
                    <th className="text-right px-3 py-2 text-surface-400 font-medium">Cant.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {Object.entries(stockSummary.porNombre)
                    .sort((a, b) => Object.values(b[1]).reduce((s, n) => s + n, 0) - Object.values(a[1]).reduce((s, n) => s + n, 0))
                    .map(([nombre, estados]) =>
                    Object.entries(estados).map(([estado, cantidad], idx) => (
                      <tr key={`${nombre}-${estado}`}>
                        <td className={`px-3 py-1.5 ${idx === 0 ? "font-medium text-surface-800" : "text-transparent"}`}>{nombre}</td>
                        <td className="px-3 py-1.5 text-surface-600">{estado}</td>
                        <td className="px-3 py-1.5 text-right font-bold text-surface-800">{cantidad}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Por ubicación */}
            <h3 className="text-xs font-semibold text-surface-600 uppercase tracking-wider mb-2">Por Ubicación</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
              {Object.entries(stockSummary.porUbicacion).sort((a, b) => b[1] - a[1]).map(([ubicacion, cantidad]) => (
                <div key={ubicacion} className="bg-surface-50 rounded-lg p-3 border border-surface-100">
                  <p className="text-[10px] text-surface-400 truncate">{ubicacion}</p>
                  <p className="text-lg font-bold text-surface-800">{cantidad}</p>
                </div>
              ))}
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
              <button
                onClick={exportSummaryToExcel}
                className="px-4 py-2 text-xs bg-surface-800 text-white rounded-md hover:bg-surface-700 font-medium flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                Exportar reporte a Excel
              </button>
              <button onClick={() => setShowReportModal(false)} className="px-4 py-2 text-xs text-surface-600 hover:bg-surface-100 rounded-md">
                Cerrar
              </button>
            </div>
          </motion.div>
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
                {confirmDelete.type === "bulk" ? "Eliminar todo el stock" : confirmDelete.type === "custom-field" ? "Quitar campo" : "Eliminar equipo"}
              </h3>
            </div>
            <p className="text-xs text-surface-500 mb-4">
              {confirmDelete.type === "bulk"
                ? `¿Estás seguro de eliminar los ${total} equipos del stock? Se guardarán en la papelera.`
                : confirmDelete.type === "custom-field"
                  ? `¿Quitar el campo "${confirmDelete.label}" de stock? No se eliminarán los equipos.`
                  : `¿Eliminar "${confirmDelete.nombre}"? Se guardará en la papelera.`}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 text-xs text-surface-600 hover:bg-surface-100 rounded-md">
                Cancelar
              </button>
              <button
                onClick={() => confirmDelete.type === "bulk" ? eliminarTodoStock() : confirmDelete.type === "custom-field" ? removeCustomField(confirmDelete.id).then(() => setConfirmDelete(null)) : eliminarEquipo(confirmDelete.id)}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 font-medium"
              >
                {confirmDelete.type === "custom-field" ? "Quitar" : "Eliminar"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </motion.div>
  );
}

function StockAlertsPanel({ data, loading }: { data: any; loading: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="mb-4">
        <div className="h-14 rounded-lg border border-surface-200 bg-white animate-pulse md:hidden" />
        <div className="hidden grid-cols-1 gap-3 md:grid xl:grid-cols-3">
          {[...Array(3)].map((_, index) => <div key={index} className="h-24 bg-white border border-surface-200 rounded-lg animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const topTipos = (data.tipos || []).slice(0, 5);
  const topAsignados = (data.asignados || []).slice(0, 5);

  return (
    <>
    <section className="mb-3 overflow-hidden rounded-lg border border-surface-200 bg-white md:hidden">
      <button
        type="button"
        onClick={() => setMobileOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
        aria-expanded={mobileOpen}
      >
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-500">Resumen de stock</h2>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-surface-500">
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">{data.resumen.disponible} disp.</span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">{data.resumen.noOperativo} no op.</span>
            <span className="rounded-full bg-surface-100 px-2 py-0.5 font-medium text-surface-600">{data.resumen.sinSerie} sin N/S</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`text-xl font-semibold tabular-nums ${data.resumen.alertas > 0 ? "text-amber-600" : "text-emerald-600"}`}>{data.resumen.alertas}</span>
          <svg className={`h-4 w-4 text-surface-400 transition-transform ${mobileOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {mobileOpen && (
        <div className="border-t border-surface-100 px-3 pb-3 pt-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <StockMiniStat label="Disponible" value={data.resumen.disponible} tone="ok" />
            <StockMiniStat label="No operativo" value={data.resumen.noOperativo} tone="warn" />
            <StockMiniStat label="Sin N/S" value={data.resumen.sinSerie} tone="muted" />
          </div>

          <details className="mt-3 rounded-lg border border-surface-100 bg-surface-50/60" open={data.resumen.alertas > 0}>
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase tracking-wider text-surface-500">Minimos por tipo</summary>
            <div className="space-y-2 px-3 pb-3">
              {topTipos.map((item: any) => (
                <div key={`mobile-${item.tipo}`} className="flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-surface-700">{item.tipo}</p>
                    <p className="text-[11px] text-surface-400">Disp. {item.disponible} / min. {item.minimo}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${item.alerta ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {item.alerta ? `Faltan ${item.faltante}` : "OK"}
                  </span>
                </div>
              ))}
            </div>
          </details>

          <details className="mt-2 rounded-lg border border-surface-100 bg-surface-50/60">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase tracking-wider text-surface-500">Stock por asignacion</summary>
            <div className="space-y-2 px-3 pb-3">
              {topAsignados.map((item: any) => (
                <div key={`mobile-${item.key}`} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-surface-600">{item.nombre}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-surface-800">{item.total}</span>
                </div>
              ))}
              {topAsignados.length === 0 && <p className="text-xs text-surface-400">Sin stock asignado</p>}
            </div>
          </details>
        </div>
      )}
    </section>

    <div className="mb-4 hidden grid-cols-1 gap-3 md:grid xl:grid-cols-3">
      <section className="bg-white border border-surface-200 rounded-lg p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Alertas de stock</h2>
            <p className="text-[11px] text-surface-400 mt-1">Minimos sugeridos por tipo</p>
          </div>
          <span className={`text-2xl font-semibold tabular-nums ${data.resumen.alertas > 0 ? "text-amber-600" : "text-emerald-600"}`}>{data.resumen.alertas}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <StockMiniStat label="Disponible" value={data.resumen.disponible} tone="ok" />
          <StockMiniStat label="No operativo" value={data.resumen.noOperativo} tone="warn" />
          <StockMiniStat label="Sin N/S" value={data.resumen.sinSerie} tone="muted" />
        </div>
      </section>

      <section className="bg-white border border-surface-200 rounded-lg p-4">
        <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Minimos por tipo</h2>
        <div className="space-y-2">
          {topTipos.map((item: any) => (
            <div key={item.tipo} className="flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <p className="font-medium text-surface-700 truncate">{item.tipo}</p>
                <p className="text-[11px] text-surface-400">Disp. {item.disponible} / min. {item.minimo}</p>
              </div>
              <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ${item.alerta ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                {item.alerta ? `Faltan ${item.faltante}` : "OK"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border border-surface-200 rounded-lg p-4">
        <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Stock por asignacion</h2>
        <div className="space-y-2">
          {topAsignados.map((item: any) => (
            <div key={item.key} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-surface-600 truncate">{item.nombre}</span>
              <span className="font-semibold text-surface-800 tabular-nums shrink-0">{item.total}</span>
            </div>
          ))}
          {topAsignados.length === 0 && <p className="text-xs text-surface-400">Sin stock asignado</p>}
        </div>
      </section>
    </div>
    </>
  );
}

function StockMiniStat({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" | "muted" }) {
  const toneClass = tone === "ok" ? "text-emerald-600 bg-emerald-50" : tone === "warn" ? "text-amber-600 bg-amber-50" : "text-surface-600 bg-surface-50";
  return (
    <div className="rounded-md border border-surface-100 p-2">
      <p className={`inline-flex px-1.5 py-0.5 rounded text-sm font-semibold tabular-nums ${toneClass}`}>{value}</p>
      <p className="text-[10px] text-surface-400 mt-1 truncate">{label}</p>
    </div>
  );
}
