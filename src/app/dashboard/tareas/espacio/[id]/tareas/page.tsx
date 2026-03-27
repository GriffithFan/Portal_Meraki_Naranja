"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { useSession } from "@/hooks/useSession";
import Link from "next/link";
import TareaDetalleModal from "@/components/TareaDetalleModal";
import StatusIcon from "@/components/StatusIcon";
import { obtenerProvincia } from "@/utils/provinciaUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Iconos ──────────────────────────────────────────
const ChevronIcon = ({ expanded, className = "w-3.5 h-3.5" }: { expanded?: boolean; className?: string }) => (
  <svg className={`${className} transition-transform text-surface-400 ${expanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);

const IconSettings = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const IconX = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const IconSort = ({ dir }: { dir: "asc" | "desc" }) => (
  <svg className="w-3 h-3 text-primary-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d={dir === "asc" ? "M4.5 15.75l7.5-7.5 7.5 7.5" : "M19.5 8.25l-7.5 7.5-7.5-7.5"} />
  </svg>
);

// ── Columnas ────────────────────────────────────────
interface Column {
  id: string;
  label: string;
  field: string;
  width: number;
  visible: boolean;
  editable: boolean;
  type: "text" | "badge" | "date" | "select";
  options?: string[];
}

const DEFAULT_COLUMNS: Column[] = [
  { id: "codigoPredio", label: "Predio", field: "codigo", width: 100, visible: true, editable: false, type: "text" },
  { id: "predio", label: "Incidencia", field: "incidencias", width: 140, visible: true, editable: false, type: "text" },
  { id: "fechaActualizacion", label: "Fecha", field: "fechaActualizacion", width: 80, visible: true, editable: false, type: "date" },
  { id: "lacR", label: "LAC-R", field: "lacR", width: 70, visible: true, editable: true, type: "badge", options: ["SI", "NO"] },
  { id: "cue", label: "CUE", field: "cue", width: 100, visible: true, editable: true, type: "text" },
  { id: "fechaDesde", label: "DESDE", field: "fechaDesde", width: 90, visible: true, editable: true, type: "date" },
  { id: "fechaHasta", label: "HASTA", field: "fechaHasta", width: 90, visible: true, editable: true, type: "date" },
  { id: "ambito", label: "Ámbito", field: "ambito", width: 80, visible: true, editable: true, type: "select", options: ["Urbano", "Rural"] },
  { id: "equipoAsignado", label: "Equipo", field: "equipoAsignado", width: 70, visible: true, editable: true, type: "text" },
  { id: "asignados", label: "Asignados", field: "asignaciones", width: 120, visible: true, editable: false, type: "text" },
  { id: "provincia", label: "Provincia", field: "provincia", width: 100, visible: true, editable: true, type: "text" },
  { id: "cuePredio", label: "CUE_Predio", field: "cuePredio", width: 100, visible: true, editable: true, type: "text" },
  { id: "latitud", label: "Latitud", field: "latitud", width: 100, visible: true, editable: true, type: "text" },
  { id: "longitud", label: "Longitud", field: "longitud", width: 100, visible: true, editable: true, type: "text" },
  { id: "gpsPredio", label: "GPS", field: "gpsPredio", width: 120, visible: false, editable: true, type: "text" },
  { id: "tipoRed", label: "Tipo de Red", field: "tipoRed", width: 100, visible: false, editable: true, type: "text" },
  { id: "codigoPostal", label: "Cód. Postal", field: "codigoPostal", width: 90, visible: false, editable: true, type: "text" },
  { id: "caracteristicaTelefonica", label: "Car. Tel.", field: "caracteristicaTelefonica", width: 80, visible: false, editable: true, type: "text" },
  { id: "telefono", label: "Teléfono", field: "telefono", width: 100, visible: false, editable: true, type: "text" },
  { id: "lab", label: "LAB", field: "lab", width: 70, visible: false, editable: true, type: "text" },
  { id: "nombreInstitucion", label: "Institución", field: "nombreInstitucion", width: 140, visible: false, editable: true, type: "text" },
  { id: "correo", label: "Correo", field: "correo", width: 140, visible: false, editable: true, type: "text" },
];

const LS_COL_KEY = "pmn-espacio-col-config";
const LS_EMPTY_KEY = "pmn-espacio-show-empty";
const LS_HIDDEN_KEY = "pmn-espacio-hidden-estados";

const GROUP_BY_OPTIONS = [
  { value: "estado", label: "Estado" },
  { value: "provincia", label: "Provincia" },
  { value: "asignados", label: "Persona asignada" },
  { value: "lacR", label: "LAC-R" },
  { value: "equipoAsignado", label: "Equipo" },
  { value: "ambito", label: "Ámbito" },
  { value: "ciudad", label: "Departamento" },
];

export default function EspacioTareasPage() {
  const params = useParams();
  const espacioId = params.id as string;
  const { session, isModOrAdmin } = useSession();
  const [selectedTareaId, setSelectedTareaId] = useState<string | null>(null);

  const [espacio, setEspacio] = useState<any>(null);
  const [tareas, setTareas] = useState<any[]>([]);
  const [estados, setEstados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ field: string; dir: "asc" | "desc" } | null>(null);
  const [groupBy, setGroupBy] = useState("estado");

  // Columnas configurables
  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
  const [showColumnConfig, setShowColumnConfig] = useState(false);

  // Drag & drop columnas
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const didDragRef = useRef(false);

  // Persistir columnas
  const colConfigLoaded = useRef(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_COL_KEY);
      if (saved) {
        const config: { id: string; visible: boolean; order: number }[] = JSON.parse(saved);
        setColumns(prev => {
          const orderMap = new Map(config.map((c, i) => [c.id, { visible: c.visible, order: i }]));
          return [...prev]
            .map(col => {
              const cfg = orderMap.get(col.id);
              return cfg ? { ...col, visible: cfg.visible } : col;
            })
            .sort((a, b) => {
              const oa = orderMap.get(a.id)?.order ?? 999;
              const ob = orderMap.get(b.id)?.order ?? 999;
              return oa - ob;
            });
        });
      }
    } catch { /* ignore */ }
    colConfigLoaded.current = true;
  }, []);

  useEffect(() => {
    if (!colConfigLoaded.current) return;
    const config = columns.map((c, i) => ({ id: c.id, visible: c.visible, order: i }));
    localStorage.setItem(LS_COL_KEY, JSON.stringify(config));
  }, [columns]);

  // Mostrar/ocultar estados vacíos
  const [showEmptyStates, setShowEmptyStates] = useState(false);
  // Estados ocultos por el usuario
  const [userHiddenEstados, setUserHiddenEstados] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const se = localStorage.getItem(LS_EMPTY_KEY);
      if (se !== null) setShowEmptyStates(se === "true");
      const sh = localStorage.getItem(LS_HIDDEN_KEY);
      if (sh) setUserHiddenEstados(new Set(JSON.parse(sh)));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_EMPTY_KEY, String(showEmptyStates));
  }, [showEmptyStates]);

  useEffect(() => {
    localStorage.setItem(LS_HIDDEN_KEY, JSON.stringify(Array.from(userHiddenEstados)));
  }, [userHiddenEstados]);

  // Cargar campos personalizados como columnas
  useEffect(() => {
    fetch("/api/campos-personalizados", { credentials: "include" })
      .then(r => r.ok ? r.json() : { campos: [] })
      .then(d => {
        const campos = d.campos || [];
        if (campos.length > 0) {
          setColumns(prev => {
            const existingIds = new Set(prev.map(c => c.id));
            const newCols = campos
              .filter((c: any) => !existingIds.has(`custom_${c.clave}`))
              .map((c: any) => ({
                id: `custom_${c.clave}`,
                label: c.nombre,
                field: `_custom_${c.clave}`,
                width: c.ancho || 100,
                visible: true,
                editable: true,
                type: (c.tipo || "text") as "text" | "badge" | "date" | "select",
                options: c.opciones?.length ? c.opciones : undefined,
              }));
            return newCols.length > 0 ? [...prev, ...newCols] : prev;
          });
        }
      })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [tareasRes, estadosRes, espacioRes] = await Promise.all([
      fetch(`/api/tareas?espacioId=${espacioId}&limit=2000`, { credentials: "include" }),
      fetch("/api/estados", { credentials: "include" }),
      fetch(`/api/espacios/${espacioId}`, { credentials: "include" }),
    ]);

    if (tareasRes.ok) {
      const d = await tareasRes.json();
      setTareas(d.predios || []);
    }
    if (estadosRes.ok) {
      const d = await estadosRes.json();
      const est = d.estados || [];
      setEstados(est);
      setExpandedSections(new Set([...est.map((e: any) => e.id), "sin-estado"]));
    }
    if (espacioRes.ok) {
      const d = await espacioRes.json();
      setEspacio(d.espacio);
    }

    setLoading(false);
  }, [espacioId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Agrupar tareas por estado o campo
  const groupedTareas = useMemo(() => {
    let filtered = tareas;
    if (search) {
      const s = search.toLowerCase();
      filtered = tareas.filter((t) => {
        const prov = obtenerProvincia(t.provincia, t.codigo);
        if (
          t.nombre?.toLowerCase().includes(s) ||
          t.incidencias?.toLowerCase().includes(s) ||
          t.cue?.toLowerCase().includes(s) ||
          prov.toLowerCase().includes(s) ||
          t.equipoAsignado?.toLowerCase().includes(s) ||
          (t.camposExtra && Object.values(t.camposExtra).some((v: any) => String(v).toLowerCase().includes(s)))
        ) return true;
        return false;
      });
    }

    if (sortConfig) {
      filtered = [...filtered].sort((a, b) => {
        let aVal, bVal;
        if (sortConfig.field.startsWith("_custom_")) {
          const clave = sortConfig.field.substring(8);
          aVal = a.camposExtra?.[clave] ?? "";
          bVal = b.camposExtra?.[clave] ?? "";
        } else {
          aVal = a[sortConfig.field] ?? "";
          bVal = b[sortConfig.field] ?? "";
        }
        const cmp = String(aVal).localeCompare(String(bVal), "es", { numeric: true });
        return sortConfig.dir === "asc" ? cmp : -cmp;
      });
    }

    // Agrupación por estado (default)
    if (groupBy === "estado") {
      const groups: Record<string, any[]> = {};
      const orderedEstados = [...estados].sort((a, b) => a.orden - b.orden);
      for (const estado of orderedEstados) groups[estado.id] = [];
      groups["sin-estado"] = [];
      for (const t of filtered) {
        const eid = t.estadoId || "sin-estado";
        if (groups[eid]) groups[eid].push(t);
        else groups["sin-estado"].push(t);
      }
      return groups;
    }

    // Agrupación por campo
    const groups: Record<string, any[]> = {};
    for (const t of filtered) {
      let key: string;
      if (groupBy === "asignados") {
        key = t.asignaciones?.length > 0
          ? t.asignaciones.map((a: any) => a.usuario?.nombre || "?").join(", ")
          : "Sin asignar";
      } else if (groupBy === "provincia") {
        key = obtenerProvincia(t.provincia, t.codigo) || "Sin provincia";
      } else {
        key = t[groupBy] || "Sin valor";
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }
    const sorted: Record<string, any[]> = {};
    for (const k of Object.keys(groups).sort((a, b) => a.localeCompare(b, "es"))) {
      sorted[k] = groups[k];
    }
    return sorted;
  }, [tareas, estados, search, sortConfig, groupBy]);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSort = (field: string) => {
    setSortConfig(prev => {
      if (prev?.field === field) {
        return prev.dir === "asc" ? { field, dir: "desc" } : null;
      }
      return { field, dir: "asc" };
    });
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  };

  // Drag & drop columnas
  function handleColDragStart(e: React.DragEvent, colId: string) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/x-col-id", colId);
    didDragRef.current = false;
    setDragColId(colId);
  }

  function handleColDragOver(e: React.DragEvent, colId: string) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    didDragRef.current = true;
    setDragOverColId(colId);
  }

  function handleColDrop(e: React.DragEvent, colId: string) {
    e.preventDefault();
    e.stopPropagation();
    const sourceColId = e.dataTransfer.getData("text/x-col-id");
    didDragRef.current = true;

    if (!sourceColId || sourceColId === colId) {
      setDragColId(null);
      setDragOverColId(null);
      return;
    }

    setColumns(prev => {
      const newCols = [...prev];
      const fromIdx = newCols.findIndex(c => c.id === sourceColId);
      const toIdx = newCols.findIndex(c => c.id === colId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = newCols.splice(fromIdx, 1);
      newCols.splice(toIdx, 0, moved);
      return newCols;
    });

    setDragColId(null);
    setDragOverColId(null);
  }

  function handleColDragEnd() {
    setDragColId(null);
    setDragOverColId(null);
    setTimeout(() => { didDragRef.current = false; }, 0);
  }

  // Guardar campo inline (desde la tabla, sin abrir detalle)
  async function saveCellField(tareaId: string, field: string, value: string) {
    const res = await fetch(`/api/tareas/${tareaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      setTareas(prev => prev.map(t => t.id === tareaId ? { ...t, [field]: value } : t));
    }
  }

  // Render de celda
  const renderCell = (t: any, col: Column) => {
    if (col.field.startsWith("_custom_")) {
      const clave = col.field.substring(8);
      const val = t.camposExtra?.[clave];
      if (!val) return <span className="text-surface-300">&mdash;</span>;
      return <span className="text-surface-700 truncate block">{val}</span>;
    }
    if (col.id === "asignados") {
      const asigns = t.asignaciones || [];
      if (asigns.length === 0) return <span className="text-surface-300">&mdash;</span>;
      return (
        <span className="flex items-center gap-1 flex-wrap">
          {asigns.map((a: any) => (
            <span key={a.id} className="px-1.5 py-px bg-violet-50 text-violet-700 border border-violet-200 rounded text-[10px] font-medium truncate max-w-[80px]">
              {a.usuario?.nombre?.split(" ")[0] || "?"}
            </span>
          ))}
        </span>
      );
    }
    if (col.type === "date") return formatDate(t[col.field]);
    if (col.type === "badge" && col.id === "lacR") {
      const val = t[col.field]?.toUpperCase() || "";
      if (isModOrAdmin) {
        return (
          <select
            value={val}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { e.stopPropagation(); saveCellField(t.id, col.field, e.target.value); }}
            className={`text-[10px] font-semibold rounded px-1.5 py-0.5 border cursor-pointer focus:outline-none focus:ring-1 focus:ring-surface-300 ${
              val === "SI" ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
              val === "NO" ? "bg-red-50 text-red-500 border-red-200" :
              "bg-surface-50 text-surface-400 border-surface-200"
            }`}
          >
            <option value="">\u2014</option>
            <option value="SI">SI</option>
            <option value="NO">NO</option>
          </select>
        );
      }
      return val ? (
        <span className={`px-1.5 py-px rounded text-[10px] font-semibold ${val === "SI" ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-red-50 text-red-500 border border-red-200"}`}>
          {val}
        </span>
      ) : <span className="text-surface-300">&mdash;</span>;
    }
    if (col.type === "badge") {
      return t[col.field] ? (
        <span className={`px-1.5 py-px rounded text-[10px] font-semibold ${t[col.field]?.toUpperCase() === "SI" ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-red-50 text-red-500 border border-red-200"}`}>
          {t[col.field]}
        </span>
      ) : <span className="text-surface-300">&mdash;</span>;
    }
    if (col.id === "codigoPredio") {
      return <span className="text-surface-800 font-medium truncate block">{t.codigo || "\u2014"}</span>;
    }
    if (col.id === "predio") {
      return <span className="text-surface-700 truncate block">{t[col.field] || t.nombre || "\u2014"}</span>;
    }
    if (col.id === "provincia") {
      const explicita = t.provincia;
      const autoDetected = obtenerProvincia(explicita, t.codigo);
      if (!explicita && autoDetected) {
        return <span className="text-surface-500 italic truncate block" title="Detectado automáticamente">{autoDetected}</span>;
      }
      return <span className="text-surface-700 truncate block">{autoDetected || "\u2014"}</span>;
    }
    const val = t[col.field];
    return <span className="text-surface-700 truncate block">{val != null && val !== "" ? String(val) : "\u2014"}</span>;
  };

  // Columnas visibles
  const ALWAYS_VISIBLE = useMemo(() => new Set(["codigoPredio", "predio", "fechaActualizacion", "asignados"]), []);
  const visibleColumns = useMemo(() => {
    return columns.filter(c => {
      if (!c.visible) return false;
      if (ALWAYS_VISIBLE.has(c.id)) return true;
      if (c.id.startsWith("custom_")) return true;
      return tareas.some((t: any) => {
        const v = t[c.field];
        return v != null && v !== "";
      });
    });
  }, [columns, tareas, ALWAYS_VISIBLE]);

  // Suprimir warning de session no usada
  void session;

  // Mobile cards
  const MobileTaskList = ({ items: taskItems }: { items: any[] }) => (
    <div className="md:hidden divide-y divide-surface-100">
      {taskItems.map((t) => (
        <button
          key={t.id}
          onClick={() => setSelectedTareaId(t.id)}
          className="w-full text-left px-3 py-3.5 hover:bg-surface-50 active:bg-surface-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            {t.codigo && <span className="text-sm font-semibold text-surface-800 tabular-nums">{t.codigo}</span>}
            <p className="text-sm font-medium text-surface-700 truncate">
              {t.incidencias || t.nombre || "Sin nombre"}
            </p>
          </div>
          <div className="flex items-center gap-2.5 mt-1.5 text-xs text-surface-500 flex-wrap">
            <span className="tabular-nums">{formatDate(t.fechaActualizacion)}</span>
            {t.lacR && (
              <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${t.lacR?.toUpperCase() === "SI" ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-red-50 text-red-500 border border-red-200"}`}>
                LAC-R: {t.lacR}
              </span>
            )}
            {t.equipoAsignado && (
              <span className="px-1.5 py-0.5 bg-primary-50 text-primary-700 rounded text-[11px] font-medium">{t.equipoAsignado}</span>
            )}
            {t.provincia && <span className="text-surface-400">{t.provincia}</span>}
          </div>
        </button>
      ))}
    </div>
  );

  // Tabla reutilizable
  const TaskTable = ({ items }: { items: any[] }) => (
    <div className="overflow-x-auto">
      <MobileTaskList items={items} />
      <table className="w-full min-w-max text-[11px] hidden md:table">
        <thead>
          <tr className="border-b border-surface-100">
            {visibleColumns.map((col) => (
              <th
                key={col.id}
                draggable
                onDragStart={(e) => handleColDragStart(e, col.id)}
                onDragOver={(e) => handleColDragOver(e, col.id)}
                onDrop={(e) => handleColDrop(e, col.id)}
                onDragEnd={handleColDragEnd}
                style={{ width: col.width, minWidth: col.width }}
                className={`text-left px-2.5 py-1.5 font-medium text-surface-400 uppercase text-[10px] tracking-wider cursor-grab active:cursor-grabbing hover:text-surface-600 transition-colors select-none ${
                  dragOverColId === col.id ? "border-l-2 border-surface-400" : ""
                } ${dragColId === col.id ? "opacity-40" : ""}`}
                onClick={() => { if (!didDragRef.current) toggleSort(col.field); }}
              >
                <span className="inline-flex items-center gap-0.5">
                  {col.label}
                  {sortConfig?.field === col.field && <IconSort dir={sortConfig.dir} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((t, idx) => (
            <tr
              key={t.id}
              onClick={() => setSelectedTareaId(t.id)}
              className={`cursor-pointer transition-colors hover:bg-surface-50 ${idx % 2 === 0 ? "" : "bg-surface-50/40"}`}
            >
              {visibleColumns.map((col) => (
                <td
                  key={col.id}
                  style={{ width: col.width, minWidth: col.width, maxWidth: col.width }}
                  className="px-2.5 py-1.5 text-surface-600"
                >
                  {renderCell(t, col)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (loading) {
    return (
      <div className="animate-fade-in-up space-y-4">
        <div className="h-7 w-52 bg-surface-200 rounded animate-pulse" />
        <div className="h-10 bg-surface-100 rounded animate-pulse" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-white border border-surface-200 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!espacio) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-surface-400 text-sm">
        Espacio no encontrado
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: espacio.color + "20" }}>
            <svg className="w-3 h-3" fill="none" stroke={espacio.color} strokeWidth={1.7} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </div>
          <h1 className="text-lg sm:text-xl font-semibold text-surface-800">{espacio.nombre}</h1>
          <span className="text-xs text-surface-400">{tareas.length} registros</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Search */}
          <div className="relative flex-1 sm:flex-initial">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full sm:w-56 pl-3 pr-8 py-1.5 border border-surface-200 rounded-md text-xs bg-white focus:outline-none focus:border-surface-400 placeholder:text-surface-300 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-300 hover:text-surface-500">
                <IconX className="w-3 h-3" />
              </button>
            )}
          </div>
          <select
            value={groupBy}
            onChange={e => setGroupBy(e.target.value)}
            className="text-[11px] border border-surface-200 rounded-md px-2 py-1.5 bg-white text-surface-600 focus:outline-none focus:border-surface-400"
            title="Agrupar por"
          >
            {GROUP_BY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            onClick={() => setShowColumnConfig(!showColumnConfig)}
            className={`p-1.5 rounded-md transition-colors ${showColumnConfig ? "bg-surface-200 text-surface-700" : "text-surface-400 hover:bg-surface-100 hover:text-surface-600"}`}
            title="Configuración"
          >
            <IconSettings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 mb-5 border-b border-surface-200">
        <Link
          href={`/dashboard/tareas/espacio/${espacio.id}`}
          className="text-xs text-surface-400 hover:text-surface-600 pb-2 px-1 transition-colors"
        >
          Resumen
        </Link>
        <span className="text-xs font-medium text-primary-600 border-b-2 border-primary-600 pb-2 px-1">
          Tareas ({tareas.length})
        </span>
      </div>

      {/* Config panel */}
      {showColumnConfig && (
        <div className="mb-4 p-3 bg-white border border-surface-200 rounded-lg space-y-3">
          <div>
            <p className="text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-2">Columnas</p>
            <div className="flex flex-wrap gap-1.5">
              {columns.map(col => (
                <label key={col.id} className={`flex items-center gap-1.5 text-[11px] cursor-pointer px-2 py-1 rounded border transition-colors ${
                  col.visible ? "bg-surface-100 border-surface-300 text-surface-700" : "bg-white border-surface-200 text-surface-400"
                }`}>
                  <input
                    type="checkbox"
                    checked={col.visible}
                    onChange={() => setColumns(prev => prev.map(c => c.id === col.id ? { ...c, visible: !c.visible } : c))}
                    className="sr-only"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-surface-100">
            <p className="text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-2">Estados (visibilidad)</p>
            <div className="flex flex-wrap gap-1.5">
              {estados.map(e => {
                const isHidden = userHiddenEstados.has(e.id);
                return (
                  <label
                    key={e.id}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border cursor-pointer transition-colors ${
                      isHidden ? "opacity-40 bg-surface-50" : ""
                    }`}
                    style={{ borderColor: `${e.color}40`, color: isHidden ? "#94a3b8" : e.color }}
                  >
                    <input
                      type="checkbox"
                      checked={!isHidden}
                      onChange={() => setUserHiddenEstados(prev => {
                        const next = new Set(prev);
                        if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
                        return next;
                      })}
                      className="sr-only"
                    />
                    <StatusIcon clave={e.clave} color={e.color} size={12} />
                    {e.nombre}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tareas agrupadas */}
      <div className="space-y-2">
        {groupBy === "estado" ? (
        <>
        {/* Toggle para mostrar estados vacíos */}
        {estados.some(e => (groupedTareas[e.id] || []).length === 0) && (
          <div className="flex justify-end mb-1">
            <button
              onClick={() => setShowEmptyStates(!showEmptyStates)}
              className="text-[11px] text-surface-400 hover:text-surface-600 transition-colors"
            >
              {showEmptyStates ? "Ocultar vacíos" : `Mostrar todos (${estados.filter(e => (groupedTareas[e.id] || []).length === 0).length} vacíos)`}
            </button>
          </div>
        )}

        {estados.map((estado) => {
          const items = groupedTareas[estado.id] || [];
          const isExpanded = expandedSections.has(estado.id);

          if (items.length === 0 && !showEmptyStates) return null;
          if (userHiddenEstados.has(estado.id)) return null;

          return (
            <div key={estado.id} className="bg-white border border-surface-200 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection(estado.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-50 transition-colors text-left"
              >
                <ChevronIcon expanded={isExpanded} className="w-3.5 h-3.5" />
                <StatusIcon clave={estado.clave} color={estado.color} size={16} />
                <span className="text-sm font-medium text-surface-700">{estado.nombre}</span>
                <span className="text-[11px] text-surface-400 tabular-nums">{items.length}</span>
              </button>

              {isExpanded && (
                <div className="border-t border-surface-100">
                  {items.length === 0 ? (
                    <div className="text-center py-4 text-surface-300 text-[11px] italic">
                      Sin tareas en este estado
                    </div>
                  ) : (
                    <TaskTable items={items} />
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Sin estado */}
        {groupedTareas["sin-estado"]?.length > 0 && (
          <div className="bg-white border border-surface-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection("sin-estado")}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-50 transition-colors text-left"
            >
              <ChevronIcon expanded={expandedSections.has("sin-estado")} className="w-3.5 h-3.5" />
              <span className="w-2 h-2 rounded-full bg-surface-300 flex-shrink-0" />
              <span className="text-sm font-medium text-surface-500">Sin estado</span>
              <span className="text-[11px] text-surface-400 tabular-nums">{groupedTareas["sin-estado"].length}</span>
            </button>
            {expandedSections.has("sin-estado") && (
              <div className="border-t border-surface-100">
                <TaskTable items={groupedTareas["sin-estado"]} />
              </div>
            )}
          </div>
        )}
        </>
        ) : (
        <>
          {Object.entries(groupedTareas).map(([groupKey, items]: [string, any[]]) => {
            const isExpanded = expandedSections.has(groupKey);
            return (
              <div key={groupKey} className="bg-white border border-surface-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection(groupKey)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-50 transition-colors text-left"
                >
                  <ChevronIcon expanded={isExpanded} className="w-3.5 h-3.5" />
                  <span className="w-2.5 h-2.5 rounded-full bg-surface-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-surface-700">{groupKey}</span>
                  <span className="text-[11px] text-surface-400 tabular-nums">{items.length}</span>
                </button>
                {isExpanded && (
                  <div className="border-t border-surface-100">
                    <TaskTable items={items} />
                  </div>
                )}
              </div>
            );
          })}
        </>
        )}
      </div>

      {/* Modal detalle */}
      {selectedTareaId && (
        <TareaDetalleModal
          tareaId={selectedTareaId}
          estados={estados}
          isModOrAdmin={isModOrAdmin}
          onClose={() => setSelectedTareaId(null)}
          onUpdated={fetchData}
        />
      )}
    </div>
  );
}
