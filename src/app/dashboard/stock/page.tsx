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
import * as XLSX from "xlsx";

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
  { id: "modelo",      label: "Modelo",      field: "modelo",      visible: true,  editable: true,  type: "text" },
  { id: "numeroSerie", label: "N/S",         field: "numeroSerie", visible: true,  editable: true,  type: "text" },
  { id: "estado",      label: "Estado",       field: "estado",      visible: true,  editable: true,  type: "select", options: ESTADOS_EQUIPO },
  { id: "asignado",    label: "Asignado",     field: "asignadoId",  visible: true,  editable: true,  type: "select" },
  { id: "ubicacion",   label: "Ubicación",    field: "ubicacion",   visible: true,  editable: true,  type: "select", options: ["", "THNET", "Dinatech"] },
  { id: "fecha",       label: "Fecha",        field: "fecha",       visible: true,  editable: true,  type: "text" },
  { id: "proveedor",   label: "Proveedor",    field: "proveedor",   visible: true,  editable: true,  type: "select", options: ["", "OCP", "DINATECH"] },
  { id: "notas",       label: "Notas",        field: "notas",       visible: false, editable: true,  type: "text" },
  { id: "descripcion", label: "Descripción",  field: "descripcion", visible: false, editable: true,  type: "text" },
];

export default function StockPage() {
  const { isModOrAdmin, isAdmin } = useSession();
  const { headerSearch } = useSearchContext();
  const [equipos, setEquipos] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => { if (headerSearch !== undefined) setSearch(headerSearch); }, [headerSearch]);
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [filterMenuField, setFilterMenuField] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ nombre: "", descripcion: "", numeroSerie: "", modelo: "", estado: "DISPONIBLE", ubicacion: "", notas: "", asignadoId: "", fecha: "", proveedor: "" });

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

  /* ── Export & Report ── */
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  /* ── Duplicate serial detection ── */
  const [duplicateEquipo, setDuplicateEquipo] = useState<any | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

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
  const [sortConfig, setSortConfig] = useState<{ field: string; dir: "asc" | "desc" } | null>(null);

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
    const res = await fetch(`/api/stock?${params}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setEquipos(data.equipos || []);
      setTotal(data.total || 0);
    }
    setLoading(false);
  }, [search]);

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
      setForm({ nombre: "", descripcion: "", numeroSerie: "", modelo: "", estado: "DISPONIBLE", ubicacion: "", notas: "", asignadoId: "", fecha: "", proveedor: "" });
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
      setForm({ nombre: "", descripcion: "", numeroSerie: "", modelo: "", estado: "DISPONIBLE", ubicacion: "", notas: "", asignadoId: "", fecha: "", proveedor: "" });
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
  function exportStock(format: "csv" | "xlsx") {
    const data = sortedEquipos.map((eq: any) => {
      let fecha = eq.fecha || "";
      // Normalizar fecha a DD/MM/AAAA en la exportación
      if (fecha) {
        const isoMatch = fecha.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
        if (isoMatch) fecha = `${isoMatch[3].padStart(2, "0")}/${isoMatch[2].padStart(2, "0")}/${isoMatch[1]}`;
      }
      return {
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

  function exportSummaryToExcel() {
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
    const val = eq[col.field];
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
                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-surface-200 rounded-lg shadow-lg overflow-hidden min-w-[160px]">
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
            <button onClick={() => { setDuplicateEquipo(null); const hoy = new Date(); const dd = String(hoy.getDate()).padStart(2,"0"); const mm = String(hoy.getMonth()+1).padStart(2,"0"); const yyyy = hoy.getFullYear(); setForm({ nombre: "", descripcion: "", numeroSerie: "", modelo: "", estado: "DISPONIBLE", ubicacion: "", notas: "", asignadoId: "", fecha: `${dd}/${mm}/${yyyy}`, proveedor: "" }); setShowModal(true); }} className="px-3 py-1.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 transition-colors flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Agregar equipo
            </button>
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
              <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-1 z-50 bg-white border border-surface-200 rounded-lg shadow-xl overflow-hidden w-64">
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
        ) : sortedEquipos.length === 0 ? (
          <div className="text-center py-16 text-surface-400">
            <svg className="w-10 h-10 mx-auto mb-3 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
            <p className="text-sm font-medium mb-1">Sin equipos</p>
            <p className="text-xs mb-4">{search || hasActiveFilters ? "No se encontraron resultados" : "Agrega tu primer equipo al inventario"}</p>
            {!search && !hasActiveFilters && isModOrAdmin && (
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

      {/* Modal crear/editar equipo */}
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
            onSubmit={duplicateEquipo ? handleUpdateDuplicate : handleCreate}
            className="bg-white rounded-t-2xl sm:rounded-lg shadow-xl p-5 sm:p-6 w-full sm:max-w-lg sm:mx-4 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-base font-semibold text-surface-800 mb-4">
              {duplicateEquipo ? "Modificar Equipo" : "Agregar Equipo"}
            </h2>
            {duplicateEquipo && (
              <div className="mb-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-[11px] text-yellow-700">⚠️ Editando equipo existente con serial <strong>{duplicateEquipo.numeroSerie}</strong></p>
              </div>
            )}
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
                }} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} onBlur={handleSerialBlur} placeholder="Número de serie" className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" disabled={!!duplicateEquipo} />
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
                <select value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} className="px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400">
                  <option value="">— Vacío (predio) —</option>
                  <option value="THNET">THNET</option>
                  <option value="Dinatech">Dinatech</option>
                </select>
                <input value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} placeholder="Fecha" className="px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              </div>
              <select value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400">
                <option value="">Sin proveedor</option>
                <option value="OCP">OCP</option>
                <option value="DINATECH">DINATECH</option>
              </select>
              <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Notas" rows={2} className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => { setShowModal(false); setDuplicateEquipo(null); }} className="px-4 py-2.5 sm:py-2 text-sm sm:text-xs text-surface-600 hover:bg-surface-100 rounded-md">Cancelar</button>
              <button type="submit" className="px-4 py-2.5 sm:py-2 text-sm sm:text-xs bg-surface-800 text-white rounded-md hover:bg-surface-700 font-medium">
                {duplicateEquipo ? "Guardar cambios" : "Crear"}
              </button>
            </div>
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
