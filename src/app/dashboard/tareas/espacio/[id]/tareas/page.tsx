"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation"; /* eslint-disable-line @typescript-eslint/no-unused-vars */
import { useSession } from "@/hooks/useSession";
import { useSearchContext } from "@/contexts/SearchContext";
import Link from "next/link";
import TareaDetalleModal from "@/components/TareaDetalleModal";
import StatusIcon from "@/components/StatusIcon";
import EstadoInlineDropdown, { type EstadoInlineDropdownHandle } from "@/components/EstadoInlineDropdown";
import AsignadosInlineEditor, { type AsignadosInlineEditorHandle } from "@/components/tareas/AsignadosInlineEditor";
import CreateTareaModal from "@/components/tareas/CreateTareaModal";
import SavedViewsBar from "@/components/tareas/SavedViewsBar";
import TareaEtiquetasEditor, { type TareaEtiquetaValue } from "@/components/tareas/TareaEtiquetasEditor";
import { IconDownload, IconPlus } from "@/components/ui/Icons";
import { obtenerProvincia, PROVINCIAS } from "@/utils/provinciaUtils";
import { dedupeUsersByName } from "@/utils/asignacionUtils";
import { hasTaskFieldConfig, normalizeTaskGroupBy, normalizeTaskQuickFilter, sanitizeTaskFieldConfigs } from "@/utils/taskFieldConfig";
import { toast } from "sonner";
import { mensajeError } from "@/lib/fetchJson";
import { useConfirm } from "@/contexts/ConfirmContext";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Copiar al portapapeles ──────────────────────────────────
const CopyBtn = ({ text }: { text: string }) => {
  if (!text || text === "—") return null;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); }}
      className="opacity-0 group-hover/cell:opacity-100 ml-0.5 p-0.5 text-surface-300 hover:text-surface-500 transition-all shrink-0"
      title="Copiar texto"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
    </button>
  );
};

// ── Indicador de notas/comentarios ──────────────────────────
const NotesIndicator = ({ notas, notasTecnico, comentarios, tieneMas20Ap }: { notas?: string; notasTecnico?: string; comentarios?: number; tieneMas20Ap?: unknown }) => {
  const showMas20Ap = String(tieneMas20Ap || "").trim().toUpperCase() === "SI";
  if (!notas && !notasTecnico && !showMas20Ap && !(comentarios && comentarios > 0)) return null;
  const taskTip = [
    notas ? "Tiene notas" : "",
    comentarios ? `${comentarios} comentario${comentarios > 1 ? "s" : ""}` : "",
    showMas20Ap ? "Tiene más de 20 AP" : "",
  ].filter(Boolean).join(" · ");
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {(notas || (comentarios && comentarios > 0)) && (
        <span title={taskTip || "Tiene notas"} aria-label="Nota de tarea">
          <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
          </svg>
        </span>
      )}
      {showMas20Ap && (
        <span title="Tiene más de 20 AP" aria-label="Más de 20 AP">
          <svg className="w-3 h-3 text-violet-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
          </svg>
        </span>
      )}
      {notasTecnico && (
        <span title="Tiene nota de tecnico" aria-label="Nota del tecnico">
          <svg className="w-3 h-3 text-primary-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
          </svg>
        </span>
      )}
    </span>
  );
};

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

const IconTrash = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);

const IconCheck = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
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
  type: "text" | "badge" | "date" | "select" | "multiselect" | "colored-select";
  options?: string[];
  optionColors?: Record<string, string>;
  showInCreate?: boolean;
}

interface TareasSavedView {
  id: string;
  name: string;
  search: string;
  filters: {
    filterEstado: string;
    filterProvincia: string;
    filterPrioridad: string;
    filterAsignado?: string;
    quickFilter: string;
    groupBy: string;
    includeSubspaces?: boolean;
  };
  sortConfig: { field: string; dir: "asc" | "desc" } | null;
  columns: Array<{ id: string; visible: boolean; order: number; width?: number }>;
  updatedAt?: string;
}

const DEFAULT_COLUMNS: Column[] = [
  { id: "codigoPredio", label: "Predio", field: "codigo", width: 100, visible: true, editable: false, type: "text" },
  { id: "predio", label: "Incidencia", field: "incidencias", width: 140, visible: true, editable: false, type: "text" },
  { id: "fechaActualizacion", label: "Fecha", field: "fechaActualizacion", width: 80, visible: true, editable: false, type: "date" },
  { id: "etiquetas", label: "Etiquetas", field: "etiquetas", width: 150, visible: true, editable: false, type: "text" },
  { id: "lacR", label: "LAC-R", field: "lacR", width: 70, visible: true, editable: true, type: "badge", options: ["SI", "NO", "PEDIDO"] },
  { id: "cue", label: "CUE", field: "cue", width: 100, visible: true, editable: true, type: "text" },
  { id: "fechaDesde", label: "DESDE", field: "fechaDesde", width: 90, visible: true, editable: true, type: "date" },
  { id: "fechaHasta", label: "HASTA", field: "fechaHasta", width: 90, visible: true, editable: true, type: "date" },
  { id: "ambito", label: "Ámbito", field: "ambito", width: 80, visible: true, editable: true, type: "select", options: ["Urbano", "Rural"] },
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
  { id: "ciudad", label: "Departamento", field: "ciudad", width: 120, visible: false, editable: true, type: "text" },
  { id: "orden", label: "Orden", field: "orden", width: 60, visible: false, editable: true, type: "text" },
];

const LS_EMPTY_KEY = "pmn-espacio-show-empty";
const LS_HIDDEN_KEY = "pmn-espacio-hidden-estados";

const GROUP_BY_OPTIONS = [
  { value: "estado", label: "Estado" },
  { value: "provincia", label: "Provincia" },
  { value: "asignados", label: "Persona asignada" },
  { value: "lacR", label: "LAC-R" },
  { value: "ambito", label: "Ámbito" },
  { value: "ciudad", label: "Departamento" },
];

const SERVER_PAGE_SIZE = 1000;

function normalizeSpaceName(value?: string | null) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function EspacioTareasPage() {
  const params = useParams();
  const espacioId = params.id as string;
  const viewsScope = `espacio-${espacioId}`;
  const router = useRouter();
  const { session, isModOrAdmin } = useSession();
  const confirm = useConfirm();
  const { headerSearch } = useSearchContext();
  const [selectedTareaId, setSelectedTareaId] = useState<string | null>(null);

  // Read URL params on mount
  const urlParamsRef = useRef<URLSearchParams | null>(null);
  if (typeof window !== "undefined" && !urlParamsRef.current) {
    urlParamsRef.current = new URLSearchParams(window.location.search);
  }

  const [espacio, setEspacio] = useState<any>(null);
  const [tareas, setTareas] = useState<any[]>([]);
  const [estados, setEstados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, total: 0, hasMore: false, limit: SERVER_PAGE_SIZE });
  const [filterEstado, setFilterEstado] = useState("todos");
  const [filterProvincia, setFilterProvincia] = useState("");
  const [filterPrioridad, setFilterPrioridad] = useState("todas");
  const [filterAsignado, setFilterAsignado] = useState("todos");
  const [quickFilter, setQuickFilter] = useState("todos");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [search, setSearch] = useState(() => urlParamsRef.current?.get("search") || "");
  const [serverSearch, setServerSearch] = useState(() => urlParamsRef.current?.get("search") || "");
  const openTargetRef = useRef<string | null>(urlParamsRef.current?.get("open") || null);
  const openHandled = useRef(false);
  const [includeSubspaces, setIncludeSubspaces] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [groupLoadState, setGroupLoadState] = useState<Record<string, "idle" | "loading" | "loaded">>({});
  const [groupCounts, setGroupCounts] = useState<Record<string, number>>({});
  const lazyConditionsRef = useRef<string>("");
  const filtersLoadedRef = useRef(false);
  const filterSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sortConfig, setSortConfig] = useState<{ field: string; dir: "asc" | "desc" } | null>(null);
  const [groupBy, setGroupBy] = useState("estado");
  const [savedViews, setSavedViews] = useState<TareasSavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [newViewName, setNewViewName] = useState("");
  const [savingView, setSavingView] = useState(false);

  // Columnas configurables
  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [showEstadoModal, setShowEstadoModal] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState({ nombre: "", color: "#3b82f6" });

  // Inline new column form
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState<"text" | "badge" | "date" | "select">("text");
  const [newColOptions, setNewColOptions] = useState("");
  const [creatingCol, setCreatingCol] = useState(false);
  const [colConfigTab, setColConfigTab] = useState<"crear" | "existente">("existente");
  const [colSearch, setColSearch] = useState("");

  // Confirmar eliminación
  const [confirmDelete, setConfirmDelete] = useState<{ type: string; id: string; label: string } | null>(null);

  // Selección masiva
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string>("");
  const [bulkValue, setBulkValue] = useState<string>("");
  const [bulkExecuting, setBulkExecuting] = useState(false);
  const selectedBulkUserIds = useMemo(() => bulkValue ? bulkValue.split(",").filter(Boolean) : [], [bulkValue]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteGroup, setBulkDeleteGroup] = useState<string | null>(null);

  // Usuarios y espacios (para acciones masivas)
  const [allUsers, setAllUsers] = useState<{ id: string; nombre: string }[]>([]);
  const [allEspacios, setAllEspacios] = useState<any[]>([]);

  // Drag & drop columnas
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const didDragRef = useRef(false);

  // Resize columnas
  const resizingCol = useRef<{ id: string; startX: number; startW: number } | null>(null);
  const [resizeDelta, setResizeDelta] = useState<{ id: string; width: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const handleResizeStart = (e: React.MouseEvent, colId: string, currentW: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizingCol.current = { id: colId, startX: e.clientX, startW: currentW };
    const onMove = (ev: MouseEvent) => {
      if (!resizingCol.current) return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (!resizingCol.current) return;
        const delta = ev.clientX - resizingCol.current.startX;
        const newW = Math.max(40, resizingCol.current.startW + delta);
        setResizeDelta({ id: resizingCol.current.id, width: newW });
      });
    };
    const onUp = () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (resizingCol.current) {
        const ref = resizingCol.current;
        setResizeDelta(prev => {
          if (prev && prev.id === ref.id) {
            setColumns(cols => cols.map(c => c.id === ref.id ? { ...c, width: prev.width } : c));
          }
          return null;
        });
      }
      resizingCol.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  const getColWidth = (col: Column) => resizeDelta?.id === col.id ? resizeDelta.width : col.width;

  // Drag & drop estados (reordenar)
  const [dragEstadoId, setDragEstadoId] = useState<string | null>(null);
  const [dragOverEstadoId, setDragOverEstadoId] = useState<string | null>(null);

  // Dropdown inline de estado en la lista (estado propio, no re-renderiza la tabla al abrir/cerrar)
  const estadoDropdownRef = useRef<EstadoInlineDropdownHandle>(null);

  useEffect(() => {
    if (headerSearch === undefined) return;
    // Si hay búsqueda desde el header y estamos en una subcarpeta, redirigir a búsqueda global
    if (headerSearch.trim() && espacioId) {
      const url = new URL(`/dashboard/tareas?search=${encodeURIComponent(headerSearch.trim())}`, window.location.origin);
      router.push(url.pathname + url.search);
      return;
    }
    setSearch(headerSearch);
    setServerSearch(headerSearch.trim());
    if (headerSearch.trim()) {
      setFilterEstado("todos");
      setFilterProvincia("");
      setFilterPrioridad("todas");
      setQuickFilter("todos");
    }
  }, [headerSearch, espacioId]);

  useEffect(() => {
    const timer = setTimeout(() => setServerSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const handler = (event: Event) => {
      const href = (event as CustomEvent<{ href?: string }>).detail?.href;
      if (!href || typeof window === "undefined") return;
      const url = new URL(href, window.location.origin);
      if (url.pathname !== window.location.pathname) return;
      const nextSearch = url.searchParams.get("search") || "";
      const nextOpen = url.searchParams.get("open");
      openTargetRef.current = nextOpen;
      if (nextOpen) openHandled.current = false;
      if (nextSearch) {
        setSearch(nextSearch);
        setServerSearch(nextSearch.trim());
      }
    };
    window.addEventListener("pmn-global-result-selected", handler);
    return () => window.removeEventListener("pmn-global-result-selected", handler);
  }, []);

  const abrirInlineEstado = (e: React.MouseEvent, tareaId: string) => {
    e.stopPropagation();
    estadoDropdownRef.current?.toggle(tareaId, e.currentTarget as HTMLElement);
  };

  const asignadosEditorRef = useRef<AsignadosInlineEditorHandle>(null);
  const abrirAsignados = (e: React.MouseEvent, tareaId: string) => {
    e.stopPropagation();
    asignadosEditorRef.current?.toggle(tareaId, e.currentTarget as HTMLElement);
  };

  async function changeEstadoInline(tareaId: string, estadoId: string) {
    const newEstado = estados.find(e => e.id === estadoId);
    const res = await fetch(`/api/tareas/${tareaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ estadoId }),
    });
    if (res.ok) {
      setTareas(prev => prev.map(t => t.id === tareaId ? { ...t, estadoId, estado: newEstado } : t));
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Error al cambiar estado");
    }
  }

  // Auto-ocultar columnas sin datos (una sola vez)
  const autoHideDone = useRef(false);
  const fetchDataRequestRef = useRef(0);

  // Persistir columnas — config compartida vía servidor
  const colConfigLoaded = useRef(false);
  const hadSavedConfig = useRef(false);
  const savedColumnConfigRef = useRef<{ id: string; visible: boolean; order: number; width?: number }[] | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const COL_CONFIG_KEY = `col-config-espacio-${espacioId}`;

  const applySavedColumnConfig = useCallback((inputColumns: Column[]) => {
    const config = savedColumnConfigRef.current;
    const safeInputColumns = sanitizeTaskFieldConfigs(inputColumns);
    if (!config) return safeInputColumns;
    const orderMap = new Map(config.map((c, i) => [c.id, { visible: c.visible, order: i, width: c.width }]));
    return [...safeInputColumns]
      .map(col => {
        const cfg = orderMap.get(col.id);
        return cfg ? { ...col, visible: cfg.visible, ...(cfg.width != null ? { width: cfg.width } : {}) } : col;
      })
      .sort((a, b) => {
        const oa = orderMap.get(a.id)?.order ?? 999;
        const ob = orderMap.get(b.id)?.order ?? 999;
        return oa - ob;
      });
  }, []);

  // Guardar config al servidor cuando ADMIN/MOD cambia columnas (debounced)
  useEffect(() => {
    if (!colConfigLoaded.current) return;
    if (!isModOrAdmin) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const config = sanitizeTaskFieldConfigs(columns).map((c, i) => ({ id: c.id, visible: c.visible, order: i, width: c.width }));
      fetch("/api/config-vista", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: COL_CONFIG_KEY, config }),
      }).catch(() => {});
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [COL_CONFIG_KEY, columns, isModOrAdmin]);

  // Mostrar/ocultar estados vacíos
  const [showEmptyStates, setShowEmptyStates] = useState(false);
  // Estados ocultos por el usuario
  const [userHiddenEstados, setUserHiddenEstados] = useState<Set<string>>(new Set());
  // Estados ocultos por admin (permisos por rol + por usuario)
  const [adminHiddenEstados, setAdminHiddenEstados] = useState<Set<string>>(new Set());

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

  // Cargar permisos de visibilidad de estados (por rol + por usuario)
  useEffect(() => {
    if (!session?.rol || session.rol === "ADMIN") return;
    fetch("/api/permisos/estados", { credentials: "include" })
      .then(r => r.ok ? r.json() : { permisos: [], permisosUsuario: [] })
      .then(d => {
        const perms = d.permisos || [];
        const permsUsuario = d.permisosUsuario || [];
        const hidden = new Set<string>();
        for (const p of perms) {
          if (p.rol === session.rol && !p.visible) hidden.add(p.estadoId);
        }
        for (const p of permsUsuario) {
          if (p.userId === session.userId && !p.visible) hidden.add(p.estadoId);
          else if (p.userId === session.userId && p.visible) hidden.delete(p.estadoId);
        }
        setAdminHiddenEstados(hidden);
      })
      .catch(() => {});
  }, [session]);

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
    // Cargar usuarios y espacios para acciones masivas
    if (isModOrAdmin) {
      fetch("/api/catalogos/usuarios", { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then((data: any) => setAllUsers(dedupeUsersByName(Array.isArray(data) ? data : (data.usuarios || []))))
        .catch(() => {});
      fetch("/api/espacios", { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then((data: any) => {
          const flat: any[] = [];
          const roots = Array.isArray(data) ? data : (data.espacios || []);
          const walk = (arr: any[], depth: number) => {
            for (const e of arr) {
              flat.push({ ...e, _depth: depth });
              if (e.children?.length) walk(e.children, depth + 1);
              else if (e.hijos?.length) walk(e.hijos, depth + 1);
            }
          };
          walk(roots, 0);
          setAllEspacios(flat);
        })
        .catch(() => {});
    }
  }, [isModOrAdmin]);

  // ── Carga lazy de un grupo de estado ───────────────────────
  const fetchGroupTareas = useCallback(async (groupKey: string) => {
    setGroupLoadState(prev => ({ ...prev, [groupKey]: "loading" }));
    try {
      const gParams = new URLSearchParams({ espacioId, limit: String(SERVER_PAGE_SIZE), page: "1" });
      if (includeSubspaces) gParams.set("includeSubspaces", "true");
      if (serverSearch) gParams.set("buscar", serverSearch);
      if (filterEstado !== "todos") gParams.set("estado", filterEstado);
      if (filterProvincia.trim()) gParams.set("provincia", filterProvincia.trim());
      if (filterPrioridad !== "todas") gParams.set("prioridad", filterPrioridad);
      if (filterAsignado !== "todos") gParams.set("asignadoId", filterAsignado);
      if (quickFilter !== "todos") gParams.set("quick", quickFilter);
      if (sortConfig?.field && !sortConfig.field.startsWith("_custom_") && sortConfig.field !== "asignaciones" && sortConfig.field !== "etiquetas") {
        gParams.set("sortBy", sortConfig.field);
        gParams.set("sortDir", sortConfig.dir);
      }
      // Filtrar por este grupo de estado específico
      gParams.set("estadoId", groupKey === "sin-estado" ? "null" : groupKey);
      const res = await fetch(`/api/tareas?${gParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("fetch failed");
      const d = await res.json();
      const newPredios: any[] = d.predios || [];
      setTareas(prev => {
        const seen = new Set(prev.map((item: any) => item.id));
        return [...prev, ...newPredios.filter((item: any) => !seen.has(item.id))];
      });
      setGroupLoadState(prev => ({ ...prev, [groupKey]: "loaded" }));
    } catch {
      setGroupLoadState(prev => ({ ...prev, [groupKey]: "idle" }));
    }
  }, [espacioId, includeSubspaces, serverSearch, filterEstado, filterProvincia, filterPrioridad, filterAsignado, quickFilter, sortConfig]);

  const fetchData = useCallback(async (options?: { page?: number; append?: boolean }) => {
    const pageToLoad = options?.page || 1;
    const append = options?.append || false;
    const requestId = ++fetchDataRequestRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);

    // Cargar config compartida del servidor ANTES del auto-hide
    if (!colConfigLoaded.current) {
      try {
        const cfgRes = await fetch(`/api/config-vista?clave=${COL_CONFIG_KEY}`, { credentials: "include" });
        if (cfgRes.ok) {
          const cfgData = await cfgRes.json();
          if (cfgData?.config) {
            hadSavedConfig.current = true;
            const config = sanitizeTaskFieldConfigs(cfgData.config as { id: string; visible: boolean; order: number; width?: number }[]);
            savedColumnConfigRef.current = config;
            setColumns(prev => applySavedColumnConfig(prev));
          }
        }
      } catch { /* ignore */ }
      colConfigLoaded.current = true;
    }

    if (fetchDataRequestRef.current !== requestId) return;

    const params = new URLSearchParams({ espacioId, limit: String(SERVER_PAGE_SIZE), page: String(pageToLoad) });
    if (includeSubspaces) params.set("includeSubspaces", "true");
    if (serverSearch) params.set("buscar", serverSearch);
    if (filterEstado !== "todos") params.set("estado", filterEstado);
    if (filterProvincia.trim()) params.set("provincia", filterProvincia.trim());
    if (filterPrioridad !== "todas") params.set("prioridad", filterPrioridad);
    if (filterAsignado !== "todos") params.set("asignadoId", filterAsignado);
    if (quickFilter !== "todos") params.set("quick", quickFilter);
    if (sortConfig?.field && !sortConfig.field.startsWith("_custom_") && sortConfig.field !== "asignaciones" && sortConfig.field !== "etiquetas") {
      params.set("sortBy", sortConfig.field);
      params.set("sortDir", sortConfig.dir);
    }

    // Lazy mode: solo cuando groupBy=estado, sin búsqueda activa y no es append ni ?open=
    const lazyMode = groupBy === "estado" && !serverSearch && !append && !openTargetRef.current;
    const lazyKey = `${filterEstado}|${filterProvincia}|${filterPrioridad}|${filterAsignado}|${quickFilter}|${includeSubspaces}|${espacioId}`;

    const countsParams = new URLSearchParams({ espacioId, countOnly: "true", groupBy: "estado" });
    if (includeSubspaces) countsParams.set("includeSubspaces", "true");
    if (filterProvincia.trim()) countsParams.set("provincia", filterProvincia.trim());
    if (filterPrioridad !== "todas") countsParams.set("prioridad", filterPrioridad);
    if (filterAsignado !== "todos") countsParams.set("asignadoId", filterAsignado);
    if (quickFilter !== "todos") countsParams.set("quick", quickFilter);
    if (serverSearch) countsParams.set("buscar", serverSearch);

    try {
    const [tareasResOrNull, estadosRes, espacioRes, camposRes, countsResOrNull] = await Promise.all([
      lazyMode ? Promise.resolve(null) : fetch(`/api/tareas?${params.toString()}`, { credentials: "include" }),
      fetch("/api/estados", { credentials: "include" }),
      fetch(`/api/espacios/${espacioId}`, { credentials: "include" }),
      fetch("/api/campos-personalizados", { credentials: "include" }),
      lazyMode ? fetch(`/api/tareas?${countsParams.toString()}`, { credentials: "include" }) : Promise.resolve(null),
    ]);
    const tareasRes = tareasResOrNull as Response | null;
    const countsRes = countsResOrNull as Response | null;

    if (fetchDataRequestRef.current !== requestId) return;

    // Si la carga principal (tareas o conteos en modo lazy) falló, mostramos error.
    if ((tareasRes && !tareasRes.ok) || (countsRes && !countsRes.ok)) {
      throw new Error("No se pudieron cargar las tareas");
    }
    setLoadError(false);

    // En modo lazy: resetear datos cuando las condiciones de filtro cambian
    if (lazyMode && lazyConditionsRef.current !== lazyKey) {
      lazyConditionsRef.current = lazyKey;
      setTareas([]);
      setGroupLoadState({});
      setGroupCounts({});
      setSelectedIds(new Set());
      setRenderLimits({});
      setExpandedSections(new Set());
    }

    if (tareasRes?.ok) {
      const d = await tareasRes.json();
      if (fetchDataRequestRef.current !== requestId) return;
      const predios = d.predios || [];
      setTareas(prev => {
        if (!append) return predios;
        const seen = new Set(prev.map((item: any) => item.id));
        return [...prev, ...predios.filter((item: any) => !seen.has(item.id))];
      });
      setPagination({ page: d.page || pageToLoad, total: d.total || predios.length, hasMore: Boolean(d.hasMore), limit: d.limit || SERVER_PAGE_SIZE });
      if (!append) {
        setSelectedIds(new Set());
        setRenderLimits({});
      }
      // Auto-ocultar columnas sin datos (solo la primera vez y si NO hay config guardada en servidor)
      if (!autoHideDone.current && !hadSavedConfig.current && predios.length > 0) {
        autoHideDone.current = true;
        const ESSENTIAL = new Set(["codigoPredio", "predio", "fechaActualizacion", "etiquetas", "lacR", "asignados"]);
        setColumns(prev => prev.map(col => {
          if (ESSENTIAL.has(col.id)) return col;
          const hasData = predios.some((t: any) => {
            const v = col.field.startsWith("_custom_") ? t.camposExtra?.[col.field.substring(8)] : t[col.field];
            return v != null && v !== "" && v !== 0;
          });
          return hasData ? { ...col, visible: true } : { ...col, visible: false };
        }));
      }
    }
    let nextEspacio: any = null;
    if (espacioRes.ok) {
      const d = await espacioRes.json();
      nextEspacio = d.espacio;
      setEspacio(nextEspacio);
    }
    if (estadosRes.ok) {
      const d = await estadosRes.json();
      const allEstados = d.estados || [];
      const estadoIds = Array.isArray(nextEspacio?.estadosConfig?.estadoIds) ? nextEspacio.estadosConfig.estadoIds : null;
      const est = estadoIds ? allEstados.filter((estado: any) => estadoIds.includes(estado.id)) : allEstados;
      setEstados(est);
      // En modo lazy NO auto-expandir — el usuario expande manualmente
      if (!lazyMode) {
        setExpandedSections(new Set([...est.map((e: any) => e.id), "sin-estado"]));
      }
    }
    // En modo lazy: procesar conteos por grupo y auto-expandir estados no vacíos
    if (countsRes?.ok) {
      const countsData = await countsRes.json();
      const counts: Record<string, number> = countsData.groupCounts || {};
      setGroupCounts(counts);
      const nonEmptyIds = Object.entries(counts)
        .filter(([, c]) => (c as number) > 0)
        .map(([id]) => id);
      if (nonEmptyIds.length > 0) {
        setExpandedSections(new Set(nonEmptyIds));
        nonEmptyIds.forEach(id => fetchGroupTareas(id));
      }
    }
    if (camposRes.ok) {
      const d = await camposRes.json();
      const globalCampos = d.campos || [];
      const templateCampos = Array.isArray(nextEspacio?.camposConfig) ? sanitizeTaskFieldConfigs(nextEspacio.camposConfig) : [];
      const nextColumns = templateCampos.length > 0
        ? templateCampos.map((field: any) => ({
            id: field.id,
            label: field.label || field.nombre || field.id,
            field: field.field,
            width: field.width || field.ancho || 100,
            visible: field.visible !== false,
            editable: field.editable !== false,
            type: (field.type || field.tipo || "text") as Column["type"],
            options: field.options || field.opciones || undefined,
            optionColors: field.optionColors || undefined,
            showInCreate: field.showInCreate,
          })).filter((field: Column) => field.id && field.field)
        : [
            ...DEFAULT_COLUMNS,
            ...globalCampos.map((field: any) => ({
              id: `custom_${field.clave}`,
              label: field.nombre,
              field: `_custom_${field.clave}`,
              width: field.ancho || 100,
              visible: true,
              editable: true,
              type: (field.tipo || "text") as Column["type"],
              options: field.opciones?.length ? field.opciones : undefined,
              optionColors: field.optionColors || undefined,
              showInCreate: false,
            })),
          ];

      // Mantener "Orden" disponible también en vistas por carpeta con template propio.
      const ordenColumn = DEFAULT_COLUMNS.find((col) => col.id === "orden");
      const nextColumnsWithOrden =
        ordenColumn && !nextColumns.some((col: Column) => col.id === "orden")
          ? [...nextColumns, ordenColumn]
          : nextColumns;

      setColumns(applySavedColumnConfig(sanitizeTaskFieldConfigs(nextColumnsWithOrden)));
    }
    } catch (e) {
      if (fetchDataRequestRef.current !== requestId) return;
      setLoadError(true);
      toast.error(mensajeError(e, "No se pudieron cargar las tareas"));
    } finally {
      if (fetchDataRequestRef.current === requestId) {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    }
  }, [COL_CONFIG_KEY, applySavedColumnConfig, espacioId, filterAsignado, filterEstado, filterPrioridad, filterProvincia, groupBy, includeSubspaces, quickFilter, serverSearch, sortConfig, fetchGroupTareas]);

  const loadMoreTareas = useCallback(() => {
    if (loadingMore || !pagination.hasMore) return;
    fetchData({ page: pagination.page + 1, append: true });
  }, [fetchData, loadingMore, pagination.hasMore, pagination.page]);

  // Auto-open predio detail from URL ?openId=ID (preferent) o ?open=CODIGO
  useEffect(() => {
    if (openHandled.current) return;
    const urlParams = new URLSearchParams(window.location.search);
    const openId = urlParams.get("openId");
    const openCode = urlParams.get("open");
    
    if (!openId && !openCode) return;
    
    if (openId) {
      const tarea = tareas.find(t => t.id === openId);
      if (tarea) {
        openHandled.current = true;
        setSelectedTareaId(tarea.id);
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }
    }
    
    if (openCode && !loading && tareas.length > 0) {
      const tarea = tareas.find(t => t.codigo === openCode);
      if (tarea) {
        openHandled.current = true;
        setSelectedTareaId(tarea.id);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, [tareas, loading]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setActiveViewId(null);
    fetch(`/api/preferencias/tareas-vistas?scope=${encodeURIComponent(viewsScope)}`, { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setSavedViews(Array.isArray(data?.views) ? data.views : []))
      .catch(() => {});
  }, [viewsScope]);

  // Cargar filtros + orden persistidos por usuario para ESTA carpeta (scope por espacio).
  useEffect(() => {
    filtersLoadedRef.current = false;
    fetch(`/api/preferencias/tareas-filtros?scope=esp-${espacioId}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const cfg = data?.config;
        if (cfg) {
          setFilterEstado(cfg.filterEstado || "todos");
          setFilterProvincia(cfg.filterProvincia || "");
          setFilterPrioridad(cfg.filterPrioridad || "todas");
          setFilterAsignado(cfg.filterAsignado || "todos");
          setQuickFilter(normalizeTaskQuickFilter(cfg.quickFilter));
          setGroupBy(normalizeTaskGroupBy(cfg.groupBy));
          if (cfg.sortConfig !== undefined) setSortConfig(cfg.sortConfig);
        }
      })
      .catch(() => {})
      .finally(() => { filtersLoadedRef.current = true; });
  }, [espacioId]);

  // Persistir (debounced) los filtros + orden por usuario para esta carpeta.
  useEffect(() => {
    if (!filtersLoadedRef.current) return;
    if (filterSaveTimerRef.current) clearTimeout(filterSaveTimerRef.current);
    filterSaveTimerRef.current = setTimeout(() => {
      fetch(`/api/preferencias/tareas-filtros?scope=esp-${espacioId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filterEstado, filterProvincia, filterPrioridad, filterAsignado, quickFilter, groupBy, sortConfig }),
      }).catch(() => {});
    }, 900);
    return () => { if (filterSaveTimerRef.current) clearTimeout(filterSaveTimerRef.current); };
  }, [espacioId, filterEstado, filterProvincia, filterPrioridad, filterAsignado, quickFilter, groupBy, sortConfig]);

  // Recargar tareas cuando el sidebar reporta un drop exitoso
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ movedIds?: string[]; targetEspacioId?: string }>).detail;
      if (detail?.movedIds?.length && !includeSubspaces && detail.targetEspacioId !== espacioId) {
        const moved = new Set(detail.movedIds);
        setTareas(prev => prev.filter(t => !moved.has(t.id)));
        setSelectedIds(prev => new Set(Array.from(prev).filter(id => !moved.has(id))));
      }
      fetchData();
    };
    window.addEventListener("espacios-updated", handler);
    return () => window.removeEventListener("espacios-updated", handler);
  }, [espacioId, fetchData, includeSubspaces]);

  // Agrupar tareas por estado o campo
  const groupedTareas = useMemo(() => {
    let filtered = tareas;
    if (search && !serverSearch) {
      const s = search.toLowerCase();
      filtered = tareas.filter((t) => {
        const prov = obtenerProvincia(t.provincia, t.codigo);
        if (
          t.nombre?.toLowerCase().includes(s) ||
          t.codigo?.toLowerCase().includes(s) ||
          t.incidencias?.toLowerCase().includes(s) ||
          t.cue?.toLowerCase().includes(s) ||
          prov.toLowerCase().includes(s) ||
          t.asignaciones?.some((a: any) => a.usuario?.nombre?.toLowerCase().includes(s)) ||
          t.etiquetas?.some((rel: any) => rel.etiqueta?.nombre?.toLowerCase().includes(s)) ||
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
  }, [tareas, estados, search, serverSearch, sortConfig, groupBy]);

  const toggleSection = (id: string) => {
    const wasExpanded = expandedSections.has(id);
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    // Lazy load: si se expande y todavía no tiene datos, dispararlos
    if (!wasExpanded && groupBy === "estado" && !serverSearch && groupLoadState[id] !== "loaded" && groupLoadState[id] !== "loading") {
      fetchGroupTareas(id);
    }
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
    if (!d) return "-";
    return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  };

  const formatRelativeDate = (d: string | null) => {
    if (!d) return "-";
    const now = Date.now();
    const then = new Date(d).getTime();
    const diff = now - then;
    if (diff < 0) return "Ahora";
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Ahora";
    if (mins < 60) return `Hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return "Ayer";
    if (days < 7) return `Hace ${days} días`;
    const weeks = Math.floor(days / 7);
    if (weeks <= 4) return `Hace ${weeks} sem`;
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
    const toastId = toast.loading("Guardando cambio...");
    try {
      const res = await fetch(`/api/tareas/${tareaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const extra: Record<string, any> = {};
        if (field === "gpsPredio") {
          const parts = value.split(",").map(s => parseFloat(s.trim()));
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            extra.latitud = parts[0];
            extra.longitud = parts[1];
          }
        }
        setTareas(prev => prev.map(t => t.id === tareaId ? { ...t, [field]: value, ...extra } : t));
        toast.success("Cambio guardado", { id: toastId });
      } else {
        toast.error("No se pudo guardar el cambio", { id: toastId });
      }
    } catch {
      toast.error("No se pudo guardar el cambio", { id: toastId });
    }
  }

  async function saveEtiquetas(tareaId: string, etiquetas: TareaEtiquetaValue[]) {
    const res = await fetch(`/api/tareas/${tareaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ etiquetas }),
    });
    if (res.ok) {
      const updated = await res.json();
      const nextEtiquetas = updated.etiquetas || etiquetas.map((etiqueta) => ({ etiqueta }));
      setTareas(prev => prev.map(t => t.id === tareaId ? { ...t, etiquetas: nextEtiquetas } : t));
    }
  }

  // Guardar asignados desde el editor inline (solo ADMIN/MOD)
  async function saveAsignados(tareaId: string, userIds: string[]) {
    const toastId = toast.loading("Guardando asignados...");
    try {
      const res = await fetch(`/api/tareas/${tareaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ asignadoIds: userIds }),
      });
      if (res.ok) {
        const updated = await res.json();
        const nextAsignaciones = updated.asignaciones || userIds.map((id) => {
          const u = allUsers.find((x) => x.id === id);
          return { id, usuario: { id, nombre: u?.nombre || "?" } };
        });
        setTareas(prev => prev.map(t => t.id === tareaId ? { ...t, asignaciones: nextAsignaciones } : t));
        toast.success("Asignados actualizados", { id: toastId });
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "No se pudo actualizar los asignados", { id: toastId });
      }
    } catch {
      toast.error("No se pudo actualizar los asignados", { id: toastId });
    }
  }

  // Crear estado nuevo
  async function handleCreateEstado(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoEstado.nombre.trim()) return;
    const res = await fetch("/api/estados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(nuevoEstado),
    });
    if (res.ok) {
      const newEst = await res.json();
      const currentIds = Array.isArray(espacio?.estadosConfig?.estadoIds)
        ? espacio.estadosConfig.estadoIds
        : estados.map((estado) => estado.id);
      const nextEstadoIds = Array.from(new Set([...currentIds, newEst.id]));
      const nextEstadosConfig = {
        ...(espacio?.estadosConfig && typeof espacio.estadosConfig === "object" && !Array.isArray(espacio.estadosConfig) ? espacio.estadosConfig : {}),
        estadoIds: nextEstadoIds,
      };
      await fetch(`/api/espacios/${espacioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ estadosConfig: nextEstadosConfig }),
      }).catch(() => {});
      setEspacio((prev: any) => prev ? { ...prev, estadosConfig: nextEstadosConfig } : prev);
      setEstados(prev => [...prev, newEst]);
      setExpandedSections(prev => { const next = new Set(prev); next.add(newEst.id); return next; });
      setNuevoEstado({ nombre: "", color: "#3b82f6" });
      setShowEstadoModal(false);
    }
  }

  // Confirmar eliminación
  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    const { type, id } = confirmDelete;
    setConfirmDelete(null);
    if (type === "tarea") {
      const res = await fetch(`/api/tareas/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        setTareas(prev => prev.filter(t => t.id !== id));
        if (selectedTareaId === id) setSelectedTareaId(null);
        toast.success("Tarea eliminada");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "No se pudo eliminar la tarea");
      }
    } else if (type === "estado") {
      const res = await fetch(`/api/estados/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { setEstados(prev => prev.filter(e => e.id !== id)); fetchData(); }
    } else if (type === "campo") {
      if (espacio?.id) {
        const nextColumns = columns.filter(c => c.id !== `custom_${id}`);
        setColumns(nextColumns);
        await fetch(`/api/espacios/${espacioId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ camposConfig: nextColumns }),
        }).catch(() => {});
        return;
      }
      const res = await fetch(`/api/campos-personalizados?clave=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { setColumns(prev => prev.filter(c => c.id !== `custom_${id}`)); }
    }
  }

  // Crear columna personalizada inline
  async function handleCreateCol() {
    const nombre = newColName.trim();
    if (!nombre || creatingCol) return;
    setCreatingCol(true);
    if (espacio?.id) {
      const clave = nombre
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "") || `campo_${Date.now()}`;
      const uniqueClave = `${clave}_${Date.now()}`;
      const options = newColOptions.split(",").map((item) => item.trim()).filter(Boolean);
      const colId = `custom_${uniqueClave}`;
      const newColumn: Column = {
        id: colId,
        label: nombre,
        field: `_custom_${uniqueClave}`,
        width: 120,
        visible: true,
        editable: true,
        type: newColType,
        options: options.length ? options : undefined,
      };
      const nextColumns = columns.some(c => c.id === colId) ? columns : [...columns, newColumn];
      setColumns(nextColumns);
      await fetch(`/api/espacios/${espacioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ camposConfig: nextColumns }),
      });
      setNewColName("");
      setNewColOptions("");
      setNewColType("text");
      setColConfigTab("existente");
      setCreatingCol(false);
      return;
    }
    try {
      const res = await fetch("/api/campos-personalizados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nombre, tipo: newColType, opciones: newColOptions.split(",").map((item) => item.trim()).filter(Boolean) }),
      });
      if (res.ok) {
        const campo = await res.json();
        const colId = `custom_${campo.clave}`;
        setColumns(prev => {
          if (prev.some(c => c.id === colId)) return prev;
          return [...prev, {
            id: colId, label: campo.nombre, field: `_custom_${campo.clave}`,
            width: campo.ancho || 100, visible: true, editable: true,
            type: (campo.tipo || "text") as "text" | "badge" | "date" | "select",
            options: campo.opciones?.length ? campo.opciones : undefined,
          }];
        });
        setNewColName("");
        setNewColOptions("");
        setNewColType("text");
        setColConfigTab("existente");
      }
    } catch { /* ignore */ }
    setCreatingCol(false);
  }

  // Selección masiva: toggle individual
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Selección masiva: toggle grupo
  const toggleSelectGroup = (items: any[]) => {
    const ids = items.map((t: any) => t.id);
    const allSelected = ids.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) { ids.forEach(id => next.delete(id)); }
      else { ids.forEach(id => next.add(id)); }
      return next;
    });
  };

  // Drag & drop de filas hacia sidebar
  function handleRowDragStart(e: React.DragEvent, tareaId: string) {
    const ids = selectedIds.has(tareaId) && selectedIds.size > 1
      ? Array.from(selectedIds) : [tareaId];
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/x-predio-ids", JSON.stringify(ids));
    (window as any).__draggedPredioIds = ids;
    (window as any).__draggedPredioFields = columns.filter((col) => col.visible && col.id.startsWith("custom_"));
  }

  async function persistSpaceFields(nextFields: any[]) {
    const normalizedFields: Column[] = nextFields.map((field) => ({
      ...field,
      width: field.width || 120,
      visible: field.visible !== false,
      editable: field.editable !== false,
      type: field.type || "text",
      showInCreate: field.id?.startsWith("custom_") || field.field?.startsWith("_custom_") ? field.showInCreate === true : field.showInCreate !== false,
    }));
    setColumns(normalizedFields);
    setEspacio((prev: any) => prev ? { ...prev, camposConfig: normalizedFields } : prev);
    await fetch(`/api/espacios/${espacioId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ camposConfig: normalizedFields }),
    });
  }

  // Acción masiva
  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    if (!["autoProvince", "autoGPS", "enFacturacion", "moverFacturado"].includes(bulkAction) && !bulkValue) return;
    setBulkExecuting(true);
    try {
      let actionKey = bulkAction;
      let actionValue: any = bulkAction === "enFacturacion" ? true : bulkValue;
      if (bulkAction === "moverFacturado") {
        const facturadoEsp = allEspacios.find((e: any) => e.nombre === "Facturado" && !e.parentId);
        if (!facturadoEsp) {
          toast.error("El espacio 'Facturado' no existe. Créalo primero.");
          setBulkExecuting(false);
          return;
        }
        actionKey = "espacioId";
        actionValue = facturadoEsp.id;
      }
      if (["asignadoIds", "replaceAsignadoIds", "removeAsignadoIds"].includes(bulkAction)) {
        actionValue = bulkValue.split(",").filter(Boolean);
      }
      console.log("[BULK] action:", actionKey, "value:", actionValue, "ids:", Array.from(selectedIds).length);
      const res = await fetch("/api/tareas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: Array.from(selectedIds), action: actionKey, value: actionValue }),
      });
      if (res.ok) {
        const data = await res.json();
        console.log("[BULK] success, count:", data.count);
        setSelectedIds(new Set());
        setBulkAction("");
        setBulkValue("");
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("[BULK] error:", res.status, err);
        toast.error(`Error: ${err.error || res.statusText}`);
      }
    } catch (e) { console.error("[BULK] exception:", e); }
    setBulkExecuting(false);
  };

  function toggleBulkUser(userId: string) {
    const next = new Set(selectedBulkUserIds);
    if (next.has(userId)) next.delete(userId); else next.add(userId);
    setBulkValue(Array.from(next).join(","));
  }

  // Eliminación masiva por grupo de estado
  const handleBulkDelete = async (estadoId: string) => {
    setBulkDeleting(true);
    setBulkDeleteGroup(estadoId);
    try {
      const res = await fetch(`/api/tareas?estadoId=${estadoId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) fetchData();
    } catch { /* ignore */ }
    setBulkDeleting(false);
    setBulkDeleteGroup(null);
  };

  function tareaDeleteLabel(tarea: any) {
    return tarea.codigo || tarea.incidencias || tarea.nombre || "esta tarea";
  }

  async function handleDeleteSelectedTasks() {
    if (session?.rol !== "ADMIN" || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    if (!(await confirm({ title: "Eliminar tareas", message: `¿Eliminar ${ids.length} tarea${ids.length !== 1 ? "s" : ""} seleccionada${ids.length !== 1 ? "s" : ""}?`, confirmLabel: "Eliminar" }))) return;
    setBulkDeleting(true);
    const toastId = toast.loading("Eliminando tareas...");
    try {
      const res = await fetch(`/api/tareas?ids=${encodeURIComponent(ids.join(","))}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "No se pudieron eliminar las tareas", { id: toastId });
        return;
      }
      const data = await res.json().catch(() => ({}));
      setSelectedIds(new Set());
      await fetchData();
      toast.success(`${data.count || ids.length} tarea${(data.count || ids.length) !== 1 ? "s" : ""} eliminada${(data.count || ids.length) !== 1 ? "s" : ""}`, { id: toastId });
    } catch {
      toast.error("No se pudieron eliminar las tareas", { id: toastId });
    } finally {
      setBulkDeleting(false);
    }
  }

  // Reordenar estados (drag & drop)
  const handleEstadoDrop = async (targetId: string) => {
    if (!dragEstadoId || dragEstadoId === targetId) { setDragEstadoId(null); setDragOverEstadoId(null); return; }
    const oldList = [...estados];
    const fromIdx = oldList.findIndex(e => e.id === dragEstadoId);
    const toIdx = oldList.findIndex(e => e.id === targetId);
    if (fromIdx < 0 || toIdx < 0) { setDragEstadoId(null); setDragOverEstadoId(null); return; }
    const [moved] = oldList.splice(fromIdx, 1);
    oldList.splice(toIdx, 0, moved);
    setEstados(oldList);
    setDragEstadoId(null);
    setDragOverEstadoId(null);
    try {
      await fetch("/api/estados", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: oldList.map(e => e.id) }),
      });
    } catch { /* revert on error */ setEstados(estados); }
  };

  // Render de celda
  const renderCell = (t: any, col: Column) => {
    if (col.field.startsWith("_custom_")) {
      const clave = col.field.substring(8);
      const val = t.camposExtra?.[clave];
      if (!val) return <span className="text-surface-300">&mdash;</span>;
      const display = Array.isArray(val) ? val.join(", ") : String(val);
      if ((col.type === "badge" || col.type === "colored-select") && col.optionColors?.[display]) {
        return (
          <span className="flex items-center group/cell">
            <span className="rounded px-1.5 py-px text-[10px] font-semibold text-white" style={{ backgroundColor: col.optionColors[display] }}>{display}</span>
            <CopyBtn text={display} />
          </span>
        );
      }
      return <span className="flex items-center group/cell"><span className="text-surface-700 truncate">{display}</span><CopyBtn text={display} /></span>;
    }
    if (col.id === "asignados") {
      const asigns = t.asignaciones || [];
      const badges = asigns.map((a: any) => (
        <span key={a.id} className="px-1.5 py-px bg-violet-50 text-violet-700 border border-violet-200 rounded text-[10px] font-medium truncate max-w-[80px]">
          {a.usuario?.nombre?.split(" ")[0] || "?"}
        </span>
      ));
      if (isModOrAdmin) {
        return (
          <button
            type="button"
            onClick={(e) => abrirAsignados(e, t.id)}
            title="Editar asignados"
            className="flex w-full min-h-[20px] flex-wrap items-center gap-1 -mx-0.5 rounded px-0.5 text-left transition-colors hover:bg-surface-50 dark:hover:bg-surface-700/50"
          >
            {asigns.length === 0
              ? <span className="rounded border border-dashed border-surface-300 px-1.5 py-px text-[10px] text-surface-400">+ Asignar</span>
              : badges}
          </button>
        );
      }
      if (asigns.length > 0) {
        return <span className="flex items-center gap-1 flex-wrap">{badges}</span>;
      }
      return <span className="text-surface-300">&mdash;</span>;
    }
    if (col.type === "date") {
      if (col.id === "fechaActualizacion") {
        const full = t.updatedAt ? new Date(t.updatedAt).toLocaleString("es-AR") : "";
        return <span title={full}>{formatRelativeDate(t.updatedAt)}</span>;
      }
      return formatDate(t[col.field]);
    }
    if (col.id === "etiquetas") {
      return (
        <TareaEtiquetasEditor
          etiquetas={t.etiquetas}
          canEdit={Boolean(isModOrAdmin)}
          onSave={(next) => saveEtiquetas(t.id, next)}
        />
      );
    }
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
              val === "PEDIDO" ? "bg-amber-50 text-amber-600 border-amber-200" :
              "bg-surface-50 text-surface-400 border-surface-200"
            }`}
          >
            <option value="">Sin dato</option>
            <option value="SI">SI</option>
            <option value="PEDIDO">Pedido</option>
            <option value="NO">NO</option>
          </select>
        );
      }
      return val ? (
        <span className={`px-1.5 py-px rounded text-[10px] font-semibold ${val === "SI" ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : val === "PEDIDO" ? "bg-amber-50 text-amber-600 border border-amber-200" : "bg-red-50 text-red-500 border border-red-200"}`}>
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
      return (
        <span className="flex items-center gap-1 group/cell">
          {t.estado ? (
            <span className="cursor-pointer hover:opacity-70 transition-opacity" onClick={(e) => abrirInlineEstado(e, t.id)}>
              <StatusIcon clave={t.estado.clave} color={t.estado.color} size={14} />
            </span>
          ) : null}
          <span className="text-surface-800 font-medium truncate">{t.codigo || "\u2014"}</span>
          <NotesIndicator notas={t.notas} notasTecnico={t.notasTecnico} comentarios={t._count?.comentarios} tieneMas20Ap={t.camposExtra?.tieneMas20Ap} />
          <CopyBtn text={t.codigo || ""} />
        </span>
      );
    }
    if (col.id === "predio") {
      const txt = t[col.field] || t.nombre || "\u2014";
      return <span className="flex items-center group/cell"><span className="text-surface-700 truncate">{txt}</span><CopyBtn text={txt !== "\u2014" ? txt : ""} /></span>;
    }
    if (col.id === "provincia") {
      const explicita = t.provincia;
      const autoDetected = obtenerProvincia(explicita, t.codigo);
      if (!explicita && autoDetected) {
        return (
          <span className="flex items-center group/cell">
            <span className="text-surface-500 italic truncate" title="Detectado automáticamente">{autoDetected}</span>
            <CopyBtn text={autoDetected} />
          </span>
        );
      }
      const prov = autoDetected || "\u2014";
      return <span className="flex items-center group/cell"><span className="text-surface-700 truncate">{prov}</span><CopyBtn text={prov !== "\u2014" ? prov : ""} /></span>;
    }
    const val = t[col.field];
    const display = val != null && val !== "" ? String(val) : "\u2014";
    return <span className="flex items-center group/cell" title={display !== "\u2014" ? display : ""}><span className="text-surface-700 truncate">{display}</span><CopyBtn text={display !== "\u2014" ? display : ""} /></span>;
  };

  // Columnas visibles
  const ALWAYS_VISIBLE = useMemo(() => new Set(["codigoPredio", "predio", "fechaActualizacion", "etiquetas", "lacR", "asignados"]), []);
  const visibleColumns = useMemo(() => {
    const safeColumns = sanitizeTaskFieldConfigs(columns);
    if (hasTaskFieldConfig(espacio?.camposConfig)) return safeColumns.filter(c => ALWAYS_VISIBLE.has(c.id) || c.visible);
    return safeColumns.filter(c => {
      if (ALWAYS_VISIBLE.has(c.id)) return true;
      if (!c.visible) return false;
      return tareas.some((t: any) => {
        const v = c.field.startsWith("_custom_") ? t.camposExtra?.[c.field.substring(8)] : t[c.field];
        return v != null && v !== "";
      });
    });
  }, [columns, tareas, ALWAYS_VISIBLE, espacio?.camposConfig]);

  const hasServerFilters = Boolean(serverSearch || filterEstado !== "todos" || filterProvincia.trim() || filterPrioridad !== "todas" || filterAsignado !== "todos" || quickFilter !== "todos");
  const clearServerFilters = () => {
    setSearch("");
    setServerSearch("");
    setFilterEstado("todos");
    setFilterProvincia("");
    setFilterPrioridad("todas");
    setFilterAsignado("todos");
    setQuickFilter("todos");
  };

  const activeView = useMemo(() => savedViews.find((view) => view.id === activeViewId) || null, [activeViewId, savedViews]);

  const createViewSnapshot = useCallback((name: string, id?: string): TareasSavedView => ({
    id: id || `tareas-view-${Date.now()}`,
    name: name.trim().slice(0, 60) || "Vista del espacio",
    search,
    filters: { filterEstado, filterProvincia, filterPrioridad, filterAsignado, quickFilter: normalizeTaskQuickFilter(quickFilter), groupBy: normalizeTaskGroupBy(groupBy), includeSubspaces },
    sortConfig,
    columns: sanitizeTaskFieldConfigs(columns).map((col, index) => ({ id: col.id, visible: col.visible, order: index, width: col.width })),
    updatedAt: new Date().toISOString(),
  }), [columns, filterAsignado, filterEstado, filterPrioridad, filterProvincia, groupBy, includeSubspaces, quickFilter, search, sortConfig]);

  const persistSavedViews = useCallback(async (nextViews: TareasSavedView[]) => {
    setSavingView(true);
    try {
      const res = await fetch("/api/preferencias/tareas-vistas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scope: viewsScope, views: nextViews }),
      });
      if (!res.ok) throw new Error("save-failed");
      const data = await res.json();
      const views = Array.isArray(data.views) ? data.views : nextViews;
      setSavedViews(views);
      return views as TareasSavedView[];
    } finally {
      setSavingView(false);
    }
  }, [viewsScope]);

  async function saveNewView() {
    const view = createViewSnapshot(newViewName || `Vista ${savedViews.length + 1}`);
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

  function applySavedView(view: TareasSavedView) {
    const nextSearch = view.search || "";
    const filters = view.filters || {} as TareasSavedView["filters"];
    setSearch(nextSearch);
    setServerSearch(nextSearch.trim());
    setFilterEstado(filters.filterEstado || "todos");
    setFilterProvincia(filters.filterProvincia || "");
    setFilterPrioridad(filters.filterPrioridad || "todas");
    setFilterAsignado(filters.filterAsignado || "todos");
    setQuickFilter(normalizeTaskQuickFilter(filters.quickFilter));
    setGroupBy(normalizeTaskGroupBy(filters.groupBy));
    setIncludeSubspaces(filters.includeSubspaces !== false);
    setSortConfig(view.sortConfig || null);
    if (Array.isArray(view.columns) && view.columns.length > 0) {
      setColumns((current) => {
        const safeCurrent = sanitizeTaskFieldConfigs(current);
        const safeViewColumns = sanitizeTaskFieldConfigs(view.columns);
        const byId = new Map(safeCurrent.map((col) => [col.id, col]));
        const used = new Set<string>();
        const ordered = [...safeViewColumns]
          .sort((a, b) => a.order - b.order)
          .map((savedCol) => {
            const col = byId.get(savedCol.id);
            if (!col) return null;
            used.add(savedCol.id);
            return { ...col, visible: savedCol.visible !== false, ...(savedCol.width ? { width: savedCol.width } : {}) };
          })
          .filter(Boolean) as Column[];
        return [...ordered, ...safeCurrent.filter((col) => !used.has(col.id))];
      });
    }
    setActiveViewId(view.id);
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

  const getSavedViewSummary = useCallback((view: TareasSavedView) => {
    const filters = view.filters || {} as TareasSavedView["filters"];
    const count = [filters.filterEstado !== "todos", Boolean(filters.filterProvincia), filters.filterPrioridad !== "todas", filters.filterAsignado !== "todos", filters.quickFilter !== "todos", filters.includeSubspaces === false].filter(Boolean).length;
    return `${count} filtros · ${filters.groupBy ? `agrupa por ${filters.groupBy}` : "sin agrupacion"} · ${view.search ? `busca ${view.search}` : "sin busqueda"}`;
  }, []);

  const isPrediosBranch = useMemo(() => {
    const byId = new Map(allEspacios.map((item: any) => [item.id, item]));
    let current = byId.get(espacioId) || espacio;
    let guard = 0;
    while (current && guard < 30) {
      if (normalizeSpaceName(current.nombre).includes("predio")) return true;
      current = current.parentId ? byId.get(current.parentId) : null;
      guard += 1;
    }
    return normalizeSpaceName(espacio?.nombre).includes("predio");
  }, [allEspacios, espacio, espacioId]);

  const downloadLacRNo = () => {
    const tipos = ["nc", "cronogramas", "ocp"];
    tipos.forEach((tipo, index) => {
      const params = new URLSearchParams({ espacioId, tipo });
      if (includeSubspaces) params.set("includeSubspaces", "true");
      window.setTimeout(() => {
        const iframe = document.createElement("iframe");
        iframe.src = `/api/tareas/exports/no-conformes-lacr-no?${params.toString()}`;
        iframe.style.display = "none";
        iframe.setAttribute("aria-hidden", "true");
        document.body.appendChild(iframe);
        window.setTimeout(() => iframe.remove(), 30000);
      }, index * 350);
    });
  };

  const downloadEspacioExcel = () => {
    const params = new URLSearchParams({ espacioId });
    if (includeSubspaces) params.set("includeSubspaces", "true");
    else params.set("includeSubspaces", "false");
    if (serverSearch) params.set("buscar", serverSearch);
    if (filterEstado !== "todos") params.set("estado", filterEstado);
    if (filterProvincia.trim()) params.set("provincia", filterProvincia.trim());
    if (filterPrioridad !== "todas") params.set("prioridad", filterPrioridad);
    if (filterAsignado !== "todos") {
      params.set("asignadoId", filterAsignado);
      params.set("includeAllFields", "true");
    }
    if (quickFilter !== "todos") params.set("quick", quickFilter);

    const anchor = document.createElement("a");
    anchor.href = `/api/tareas/exports/espacio?${params.toString()}`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  // Suprimir warning de session no usada
  void session;

  // Mobile cards (render function, not component — avoids remount)
  const renderMobileTaskList = (taskItems: any[]) => (
    <div className="md:hidden divide-y divide-surface-100">
      {taskItems.map((t) => {
        const selected = selectedIds.has(t.id);
        return (
        <div
          key={t.id}
          onClick={() => setSelectedTareaId(t.id)}
          className={`w-full text-left px-3 py-3.5 active:bg-surface-100 transition-colors cursor-pointer ${selected ? "bg-primary-50/70" : "hover:bg-surface-50"}`}
        >
          <div className="flex items-start gap-2">
            {isModOrAdmin && (
              <input
                type="checkbox"
                checked={selected}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleSelect(t.id)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600"
                aria-label="Seleccionar tarea"
              />
            )}
            {t.estado ? (
              <span className="cursor-pointer active:opacity-60" onClick={(e) => abrirInlineEstado(e, t.id)}>
                <StatusIcon clave={t.estado.clave} color={t.estado.color} size={16} />
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                {t.codigo && <span className="shrink-0 text-sm font-semibold text-surface-800 tabular-nums">{t.codigo}</span>}
                <NotesIndicator notas={t.notas} notasTecnico={t.notasTecnico} comentarios={t._count?.comentarios} tieneMas20Ap={t.camposExtra?.tieneMas20Ap} />
                <p className="min-w-0 truncate text-sm font-medium text-surface-700">
                  {t.incidencias || t.nombre || "Sin nombre"}
                </p>
              </div>
              {t.nombre && t.incidencias && (
                <p className="mt-0.5 truncate text-xs text-surface-400">{t.nombre}</p>
              )}
            </div>
            {session?.rol === "ADMIN" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete({ type: "tarea", id: t.id, label: tareaDeleteLabel(t) });
                }}
                className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                title="Eliminar tarea"
                aria-label="Eliminar tarea"
              >
                <IconTrash className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2.5 mt-1.5 text-xs text-surface-500 flex-wrap">
            <span className="tabular-nums">{formatRelativeDate(t.updatedAt)}</span>
            {t.lacR && (
              <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${t.lacR?.toUpperCase() === "SI" ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-red-50 text-red-500 border border-red-200"}`}>
                LAC-R: {t.lacR}
              </span>
            )}
            {t.provincia && <span className="text-surface-400">{t.provincia}</span>}
          </div>
        </div>
        );
      })}
    </div>
  );

  // ── Renderizado progresivo ──────────────────────────────────
  const ROWS_BATCH = 100;
  const [renderLimits, setRenderLimits] = useState<Record<string, number>>({});
  const showMore = (key: string) => setRenderLimits(prev => ({ ...prev, [key]: (prev[key] || ROWS_BATCH) + ROWS_BATCH }));

  // Tabla reutilizable (render function, not component — avoids remount on every parent re-render)
  const renderTaskTable = (items: any[], groupKey = "_default") => {
    const limit = renderLimits[groupKey] || ROWS_BATCH;
    const visible = items.slice(0, limit);
    const hasMore = items.length > limit;
    return (
    <div className="overflow-x-auto">
      {renderMobileTaskList(visible)}
      <table className="w-full min-w-max text-[11px] hidden md:table">
        <thead>
          <tr className="border-b border-surface-100">
            {isModOrAdmin && (
              <th className="w-16 px-1 text-center">
                <input
                  type="checkbox"
                  checked={items.length > 0 && items.every(t => selectedIds.has(t.id))}
                  onChange={() => toggleSelectGroup(items)}
                  className="accent-primary-600 cursor-pointer w-3.5 h-3.5"
                />
              </th>
            )}
            {visibleColumns.map((col) => (
              <th
                key={col.id}
                draggable={isModOrAdmin}
                onDragStart={isModOrAdmin ? (e) => { if (resizingCol.current) { e.preventDefault(); return; } handleColDragStart(e, col.id); } : undefined}
                onDragOver={isModOrAdmin ? (e) => handleColDragOver(e, col.id) : undefined}
                onDrop={isModOrAdmin ? (e) => handleColDrop(e, col.id) : undefined}
                onDragEnd={isModOrAdmin ? handleColDragEnd : undefined}
                style={{ width: getColWidth(col), minWidth: 40 }}
                className={`text-left px-2.5 py-1.5 font-medium text-surface-400 uppercase text-[10px] tracking-wider ${isModOrAdmin ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'} hover:text-surface-600 transition-colors select-none relative ${
                  dragOverColId === col.id ? "border-l-2 border-surface-400" : ""
                } ${dragColId === col.id ? "opacity-40" : ""}`}
                onClick={() => { if (!didDragRef.current) toggleSort(col.field); }}
              >
                <span className="inline-flex items-center gap-0.5">
                  {col.label}
                  {sortConfig?.field === col.field && <IconSort dir={sortConfig.dir} />}
                </span>
                {/* Resize handle */}
                <span
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-surface-300/50 active:bg-surface-400/50"
                  onMouseDown={(e) => handleResizeStart(e, col.id, getColWidth(col))}
                  onClick={(e) => e.stopPropagation()}
                  draggable={false}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((t, idx) => (
            <tr
              key={t.id}
              onClick={() => setSelectedTareaId(t.id)}
              className={`cursor-pointer hover:bg-surface-50 ${idx % 2 === 0 ? "" : "bg-surface-50/40"} ${selectedIds.has(t.id) ? "bg-primary-50/60" : ""}`}
            >
              {isModOrAdmin && (
                <td className="w-16 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <span
                      draggable
                      onDragStart={(e) => handleRowDragStart(e, t.id)}
                      className="cursor-grab active:cursor-grabbing text-surface-300 hover:text-surface-500 px-0.5"
                      title="Arrastrar a un espacio"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                    </span>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggleSelect(t.id)}
                      className="accent-primary-600 cursor-pointer w-3.5 h-3.5"
                    />
                    {session?.rol === "ADMIN" && (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete({ type: "tarea", id: t.id, label: tareaDeleteLabel(t) })}
                        className="rounded p-0.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                        title="Eliminar tarea"
                        aria-label="Eliminar tarea"
                      >
                        <IconTrash className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </td>
              )}
              {visibleColumns.map((col) => {
                const raw = col.field.startsWith("_custom_") ? t.camposExtra?.[col.field.substring(8)] : t[col.field];
                const cellTitle = raw != null && raw !== "" ? String(raw) : "";
                return (
                  <td
                    key={col.id}
                    style={{ width: getColWidth(col), minWidth: 40, maxWidth: getColWidth(col) }}
                    className="px-2.5 py-1.5 text-surface-600 overflow-hidden"
                    title={cellTitle}
                  >
                    {renderCell(t, col)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && (
        <button
          onClick={() => showMore(groupKey)}
          className="w-full py-1.5 text-[11px] text-primary-600 hover:text-primary-700 hover:bg-primary-50 transition-colors font-medium"
        >
          Mostrar más ({items.length - limit} restantes)
        </button>
      )}
    </div>
    );
  };

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

  if (loadError && tareas.length === 0) {
    return (
      <div className="animate-fade-in-up flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-surface-500">No se pudieron cargar las tareas.</p>
        <button
          onClick={() => { setLoadError(false); setLoading(true); fetchData(); }}
          className="px-4 py-2 text-xs font-medium rounded-md border border-surface-200 text-surface-700 hover:bg-surface-50 transition-colors"
        >
          Reintentar
        </button>
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

  const isFacturadoSpace = espacio.nombre?.trim?.().toLowerCase() === "facturado";
  const hasSubspaces = espacio?.hijos?.length > 0;

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 sm:mb-1 gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: espacio.color + "20" }}>
            <svg className="w-3 h-3" fill="none" stroke={espacio.color} strokeWidth={1.7} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </div>
          <h1 className="min-w-0 truncate text-lg sm:text-xl font-semibold text-surface-800">{espacio.nombre}</h1>
          <span className="text-xs text-surface-400">
            {tareas.length} de {pagination.total || tareas.length} registros{serverSearch ? ` · filtro: ${serverSearch}` : ""}
          </span>
        </div>

        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:flex-nowrap">
          {hasSubspaces && (
            <label className="hidden sm:flex items-center gap-1.5 text-[11px] text-surface-500 border border-surface-200 rounded-md px-2 py-1.5 bg-white cursor-pointer select-none" title="Mostrar también tareas de subcarpetas">
              <input
                type="checkbox"
                checked={includeSubspaces}
                onChange={(e) => setIncludeSubspaces(e.target.checked)}
                className="h-3 w-3 accent-primary-600"
              />
              Subcarpetas
            </label>
          )}
          <button
            onClick={downloadEspacioExcel}
            className="px-2.5 py-1.5 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-md text-xs font-medium hover:bg-emerald-100 transition-colors flex items-center gap-1"
            title="Descargar Excel con las tareas, campos activos y estados de esta vista"
          >
            <IconDownload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Excel</span>
          </button>
          {session?.rol === "ADMIN" && isPrediosBranch && (
            <button
              onClick={downloadLacRNo}
              className="px-2.5 py-1.5 border border-red-200 bg-red-50 text-red-700 rounded-md text-xs font-medium hover:bg-red-100 transition-colors flex items-center gap-1"
              title="Descargar CSV LAC-R NO: NC, Cronogramas y OCP"
            >
              <IconDownload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">LAC-R NO</span>
            </button>
          )}
          {isModOrAdmin && !isFacturadoSpace && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-2.5 py-1.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 transition-colors flex items-center gap-1"
            >
              <IconPlus className="w-3.5 h-3.5" />
              Nueva
            </button>
          )}
          {/* Search */}
          <div className="relative min-w-0 flex-[1_1_100%] sm:flex-initial">
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
            className="min-w-0 flex-1 text-[11px] border border-surface-200 rounded-md px-2 py-1.5 bg-white text-surface-600 focus:outline-none focus:border-surface-400 sm:flex-none"
            title="Agrupar por"
          >
            {GROUP_BY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {isModOrAdmin && (
            <button
              onClick={() => setShowColumnConfig(!showColumnConfig)}
              className={`p-1.5 rounded-md transition-colors ${showColumnConfig ? "bg-surface-200 text-surface-700" : "text-surface-400 hover:bg-surface-100 hover:text-surface-600"}`}
              title="Configuración"
            >
              <IconSettings className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-4 overflow-x-auto border-b border-surface-200 sm:mb-5">
        <Link
          href={`/dashboard/tareas/espacio/${espacio.id}`}
          className="text-xs text-surface-400 hover:text-surface-600 pb-2 px-1 transition-colors"
        >
          Resumen
        </Link>
        <span className="whitespace-nowrap text-xs font-medium text-primary-600 border-b-2 border-primary-600 pb-2 px-1">
          {hasSubspaces && includeSubspaces ? "Tareas con subcarpetas" : "Tareas directas"} ({tareas.length}/{pagination.total || tareas.length})
        </span>
      </div>

      <SavedViewsBar
        title="Vistas del espacio"
        emptyText="Guarda filtros, orden, columnas y subcarpetas para este espacio"
        activeView={activeView}
        views={savedViews}
        saving={savingView}
        newViewName={newViewName}
        onNewViewNameChange={setNewViewName}
        onSave={saveNewView}
        onUpdate={updateActiveView}
        onApply={applySavedView}
        onDelete={deleteSavedView}
        getSummary={getSavedViewSummary}
      />

      <div className="mb-2 flex items-center justify-between sm:hidden">
        <button
          type="button"
          onClick={() => setShowMobileFilters((value) => !value)}
          className="rounded-md border border-surface-200 bg-white px-3 py-2 text-xs font-medium text-surface-600"
        >
          {showMobileFilters ? "Ocultar filtros" : "Mostrar filtros"}{hasServerFilters ? " activos" : ""}
        </button>
        {hasSubspaces && (
          <label className="flex items-center gap-1.5 rounded-md border border-surface-200 bg-white px-2.5 py-2 text-[11px] text-surface-500">
            <input type="checkbox" checked={includeSubspaces} onChange={(e) => setIncludeSubspaces(e.target.checked)} className="h-3 w-3 accent-primary-600" />
            Subcarpetas
          </label>
        )}
      </div>

      <div className={`mb-4 bg-white border border-surface-200 rounded-lg p-3 space-y-3 ${showMobileFilters ? "block" : "hidden"} sm:block`}>
        <div className="flex flex-wrap gap-2">
          {[
            { key: "todos", label: "Todos" },
            { key: "hoy", label: "Hoy" },
            { key: "vencidas", label: "Vencidas" },
            { key: "sin-gps", label: "Sin GPS" },
            { key: "sin-estado", label: "Sin estado" },
            { key: "sin-asignar", label: "Sin asignar" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setQuickFilter(item.key)}
              className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${quickFilter === item.key ? "bg-primary-600 border-primary-600 text-white" : "border-surface-200 text-surface-600 hover:bg-surface-50"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
            className="px-3 py-2 text-xs border border-surface-200 rounded-md bg-white focus:outline-none focus:border-surface-400"
          >
            <option value="todos">Todos los estados</option>
            {estados.map(e => <option key={e.id} value={e.clave}>{e.nombre}</option>)}
          </select>
          <input
            value={filterProvincia}
            onChange={(e) => setFilterProvincia(e.target.value)}
            placeholder="Provincia"
            list="pmn-provincias-espacio"
            className="px-3 py-2 text-xs border border-surface-200 rounded-md focus:outline-none focus:border-surface-400"
          />
          <datalist id="pmn-provincias-espacio">
            {PROVINCIAS.map(p => <option key={p} value={p} />)}
          </datalist>
          <select
            value={filterPrioridad}
            onChange={(e) => setFilterPrioridad(e.target.value)}
            className="px-3 py-2 text-xs border border-surface-200 rounded-md bg-white focus:outline-none focus:border-surface-400"
          >
            <option value="todas">Todas las prioridades</option>
            <option value="URGENTE">Urgente</option>
            <option value="ALTA">Alta</option>
            <option value="MEDIA">Media</option>
            <option value="BAJA">Baja</option>
          </select>
          <select
            value={filterAsignado}
            onChange={(e) => setFilterAsignado(e.target.value)}
            className="px-3 py-2 text-xs border border-surface-200 rounded-md bg-white focus:outline-none focus:border-surface-400"
          >
            <option value="todos">Todos los asignados</option>
            {allUsers.map((user) => <option key={user.id} value={user.id}>{user.nombre}</option>)}
          </select>
          <button
            onClick={clearServerFilters}
            disabled={!hasServerFilters}
            className="px-3 py-2 text-xs rounded-md border border-surface-200 text-surface-600 hover:bg-surface-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* Config panel — drawer lateral */}
      {showColumnConfig && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setShowColumnConfig(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative w-full sm:w-80 sm:max-w-[85vw] bg-white shadow-xl flex flex-col animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-surface-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => setShowColumnConfig(false)} className="text-surface-400 hover:text-surface-600 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <h3 className="text-sm font-semibold text-surface-800">Campos</h3>
              </div>
              <button onClick={() => setShowColumnConfig(false)} className="text-surface-400 hover:text-surface-600 transition-colors">
                <IconX className="w-4 h-4" />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-2">
              <input
                value={colSearch}
                onChange={(e) => setColSearch(e.target.value)}
                placeholder="Buscar campos nuevos o existentes"
                className="w-full px-3 py-1.5 text-xs border border-surface-300 rounded-md focus:outline-none focus:border-primary-400 bg-surface-50"
              />
            </div>

            {/* Tabs */}
            {isModOrAdmin && (
              <div className="px-4 flex gap-4 border-b border-surface-100">
                <button
                  onClick={() => setColConfigTab("crear")}
                  className={`pb-2 text-xs font-medium border-b-2 transition-colors ${
                    colConfigTab === "crear" ? "border-primary-500 text-primary-600" : "border-transparent text-surface-400 hover:text-surface-600"
                  }`}
                >
                  Crear
                </button>
                <button
                  onClick={() => setColConfigTab("existente")}
                  className={`pb-2 text-xs font-medium border-b-2 transition-colors ${
                    colConfigTab === "existente" ? "border-primary-500 text-primary-600" : "border-transparent text-surface-400 hover:text-surface-600"
                  }`}
                >
                  Añadir existente
                </button>
              </div>
            )}

            {/* Create tab */}
            {isModOrAdmin && colConfigTab === "crear" && (
              <div className="px-4 py-3 border-b border-surface-100">
                <div className="space-y-2">
                  <input
                    value={newColName}
                    onChange={e => setNewColName(e.target.value)}
                    placeholder="Nombre del campo"
                    className="w-full px-3 py-1.5 text-xs border border-surface-300 rounded-md focus:outline-none focus:border-primary-400"
                    onKeyDown={e => e.key === "Enter" && handleCreateCol()}
                    autoFocus
                  />
                  <select
                    value={newColType}
                    onChange={e => setNewColType(e.target.value as any)}
                    className="w-full px-3 py-1.5 text-xs border border-surface-300 rounded-md bg-white focus:outline-none focus:border-primary-400"
                  >
                    <option value="text">Texto</option>
                    <option value="badge">Badge (SI/NO)</option>
                    <option value="date">Fecha</option>
                    <option value="select">Selector</option>
                  </select>
                  {(newColType === "select" || newColType === "badge") && (
                    <input
                      value={newColOptions}
                      onChange={e => setNewColOptions(e.target.value)}
                      placeholder="Opciones separadas por coma"
                      className="w-full px-3 py-1.5 text-xs border border-surface-300 rounded-md focus:outline-none focus:border-primary-400"
                    />
                  )}
                  <button
                    onClick={handleCreateCol}
                    disabled={!newColName.trim() || creatingCol}
                    className="w-full px-3 py-1.5 text-xs bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 transition-colors font-medium"
                  >
                    {creatingCol ? "Creando..." : "Crear campo"}
                  </button>
                </div>
              </div>
            )}

            {/* Columns list */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                <span className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">Campos mostrados</span>
                {isModOrAdmin && (
                <button
                  onClick={() => setColumns(prev => prev.map(c => ({ ...c, visible: false })))}
                  className="text-[11px] text-surface-400 hover:text-surface-600 transition-colors"
                >
                  Ocultar todo
                </button>
                )}
              </div>
              <div className="px-2 pb-2">
                {columns
                  .filter(col => !colSearch || col.label.toLowerCase().includes(colSearch.toLowerCase()))
                  .map(col => (
                  <div
                    key={col.id}
                    className="flex items-center justify-between px-2 py-1.5 hover:bg-surface-50 rounded transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-surface-400 w-4 h-4 flex items-center justify-center flex-shrink-0">
                        {col.type === "date" ? (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                        ) : col.type === "badge" ? (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
                        ) : col.type === "select" ? (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M4 7h16M4 12h10M4 17h12" /></svg>
                        )}
                      </span>
                      <span className={`text-xs truncate ${col.visible ? "text-surface-700" : "text-surface-400"}`}>
                        {col.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {col.id.startsWith("custom_") && isModOrAdmin && (
                        <button
                          onClick={() => {
                            const clave = col.id.replace("custom_", "");
                            setConfirmDelete({ type: "campo", id: clave, label: col.label });
                          }}
                          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all p-0.5"
                          title="Eliminar campo"
                        >
                          <IconTrash className="w-3 h-3" />
                        </button>
                      )}
                      {isModOrAdmin ? (
                      <button
                        onClick={() => setColumns(prev => prev.map(c => c.id === col.id ? { ...c, visible: !c.visible } : c))}
                        className="relative inline-flex flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none"
                        style={{ width: 36, height: 20, backgroundColor: col.visible ? 'var(--color-primary-500, #3b82f6)' : '#cbd5e1' }}
                      >
                        <span
                          className="pointer-events-none inline-block rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out"
                          style={{ width: 16, height: 16, marginTop: 2, transform: col.visible ? 'translateX(18px)' : 'translateX(2px)' }}
                        />
                      </button>
                      ) : (
                        <span className={`text-[10px] font-medium ${col.visible ? 'text-emerald-500' : 'text-surface-300'}`}>{col.visible ? 'Visible' : 'Oculto'}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Estados (visibilidad + reordenar) */}
            {estados.length > 0 && (
              <div className="px-4 py-3 border-t border-surface-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">{isModOrAdmin ? 'Estados (arrastrar para reordenar)' : 'Estados'}</span>
                  {isModOrAdmin && <button onClick={() => setShowEstadoModal(true)} className="text-[11px] text-primary-500 hover:text-primary-700 font-medium">+ Nuevo</button>}
                </div>
                <div className="space-y-1">
                  {estados.filter(e => isModOrAdmin || !adminHiddenEstados.has(e.id)).map(e => {
                    const isHidden = userHiddenEstados.has(e.id);
                    return (
                      <div
                        key={e.id}
                        draggable={isModOrAdmin}
                        onDragStart={isModOrAdmin ? () => setDragEstadoId(e.id) : undefined}
                        onDragOver={isModOrAdmin ? (ev) => { ev.preventDefault(); setDragOverEstadoId(e.id); } : undefined}
                        onDrop={isModOrAdmin ? (ev) => { ev.preventDefault(); handleEstadoDrop(e.id); } : undefined}
                        onDragEnd={isModOrAdmin ? () => { setDragEstadoId(null); setDragOverEstadoId(null); } : undefined}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded border group transition-all ${
                          isHidden ? "opacity-40 bg-surface-50 border-surface-200" : "bg-white border-surface-200 hover:border-surface-300"
                        } ${isModOrAdmin ? 'cursor-grab active:cursor-grabbing' : ''} ${dragOverEstadoId === e.id ? "border-primary-400 bg-primary-50/30" : ""} ${dragEstadoId === e.id ? "opacity-40" : ""}`}
                      >
                        {isModOrAdmin && (
                        <span className="text-surface-300 cursor-grab">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M4 8h16M4 16h16" /></svg>
                        </span>
                        )}
                        <StatusIcon clave={e.clave} color={e.color} size={12} />
                        <span className={`text-xs flex-1 truncate ${isHidden ? "text-surface-400" : "text-surface-700"}`}>{e.nombre}</span>
                        {isModOrAdmin && (
                        <button
                          onClick={() => setUserHiddenEstados(prev => { const next = new Set(prev); if (next.has(e.id)) next.delete(e.id); else next.add(e.id); return next; })}
                          className="relative inline-flex flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none"
                          style={{ width: 28, height: 16, backgroundColor: !isHidden ? 'var(--color-primary-500, #3b82f6)' : '#cbd5e1' }}
                        >
                          <span className="pointer-events-none inline-block rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out" style={{ width: 12, height: 12, marginTop: 2, transform: !isHidden ? 'translateX(14px)' : 'translateX(2px)' }} />
                        </button>
                        )}
                        {isModOrAdmin && (
                          <button onClick={() => setConfirmDelete({ type: "estado", id: e.id, label: e.nombre })}
                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all p-0.5" title="Eliminar estado">
                            <IconTrash className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barra acciones masivas */}
      {isModOrAdmin && selectedIds.size > 0 && (
        <div className="sticky top-14 z-20 mb-3 p-2.5 bg-primary-50 border border-primary-200 rounded-lg flex items-center gap-2 flex-wrap shadow-sm animate-fade-in-up sm:top-auto sm:shadow-none">
          <span className="text-xs font-semibold text-primary-700">
            {selectedIds.size} seleccionado{selectedIds.size > 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-[11px] text-primary-600 hover:text-primary-800 underline"
          >
            Deseleccionar
          </button>
          {session?.rol === "ADMIN" && (
            <button
              type="button"
              onClick={handleDeleteSelectedTasks}
              disabled={bulkDeleting}
              className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              title="Eliminar tareas seleccionadas"
            >
              <IconTrash className="h-3 w-3" />
              Eliminar seleccionadas
            </button>
          )}
          <span className="text-surface-300 mx-1">|</span>
          <select
            value={bulkAction}
            onChange={e => { setBulkAction(e.target.value); setBulkValue(""); }}
            className="px-2 py-1 border border-primary-300 rounded text-xs bg-white focus:outline-none focus:border-primary-500 text-surface-700"
          >
            <option value="">— Acción masiva —</option>
            <option value="estadoId">Cambiar estado</option>
            <option value="espacioId">Mover a espacio</option>
            <option value="asignadoIds">Agregar asignados</option>
            <option value="replaceAsignadoIds">Reemplazar asignados</option>
            <option value="removeAsignadoIds">Quitar asignados</option>
            <option value="provincia">Cambiar provincia</option>
            <option value="ambito">Cambiar ámbito</option>
            <option value="prioridad">Cambiar prioridad</option>
            <option value="autoProvince">Auto-detectar provincia</option>
            <option value="autoGPS">Auto-parsear GPS → lat/lng</option>
            {session?.rol === "ADMIN" && <option value="enFacturacion">Mover a facturación</option>}
            {session?.rol === "ADMIN" && <option value="moverFacturado">Mover a Facturado</option>}
          </select>
          {bulkAction === "estadoId" && (
            <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="px-2 py-1 border border-primary-300 rounded text-xs bg-white focus:outline-none focus:border-primary-500">
              <option value="">— Estado —</option>
              {estados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          )}
          {bulkAction === "espacioId" && (
            <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="px-2 py-1 border border-primary-300 rounded text-xs bg-white focus:outline-none focus:border-primary-500">
              <option value="">— Espacio —</option>
              {allEspacios.length > 0 ? allEspacios.map(e => (
                <option key={e.id} value={e.id}>{"  ".repeat(e._depth || 0)}{(e._depth || 0) > 0 ? "└ " : ""}{e.nombre}</option>
              )) : <option disabled>Cargando...</option>}
            </select>
          )}
          {["asignadoIds", "replaceAsignadoIds", "removeAsignadoIds"].includes(bulkAction) && (
            <div className="min-w-[280px] max-w-[560px] rounded-md border border-primary-300 bg-white p-2 shadow-sm">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-surface-600">
                  {bulkAction === "asignadoIds" ? "Agregar" : bulkAction === "replaceAsignadoIds" ? "Dejar solo" : "Quitar"}: {selectedBulkUserIds.length || 0}
                </span>
                {selectedBulkUserIds.length > 0 && (
                  <button type="button" onClick={() => setBulkValue("")} className="text-[11px] text-primary-600 hover:text-primary-800">
                    Limpiar
                  </button>
                )}
              </div>
              <div className="grid max-h-32 grid-cols-2 gap-1 overflow-y-auto pr-1 sm:grid-cols-3">
                {allUsers.map(user => {
                  const checked = selectedBulkUserIds.includes(user.id);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => toggleBulkUser(user.id)}
                      className={`flex items-center gap-1.5 rounded border px-2 py-1 text-left text-[11px] transition-colors ${checked ? "border-primary-400 bg-primary-50 text-primary-700" : "border-surface-200 bg-white text-surface-600 hover:border-primary-200 hover:bg-primary-50/50"}`}
                      title={user.nombre}
                    >
                      <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${checked ? "border-primary-500 bg-primary-500 text-white" : "border-surface-300 bg-white"}`}>
                        {checked && <IconCheck className="h-2.5 w-2.5" />}
                      </span>
                      <span className="truncate">{user.nombre}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {bulkAction === "provincia" && (
            <input value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Ej: BUENOS AIRES" className="px-2 py-1 border border-primary-300 rounded text-xs bg-white focus:outline-none focus:border-primary-500 w-32" />
          )}
          {bulkAction === "ambito" && (
            <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="px-2 py-1 border border-primary-300 rounded text-xs bg-white focus:outline-none focus:border-primary-500">
              <option value="">— Ámbito —</option>
              <option value="Urbano">Urbano</option>
              <option value="Rural">Rural</option>
              <option value="Rural Disperso">Rural Disperso</option>
            </select>
          )}
          {bulkAction === "prioridad" && (
            <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="px-2 py-1 border border-primary-300 rounded text-xs bg-white focus:outline-none focus:border-primary-500">
              <option value="">— Prioridad —</option>
              <option value="BAJA">Baja</option>
              <option value="MEDIA">Media</option>
              <option value="ALTA">Alta</option>
              <option value="URGENTE">Urgente</option>
            </select>
          )}
          <button
            onClick={handleBulkAction}
            disabled={bulkExecuting || !bulkAction || (!["autoProvince", "autoGPS", "enFacturacion", "moverFacturado"].includes(bulkAction) && !bulkValue)}
            className="px-3 py-1 bg-primary-600 text-white rounded text-xs font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {bulkExecuting ? "Aplicando..." : "Aplicar"}
          </button>
        </div>
      )}

      {/* Tareas agrupadas */}
      <div className="space-y-2">
        {groupBy === "estado" ? (
        <>
        {/* Toggle para mostrar estados vacíos */}
        {estados.some(e => (groupCounts[e.id] ?? (groupedTareas[e.id] || []).length) === 0) && (
          <div className="flex justify-end mb-1">
            <button
              onClick={() => setShowEmptyStates(!showEmptyStates)}
              className="text-[11px] text-surface-400 hover:text-surface-600 transition-colors"
            >
              {showEmptyStates ? "Ocultar vacíos" : `Mostrar todos (${estados.filter(e => (groupCounts[e.id] ?? (groupedTareas[e.id] || []).length) === 0).length} vacíos)`}
            </button>
          </div>
        )}

        {estados.map((estado) => {
          const items = groupedTareas[estado.id] || [];
          const isExpanded = expandedSections.has(estado.id);

          const isKnownEmpty =
            groupCounts[estado.id] === 0 ||
            ((groupLoadState[estado.id] === "loaded" || !!serverSearch) && items.length === 0);
          if (isKnownEmpty && !showEmptyStates) return null;
          if (userHiddenEstados.has(estado.id) || adminHiddenEstados.has(estado.id)) return null;

          return (
            <div key={estado.id} className="bg-white border border-surface-200 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-50 transition-colors">
                <button onClick={() => toggleSection(estado.id)} className="flex items-center gap-2.5 flex-1 text-left">
                  <ChevronIcon expanded={isExpanded} className="w-3.5 h-3.5" />
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold tracking-wide text-white"
                    style={{ backgroundColor: `${estado.color}CC`, border: `1.5px solid ${estado.color}` }}
                  >
                    <StatusIcon clave={estado.clave} color="#fff" size={14} />
                    {estado.nombre}
                  </span>
                  <span className="text-[11px] text-surface-400 tabular-nums">{groupCounts[estado.id] ?? items.length}{groupLoadState[estado.id] === "loading" && " ..."}</span>
                </button>
                {session?.rol === "ADMIN" && items.length > 0 && (
                  <button
                    onClick={async () => { if (await confirm({ title: "Eliminar tareas", message: `¿Eliminar ${items.length} tareas de "${estado.nombre}"?`, confirmLabel: "Eliminar" })) handleBulkDelete(estado.id); }}
                    disabled={bulkDeleting && bulkDeleteGroup === estado.id}
                    className="text-[10px] text-red-400 hover:text-red-600 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50"
                    title="Eliminar todas en este estado"
                  >
                    {bulkDeleting && bulkDeleteGroup === estado.id ? "..." : <IconTrash className="w-3 h-3" />}
                  </button>
                )}
              </div>

              {isExpanded && (
                <div className="border-t border-surface-100">
                  {groupLoadState[estado.id] === "loading" ? (
                    <div className="flex justify-center py-6">
                      <div className="w-4 h-4 border-2 border-surface-200 border-t-primary-500 rounded-full animate-spin" />
                    </div>
                  ) : items.length === 0 ? (
                    <div className="text-center py-4 text-surface-300 text-[11px] italic">
                      Sin tareas en este estado
                    </div>
                  ) : (
                    renderTaskTable(items, estado.id)
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Sin estado */}
        {(groupedTareas["sin-estado"]?.length > 0 || groupLoadState["sin-estado"] === "loading" || groupLoadState["sin-estado"] === "loaded") && (
          <div className="bg-white border border-surface-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection("sin-estado")}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-50 transition-colors text-left"
            >
              <ChevronIcon expanded={expandedSections.has("sin-estado")} className="w-3.5 h-3.5" />
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold tracking-wide text-white bg-surface-500 border border-surface-400"
              >
                <span className="w-2 h-2 rounded-full bg-white/50 flex-shrink-0" />
                Sin estado
              </span>
              <span className="text-[11px] text-surface-400 tabular-nums">{(groupedTareas["sin-estado"] || []).length}{groupLoadState["sin-estado"] === "loading" && " ..."}</span>
            </button>
            {expandedSections.has("sin-estado") && (
              <div className="border-t border-surface-100">
                {groupLoadState["sin-estado"] === "loading" ? (
                  <div className="flex justify-center py-6">
                    <div className="w-4 h-4 border-2 border-surface-200 border-t-primary-500 rounded-full animate-spin" />
                  </div>
                ) : (
                  renderTaskTable(groupedTareas["sin-estado"] || [], "sin-estado")
                )}
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
                    {renderTaskTable(items, groupKey)}
                  </div>
                )}
              </div>
            );
          })}
        </>
        )}

        {pagination.hasMore && (
          <div className="flex justify-center pt-2">
            <button
              onClick={loadMoreTareas}
              disabled={loadingMore}
              className="px-4 py-2 text-xs rounded-md border border-surface-200 bg-white text-surface-600 hover:bg-surface-50 disabled:opacity-60 transition-colors"
            >
              {loadingMore ? "Cargando..." : `Cargar mas (${Math.max((pagination.total || 0) - tareas.length, 0)} restantes)`}
            </button>
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateTareaModal
          estados={estados}
          fieldsConfig={sanitizeTaskFieldConfigs(columns.filter((column) => column.visible))}
          isAdmin={session?.rol === "ADMIN"}
          initialEspacioId={espacioId}
          espacioNombre={espacio.nombre}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => fetchData()}
          onFieldsConfigChange={persistSpaceFields}
        />
      )}

      {/* Modal detalle */}
      {selectedTareaId && (
        <TareaDetalleModal
          tareaId={selectedTareaId}
          estados={estados}
          isModOrAdmin={isModOrAdmin}
          onClose={() => setSelectedTareaId(null)}
          onUpdated={fetchData}
          listColumns={sanitizeTaskFieldConfigs(columns)}
          variant="drawer"
        />
      )}

      {/* Modal crear estado */}
      {showEstadoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={handleCreateEstado} className="bg-white rounded-xl shadow-xl p-5 w-full max-w-xs mx-4 animate-fade-in-up">
            <h2 className="text-sm font-semibold text-surface-800 mb-3">Nuevo estado</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-surface-500 mb-1">Nombre</label>
                <input
                  required
                  value={nuevoEstado.nombre}
                  onChange={(e) => setNuevoEstado({ ...nuevoEstado, nombre: e.target.value })}
                  placeholder="Ej: EN PROGRESO"
                  className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300"
                />
              </div>
              <div>
                <label className="block text-[11px] text-surface-500 mb-1">Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={nuevoEstado.color}
                    onChange={(e) => setNuevoEstado({ ...nuevoEstado, color: e.target.value })}
                    className="w-8 h-8 rounded border border-surface-200 cursor-pointer p-0"
                  />
                  <input
                    type="text"
                    value={nuevoEstado.color}
                    onChange={(e) => setNuevoEstado({ ...nuevoEstado, color: e.target.value })}
                    className="flex-1 px-2.5 py-1.5 border border-surface-200 rounded-md text-xs font-mono focus:outline-none focus:border-surface-400"
                    placeholder="#3b82f6"
                  />
                </div>
              </div>
              <div className="py-2">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border"
                  style={{ borderColor: `${nuevoEstado.color}40`, color: nuevoEstado.color }}
                >
                  <StatusIcon clave={""} color={nuevoEstado.color} size={12} />
                  {nuevoEstado.nombre || "Nombre del estado"}
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setShowEstadoModal(false)} className="px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-100 rounded-md transition-colors">Cancelar</button>
              <button type="submit" className="px-3 py-1.5 text-xs bg-surface-800 text-white rounded-md hover:bg-surface-700 font-medium transition-colors">Crear</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal confirmar eliminación */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm mx-4 animate-fade-in-up">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <IconTrash className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Confirmar eliminación</h3>
                <p className="text-xs text-surface-500 mt-0.5">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <p className="text-xs text-surface-600 mb-4">
              ¿Eliminar <strong>{confirmDelete.label}</strong>?
              {confirmDelete.type === "estado" && " Las tareas en este estado quedarán sin estado."}
              {confirmDelete.type === "campo" && " La columna se ocultará de la tabla."}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-100 rounded-md transition-colors">Cancelar</button>
              <button onClick={handleConfirmDelete} className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 font-medium transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Dropdown inline de estado (fixed, fuera de tablas) */}
      <EstadoInlineDropdown ref={estadoDropdownRef} tareas={tareas} estados={estados} onChange={changeEstadoInline} />
      <AsignadosInlineEditor ref={asignadosEditorRef} tareas={tareas} users={allUsers} onSave={saveAsignados} />
    </div>
  );
}
