"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSession } from "@/hooks/useSession";
import { useSearchContext } from "@/contexts/SearchContext";
import { IconChevron, IconSettings, IconPlus, IconX, IconCheck, IconSort, IconTrash } from "@/components/ui/Icons";
import StatusIcon from "@/components/StatusIcon";
import EstadoInlineDropdown, { type EstadoInlineDropdownHandle } from "@/components/EstadoInlineDropdown";
import TareaDetalleModal from "@/components/TareaDetalleModal";
import CreateTareaModal from "@/components/tareas/CreateTareaModal";
import SavedViewsBar from "@/components/tareas/SavedViewsBar";
import TareaEtiquetasEditor, { type TareaEtiquetaValue } from "@/components/tareas/TareaEtiquetasEditor";
import { obtenerProvincia } from "@/utils/provinciaUtils";
import { dedupeUsersByName } from "@/utils/asignacionUtils";
import { normalizeTaskGroupBy, normalizeTaskQuickFilter, sanitizeTaskFieldConfigs } from "@/utils/taskFieldConfig";
import { toast } from "sonner";
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

// ═══════════════════════════════════════════════════════════════
// OPCIONES DE AGRUPACIÓN
// ═══════════════════════════════════════════════════════════════
const GROUP_BY_OPTIONS = [
  { value: "estado", label: "Estado" },
  { value: "provincia", label: "Provincia" },
  { value: "asignados", label: "Persona asignada" },
  { value: "lacR", label: "LAC-R" },
  { value: "ambito", label: "Ámbito" },
  { value: "ciudad", label: "Departamento" },
];

const SERVER_PAGE_SIZE = 1000;

// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════
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
  { id: "fechaActualizacion", label: "Fecha", field: "updatedAt", width: 85, visible: true, editable: false, type: "date" },
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

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function TareasPage() {
  const { session, isModOrAdmin } = useSession();
  const confirm = useConfirm();
  const { headerSearch } = useSearchContext();
  const [tareas, setTareas] = useState<any[]>([]);
  const [estados, setEstados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, total: 0, hasMore: false, limit: SERVER_PAGE_SIZE });
  const [groupCounts, setGroupCounts] = useState<Record<string, number> | null>(null);
  const [espacioSummary, setEspacioSummary] = useState<Record<string, { nombre: string; total: number }> | null>(null);
  const [filterEstado, setFilterEstado] = useState("todos");
  const [filterProvincia, setFilterProvincia] = useState("");
  const [filterPrioridad, setFilterPrioridad] = useState("todas");
  const [quickFilter, setQuickFilter] = useState("todos");
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Read URL params on mount (client-side only)
  const urlParamsRef = useRef<URLSearchParams | null>(null);
  if (typeof window !== "undefined" && !urlParamsRef.current) {
    urlParamsRef.current = new URLSearchParams(window.location.search);
  }
  const [search, setSearch] = useState(() => urlParamsRef.current?.get("search") || "");
  const [serverSearch, setServerSearch] = useState(() => urlParamsRef.current?.get("search") || "");
  const openTargetRef = useRef<string | null>(urlParamsRef.current?.get("open") || null);
  const openHandled = useRef(false);

  // Sincronizar búsqueda del Header global
  useEffect(() => {
    if (headerSearch === undefined) return;
    setSearch(headerSearch);
    setServerSearch(headerSearch.trim());
    if (headerSearch.trim()) {
      setFilterEstado("todos");
      setFilterProvincia("");
      setFilterPrioridad("todas");
      setQuickFilter("todos");
    }
  }, [headerSearch]);
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
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
  const [sortConfig, setSortConfig] = useState<{ field: string; dir: "asc" | "desc" } | null>(null);
  const [groupBy, setGroupBy] = useState("estado");
  const filtersLoadedRef = useRef(false);
  const filterSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savedViews, setSavedViews] = useState<TareasSavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [newViewName, setNewViewName] = useState("");
  const [savingView, setSavingView] = useState(false);
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<{ estadoId?: string; espacioId?: string }>({});
  const [showEstadoModal, setShowEstadoModal] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState({ nombre: "", color: "#3b82f6" });

  // Inline new column form
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState<"text" | "badge" | "date" | "select">("text");
  const [creatingCol, setCreatingCol] = useState(false);
  const [colConfigTab, setColConfigTab] = useState<"crear" | "existente">("existente");
  const [colSearch, setColSearch] = useState("");

  // Drag & drop columnas (refs para acceso sincrónico en event handlers)
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const didDragRef = useRef(false);

  // ── Renderizado progresivo ──────────────────────────────────
  const ROWS_BATCH = 100;
  const [renderLimits, setRenderLimits] = useState<Record<string, number>>({});
  const showMore = (key: string) => setRenderLimits(prev => ({ ...prev, [key]: (prev[key] || ROWS_BATCH) + ROWS_BATCH }));

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
  const getColWidth = (col: any) => resizeDelta && resizeDelta.id === col.id ? resizeDelta.width : col.width;

  // Persistir config de columnas — compartida vía servidor
  const colConfigLoaded = useRef(false);
  const hadSavedConfig = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const COL_CONFIG_KEY = "col-config-tareas";

  // Guardar config al servidor cuando ADMIN/MOD cambia columnas (debounced)
  useEffect(() => {
    if (!colConfigLoaded.current) return;
    if (!isModOrAdmin) return; // Técnicos no guardan
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
  }, [columns, isModOrAdmin]);

  // Confirmar eliminación
  const [confirmDelete, setConfirmDelete] = useState<{ type: string; id: string; label: string } | null>(null);

  // Eliminación masiva
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteGroup, setBulkDeleteGroup] = useState<string | null>(null);

  // Selección múltiple para edición masiva
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string>("");
  const [bulkValue, setBulkValue] = useState<string>("");
  const [bulkExecuting, setBulkExecuting] = useState(false);
  const selectedBulkUserIds = useMemo(() => bulkValue ? bulkValue.split(",").filter(Boolean) : [], [bulkValue]);

  // Mostrar/ocultar estados vacíos
  const [showEmptyStates, setShowEmptyStates] = useState(false);

  // Estados individuales ocultos por el usuario
  const [userHiddenEstados, setUserHiddenEstados] = useState<Set<string>>(new Set());

  // Persistir showEmptyStates y estados ocultos por el usuario
  useEffect(() => {
    try {
      const savedEmpty = localStorage.getItem("pmn-show-empty-states");
      if (savedEmpty !== null) setShowEmptyStates(savedEmpty === "true");
      const savedHidden = localStorage.getItem("pmn-user-hidden-estados");
      if (savedHidden) setUserHiddenEstados(new Set(JSON.parse(savedHidden)));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem("pmn-show-empty-states", String(showEmptyStates));
  }, [showEmptyStates]);

  useEffect(() => {
    localStorage.setItem("pmn-user-hidden-estados", JSON.stringify(Array.from(userHiddenEstados)));
  }, [userHiddenEstados]);

  // Estados ocultos por permisos de rol
  const [hiddenEstadoIds, setHiddenEstadoIds] = useState<Set<string>>(new Set());

  // Usuarios para asignación
  const [allUsers, setAllUsers] = useState<{ id: string; nombre: string; rol: string }[]>([]);

  const [espacios, setEspacios] = useState<any[]>([]);

  // Modal de detalle
  const [selectedTarea, setSelectedTarea] = useState<any>(null);

  // Dropdown inline de estado en la lista (estado propio, no re-renderiza la tabla al abrir/cerrar)
  const estadoDropdownRef = useRef<EstadoInlineDropdownHandle>(null);

  const abrirInlineEstado = (e: React.MouseEvent, tareaId: string) => {
    e.stopPropagation();
    estadoDropdownRef.current?.toggle(tareaId, e.currentTarget as HTMLElement);
  };

  const openCreateModal = useCallback((defaults: { estadoId?: string; espacioId?: string } = {}) => {
    setCreateDefaults(defaults);
    setShowModal(true);
  }, []);

  // Cargar datos
  const autoHideDone = useRef(false);
  const fetchTareasRequestRef = useRef(0);
  const fetchTareas = useCallback(async (options?: { page?: number; append?: boolean }) => {
    const pageToLoad = options?.page || 1;
    const append = options?.append || false;
    const requestId = ++fetchTareasRequestRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);

    // Cargar config compartida del servidor ANTES de auto-hide
    if (!colConfigLoaded.current) {
      try {
        const cfgRes = await fetch(`/api/config-vista?clave=${COL_CONFIG_KEY}`, { credentials: "include" });
        if (cfgRes.ok) {
          const cfgData = await cfgRes.json();
          if (cfgData?.config) {
            hadSavedConfig.current = true;
            const config = sanitizeTaskFieldConfigs(cfgData.config as { id: string; visible: boolean; order: number; width?: number }[]);
            setColumns(prev => {
              const safePrev = sanitizeTaskFieldConfigs(prev);
              const orderMap = new Map(config.map((c, i) => [c.id, { visible: c.visible, order: i, width: c.width }]));
              // Columnas que nunca deben ocultarse aunque el config guardado las tenga como hidden
              const FORCE_VISIBLE = new Set(["codigoPredio", "predio", "fechaActualizacion"]);
              return [...safePrev]
                .map(col => {
                  const cfg = orderMap.get(col.id);
                  return cfg ? { ...col, visible: FORCE_VISIBLE.has(col.id) ? true : cfg.visible, ...(cfg.width != null ? { width: cfg.width } : {}) } : col;
                })
                .sort((a, b) => {
                  const oa = orderMap.get(a.id)?.order ?? 999;
                  const ob = orderMap.get(b.id)?.order ?? 999;
                  return oa - ob;
                });
            });
          }
        }
      } catch { /* ignore */ }
      colConfigLoaded.current = true;
    }

    if (fetchTareasRequestRef.current !== requestId) return;

    const params = new URLSearchParams({ limit: String(SERVER_PAGE_SIZE), page: String(pageToLoad) });
    if (serverSearch) params.set("buscar", serverSearch);
    if (filterEstado !== "todos") params.set("estado", filterEstado);
    if (filterProvincia.trim()) params.set("provincia", filterProvincia.trim());
    if (filterPrioridad !== "todas") params.set("prioridad", filterPrioridad);
    if (quickFilter !== "todos") params.set("quick", quickFilter);
    params.set("groupBy", groupBy);
    const res = await fetch(`/api/tareas?${params.toString()}`, { credentials: "include" });
    if (fetchTareasRequestRef.current !== requestId) return;
    if (res.ok) {
      const data = await res.json();
      if (fetchTareasRequestRef.current !== requestId) return;
      const predios = data.predios || [];
      setTareas(prev => {
        if (!append) return predios;
        const seen = new Set(prev.map((item: any) => item.id));
        return [...prev, ...predios.filter((item: any) => !seen.has(item.id))];
      });
      setPagination({ page: data.page || pageToLoad, total: data.total || predios.length, hasMore: Boolean(data.hasMore), limit: data.limit || SERVER_PAGE_SIZE });
      setGroupCounts(data.groupCounts || null);
      setEspacioSummary(data.espacioSummary || null);
      if (!append) {
        setSelectedIds(new Set());
        setRenderLimits({});
      }

      // Auto-ocultar columnas sin datos (solo si NO hay config guardada en servidor)
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
    if (fetchTareasRequestRef.current === requestId) {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [filterEstado, filterPrioridad, filterProvincia, groupBy, quickFilter, serverSearch]);

  useEffect(() => {
    fetch("/api/preferencias/tareas-filtros", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        const cfg = data?.config;
        if (!cfg) return;
        setFilterEstado(cfg.filterEstado || "todos");
        setFilterProvincia(cfg.filterProvincia || "");
        setFilterPrioridad(cfg.filterPrioridad || "todas");
        setQuickFilter(normalizeTaskQuickFilter(cfg.quickFilter));
        setGroupBy(normalizeTaskGroupBy(cfg.groupBy));
        if (cfg.sortConfig !== undefined) setSortConfig(cfg.sortConfig);
      })
      .catch(() => {})
      .finally(() => { filtersLoadedRef.current = true; });
  }, []);

  useEffect(() => {
    fetch("/api/preferencias/tareas-vistas?scope=general", { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setSavedViews(Array.isArray(data?.views) ? data.views : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!filtersLoadedRef.current) return;
    if (filterSaveTimerRef.current) clearTimeout(filterSaveTimerRef.current);
    filterSaveTimerRef.current = setTimeout(() => {
      fetch("/api/preferencias/tareas-filtros", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filterEstado, filterProvincia, filterPrioridad, quickFilter, groupBy, sortConfig }),
      }).catch(() => {});
    }, 900);
    return () => { if (filterSaveTimerRef.current) clearTimeout(filterSaveTimerRef.current); };
  }, [filterEstado, filterPrioridad, filterProvincia, groupBy, quickFilter, sortConfig]);

  const loadMoreTareas = useCallback(() => {
    if (loadingMore || !pagination.hasMore) return;
    fetchTareas({ page: pagination.page + 1, append: true });
  }, [fetchTareas, loadingMore, pagination.hasMore, pagination.page]);

  useEffect(() => {
    fetchTareas();
    fetch("/api/estados", { credentials: "include" })
      .then(r => r.ok ? r.json() : { estados: [] })
      .then(d => {
        const est = d.estados || [];
        setEstados(est);
        const ids = est.map((e: any) => e.id);
        ids.push("sin-estado");
        setExpandedSections(new Set(ids));
      });
    // Cargar permisos de visibilidad de estados
    if (session?.rol && session.rol !== "ADMIN") {
      fetch("/api/permisos/estados", { credentials: "include" })
        .then(r => r.ok ? r.json() : { permisos: [], permisosUsuario: [] })
        .then(d => {
          const perms = d.permisos || [];
          const permsUsuario = d.permisosUsuario || [];
          const hidden = new Set<string>();
          // Ocultar por rol
          for (const p of perms) {
            if (p.rol === session.rol && !p.visible) {
              hidden.add(p.estadoId);
            }
          }
          // Ocultar por usuario individual (tiene prioridad)
          for (const p of permsUsuario) {
            if (p.userId === session.userId && !p.visible) {
              hidden.add(p.estadoId);
            } else if (p.userId === session.userId && p.visible) {
              hidden.delete(p.estadoId);
            }
          }
          setHiddenEstadoIds(hidden);
        })
        .catch(() => {});
    }
    // Cargar campos personalizados y agregar como columnas
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
            return sanitizeTaskFieldConfigs(newCols.length > 0 ? [...prev, ...newCols] : prev);
          });
        }
      })
      .catch(() => {});
    // Cargar usuarios para asignación
    if (isModOrAdmin) {
      fetch("/api/catalogos/usuarios", { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then((data) => setAllUsers(dedupeUsersByName(Array.isArray(data) ? data : [])))
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
          setEspacios(flat);
        })
        .catch(() => {});
    }
  }, [fetchTareas, isModOrAdmin, session?.rol, session?.userId]);

  // Recargar tareas cuando el sidebar reporta un drop exitoso
  useEffect(() => {
    const handler = () => fetchTareas();
    window.addEventListener("espacios-updated", handler);
    return () => window.removeEventListener("espacios-updated", handler);
  }, [fetchTareas]);

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
        openDetail(tarea);
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }
    }
    
    if (openCode && !loading && tareas.length > 0) {
      const tarea = tareas.find(t => t.codigo === openCode);
      if (tarea) {
        openHandled.current = true;
        openDetail(tarea);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, [tareas, loading]);

  // Agrupar tareas
  const groupedTareas = useMemo(() => {
    let filtered = tareas;
    if (search && !serverSearch) {
      const s = search.toLowerCase();
      filtered = tareas.filter(t => {
        const prov = obtenerProvincia(t.provincia, t.codigo);
        if (
          t.nombre?.toLowerCase().includes(s) ||
          t.codigo?.toLowerCase().includes(s) ||
          t.incidencias?.toLowerCase().includes(s) ||
          t.cue?.toLowerCase().includes(s) ||
          prov.toLowerCase().includes(s) ||
          t.asignaciones?.some((a: any) => a.usuario?.nombre?.toLowerCase().includes(s)) ||
          t.etiquetas?.some((rel: any) => rel.etiqueta?.nombre?.toLowerCase().includes(s))
        ) return true;
        if (t.camposExtra) {
          for (const val of Object.values(t.camposExtra)) {
            if (String(val).toLowerCase().includes(s)) return true;
          }
        }
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
        const estadoId = t.estadoId || "sin-estado";
        if (groups[estadoId]) groups[estadoId].push(t);
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
    // Ordenar claves alfabéticamente
    const sorted: Record<string, any[]> = {};
    for (const k of Object.keys(groups).sort((a, b) => a.localeCompare(b, "es"))) {
      sorted[k] = groups[k];
    }
    return sorted;
  }, [tareas, estados, search, serverSearch, sortConfig, groupBy]);

  const getGroupTotal = useCallback((key: string, loadedCount: number) => {
    return groupCounts?.[key] ?? loadedCount;
  }, [groupCounts]);

  // Abrir modal de detalle compartido con vistas de espacios/subcarpetas
  function openDetail(tarea: any) {
    setSelectedTarea(tarea);
  }

  function closeDetail() {
    setSelectedTarea(null);
  }

  // Cambiar estado desde el selector inline de la tabla
  async function changeEstado(tareaId: string, estadoId: string) {
    const newEstado = estados.find(e => e.id === estadoId);

    const res = await fetch(`/api/tareas/${tareaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ estadoId }),
    });

    if (res.ok) {
      setTareas(prev => prev.map(t => t.id === tareaId ? { ...t, estadoId, estado: newEstado } : t));
      fetchTareas();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Error al cambiar estado");
    }
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
        if (selectedTarea?.id === tareaId) {
          setSelectedTarea((prev: any) => ({ ...prev, [field]: value, ...extra }));
        }
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
      if (selectedTarea?.id === tareaId) {
        setSelectedTarea((prev: any) => ({ ...prev, etiquetas: nextEtiquetas }));
      }
    }
  }

  // Crear estado
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
      setEstados(prev => [...prev, newEst]);
      setExpandedSections(prev => {
        const next = new Set(prev);
        next.add(newEst.id);
        return next;
      });
      setNuevoEstado({ nombre: "", color: "#3b82f6" });
      setShowEstadoModal(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ELIMINACIÓN
  // ═══════════════════════════════════════════════════════════════
  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    const { type, id } = confirmDelete;
    setConfirmDelete(null);

    if (type === "tarea") {
      const res = await fetch(`/api/tareas/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        setTareas(prev => prev.filter(t => t.id !== id));
        if (selectedTarea?.id === id) closeDetail();
      }
    } else if (type === "estado") {
      const res = await fetch(`/api/estados/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        setEstados(prev => prev.filter(e => e.id !== id));
        fetchTareas();
      }
    } else if (type === "campo") {
      // id es la clave del campo
      const res = await fetch(`/api/campos-personalizados?clave=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        setColumns(prev => prev.filter(c => c.id !== `custom_${id}`));
      }
    }
  }

  // Eliminación masiva de grupo (elimina TODOS los del estado, no solo los visibles)
  async function handleBulkDelete(groupId: string) {
    const items = groupedTareas[groupId] || [];
    if (items.length === 0) return;
    setBulkDeleting(true);
    try {
      const res = await fetch(`/api/tareas?estadoId=${encodeURIComponent(groupId)}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        await fetchTareas();
      }
    } catch { /* ignore */ }
    setBulkDeleting(false);
    setBulkDeleteGroup(null);
  }

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
      await fetchTareas();
      toast.success(`${data.count || ids.length} tarea${(data.count || ids.length) !== 1 ? "s" : ""} eliminada${(data.count || ids.length) !== 1 ? "s" : ""}`, { id: toastId });
    } catch {
      toast.error("No se pudieron eliminar las tareas", { id: toastId });
    } finally {
      setBulkDeleting(false);
    }
  }

  // Toggle selección individual
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Seleccionar/deseleccionar todo un grupo
  function toggleSelectGroup(items: any[]) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = items.every(t => next.has(t.id));
      if (allSelected) {
        items.forEach(t => next.delete(t.id));
      } else {
        items.forEach(t => next.add(t.id));
      }
      return next;
    });
  }

  // Ejecutar acción masiva
  async function handleBulkAction() {
    if (selectedIds.size === 0 || !bulkAction) return;
    setBulkExecuting(true);
    try {
      const ids = Array.from(selectedIds);
      let actionKey = bulkAction;
      let actionValue: any = bulkValue;

      // Marcar para facturación
      if (bulkAction === "enFacturacion") {
        actionValue = true;
      }
      // Mover a espacio Facturado
      if (bulkAction === "moverFacturado") {
        // Buscar el espacio Facturado de la lista plana
        const facturadoEsp = espacios.find((e: any) => e.nombre === "Facturado" && !e.parentId);
        if (!facturadoEsp) {
          toast.error("El espacio 'Facturado' no existe. Créalo primero.");
          setBulkExecuting(false);
          return;
        }
        actionKey = "espacioId";
        actionValue = facturadoEsp.id;
      }
      if (bulkAction === "asignadoIds") {
        actionValue = bulkValue.split(",").filter(Boolean);
      }
      if (bulkAction === "replaceAsignadoIds" || bulkAction === "removeAsignadoIds") {
        actionValue = bulkValue.split(",").filter(Boolean);
      }

      const res = await fetch("/api/tareas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids, action: actionKey, value: actionValue }),
      });

      if (res.ok) {
        await res.json();
        setSelectedIds(new Set());
        setBulkAction("");
        setBulkValue("");
        await fetchTareas();
        // Notificación de éxito implícita por el refresh
      }
    } catch { /* ignore */ }
    setBulkExecuting(false);
  }

  function toggleBulkUser(userId: string) {
    const next = new Set(selectedBulkUserIds);
    if (next.has(userId)) next.delete(userId); else next.add(userId);
    setBulkValue(Array.from(next).join(","));
  }

  // Crear columna personalizada inline
  async function handleCreateCol() {
    const nombre = newColName.trim();
    if (!nombre || creatingCol) return;
    setCreatingCol(true);
    try {
      const res = await fetch("/api/campos-personalizados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nombre, tipo: newColType }),
      });
      if (res.ok) {
        const campo = await res.json();
        const colId = `custom_${campo.clave}`;
        setColumns(prev => {
          if (prev.some(c => c.id === colId)) return prev;
          return [...prev, {
            id: colId,
            label: campo.nombre,
            field: `_custom_${campo.clave}`,
            width: campo.ancho || 100,
            visible: true,
            editable: true,
            type: (campo.tipo || "text") as "text" | "badge" | "date" | "select",
            options: campo.opciones?.length ? campo.opciones : undefined,
          }];
        });
        setNewColName("");
        setNewColType("text");
        setColConfigTab("existente");
      }
    } catch { /* ignore */ }
    setCreatingCol(false);
  }

  // Drag & drop columnas

  function handleRowDragStart(e: React.DragEvent, tareaId: string) {
    // Si la fila está seleccionada, arrastrar todas las seleccionadas; si no, solo esta
    const ids = selectedIds.has(tareaId) && selectedIds.size > 1
      ? Array.from(selectedIds) : [tareaId];
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/x-predio-ids", JSON.stringify(ids));
    // Guardar en window para que el sidebar pueda leerlos en el drop
    (window as any).__draggedPredioIds = ids;
    (window as any).__draggedPredioFields = visibleColumns.filter((col) => col.id.startsWith("custom_"));
  }

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
    // Resetear didDrag después de un tick para que onClick lo lea antes del reset
    setTimeout(() => { didDragRef.current = false; }, 0);
  }

  // Helper: render column header con resize + drag + sort
  const renderColHeader = (col: any) => (
    <th
      key={col.id}
      draggable={isModOrAdmin}
      onDragStart={isModOrAdmin ? (e: React.DragEvent) => { if (resizingCol.current) { e.preventDefault(); return; } handleColDragStart(e, col.id); } : undefined}
      onDragOver={isModOrAdmin ? (e: React.DragEvent) => handleColDragOver(e, col.id) : undefined}
      onDrop={isModOrAdmin ? (e: React.DragEvent) => handleColDrop(e, col.id) : undefined}
      onDragEnd={isModOrAdmin ? handleColDragEnd : undefined}
      style={{ width: getColWidth(col), minWidth: 40 }}
      className={`text-left px-2.5 py-1.5 font-medium text-surface-400 uppercase text-[10px] tracking-wider ${isModOrAdmin ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'} hover:text-surface-600 transition-colors select-none relative ${
        dragOverColId === col.id ? "border-l-2 border-surface-400" : ""
      } ${dragColId === col.id ? "opacity-40" : ""}`}
      onClick={() => { if (!didDragRef.current) toggleSort(col.field); }}
    >
      <span className="inline-flex items-center gap-0.5">
        {col.label}
        {sortConfig && sortConfig.field === col.field && <IconSort dir={sortConfig.dir} />}
      </span>
      <span
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-surface-300/50 active:bg-surface-400/50"
        onMouseDown={(e) => handleResizeStart(e, col.id, getColWidth(col))}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
    </th>
  );

  // Helpers
  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
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
    if (!d) return "-";
    return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  };

  const formatRelativeDate = (d: string | null) => {
    if (!d) return "-";
    const now = new Date();
    const date = new Date(d);
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return "Ahora";
    if (diffMin < 60) return `Hace ${diffMin} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays === 1) return "Ayer";
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} sem`;
    return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  };

  // Render de celda en tabla
  const renderCell = (t: any, col: Column) => {
    // Campos personalizados: leer desde camposExtra JSON
    if (col.field.startsWith("_custom_")) {
      const clave = col.field.substring(8);
      const val = t.camposExtra?.[clave];
      if (!val) return <span className="text-surface-300">&mdash;</span>;
      return <span className="flex items-center group/cell"><span className="text-surface-700 truncate">{val}</span><CopyBtn text={val} /></span>;
    }
    if (col.id === "fechaActualizacion") {
      return <span className="text-surface-500 text-[10px]" title={t.updatedAt ? new Date(t.updatedAt).toLocaleString("es-AR") : ""}>{formatRelativeDate(t.updatedAt)}</span>;
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
    if (col.id === "asignados") {
      const asigns = t.asignaciones || [];
      if (asigns.length === 0) {
        return <span className="text-surface-300">&mdash;</span>;
      }
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
    // Para la columna "codigoPredio", mostrar icono estado + codigo + indicador notas
    if (col.id === "codigoPredio") {
      const displayCode = t.codigo || "\u2014";
      return (
        <span className="flex items-center gap-1 group/cell">
          {t.estado ? (
            <span className="cursor-pointer hover:opacity-70 transition-opacity" onClick={(e) => abrirInlineEstado(e, t.id)}>
              <StatusIcon clave={t.estado.clave} color={t.estado.color} size={14} />
            </span>
          ) : null}
          <span className="text-surface-800 font-medium truncate">{displayCode}</span>
          <NotesIndicator notas={t.notas} notasTecnico={t.notasTecnico} comentarios={t._count?.comentarios} tieneMas20Ap={t.camposExtra?.tieneMas20Ap} />
          <CopyBtn text={t.codigo || ""} />
        </span>
      );
    }
    // Para la columna "predio" (incidencias)
    if (col.id === "predio") {
      const txt = t[col.field] || "\u2014";
      return <span className="flex items-center group/cell"><span className="text-surface-700 truncate">{txt}</span><CopyBtn text={txt !== "\u2014" ? txt : ""} /></span>;
    }
    // Provincia: auto-detectar si está vacío
    if (col.id === "provincia") {
      const prov = obtenerProvincia(t.provincia, t.codigo);
      if (!prov) return <span className="text-surface-300">&mdash;</span>;
      const isAutoDetected = !t.provincia && prov;
      return (
        <span className="flex items-center group/cell">
          <span className={`truncate ${isAutoDetected ? "text-surface-400 italic" : "text-surface-700"}`} title={isAutoDetected ? "Detectado automáticamente" : undefined}>{prov}</span>
          <CopyBtn text={prov} />
        </span>
      );
    }
    const val = t[col.field];
    const display = val != null && val !== "" ? String(val) : "\u2014";
    return <span className="flex items-center group/cell"><span className="text-surface-700 truncate">{display}</span><CopyBtn text={display !== "\u2014" ? display : ""} /></span>;
  };

  // Columnas visibles: respetar configuración del usuario (toggle del drawer)
  const ALWAYS_VISIBLE_COLS = useMemo(() => new Set(["codigoPredio", "predio", "fechaActualizacion"]), []);
  const visibleColumns = useMemo(() => {
    return sanitizeTaskFieldConfigs(columns).filter(c => {
      if (ALWAYS_VISIBLE_COLS.has(c.id)) return true;
      if (!c.visible) return false;
      if (!c.id.startsWith("custom_")) return true;
      return tareas.some((t: any) => {
        const clave = c.field.startsWith("_custom_") ? c.field.substring(8) : c.id.replace(/^custom_/, "");
        const v = t.camposExtra?.[clave];
        return v != null && v !== "";
      });
    });
  }, [columns, tareas]);

  const hasServerFilters = Boolean(serverSearch || filterEstado !== "todos" || filterProvincia.trim() || filterPrioridad !== "todas" || quickFilter !== "todos");
  const clearServerFilters = () => {
    setSearch("");
    setServerSearch("");
    setFilterEstado("todos");
    setFilterProvincia("");
    setFilterPrioridad("todas");
    setQuickFilter("todos");
  };

  const activeView = useMemo(() => savedViews.find((view) => view.id === activeViewId) || null, [activeViewId, savedViews]);

  const createViewSnapshot = useCallback((name: string, id?: string): TareasSavedView => ({
    id: id || `tareas-view-${Date.now()}`,
    name: name.trim().slice(0, 60) || "Vista de tareas",
    search,
    filters: { filterEstado, filterProvincia, filterPrioridad, quickFilter: normalizeTaskQuickFilter(quickFilter), groupBy: normalizeTaskGroupBy(groupBy) },
    sortConfig,
    columns: sanitizeTaskFieldConfigs(columns).map((col, index) => ({ id: col.id, visible: col.visible, order: index, width: col.width })),
    updatedAt: new Date().toISOString(),
  }), [columns, filterEstado, filterPrioridad, filterProvincia, groupBy, quickFilter, search, sortConfig]);

  const persistSavedViews = useCallback(async (nextViews: TareasSavedView[]) => {
    setSavingView(true);
    try {
      const res = await fetch("/api/preferencias/tareas-vistas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scope: "general", views: nextViews }),
      });
      if (!res.ok) throw new Error("save-failed");
      const data = await res.json();
      const views = Array.isArray(data.views) ? data.views : nextViews;
      setSavedViews(views);
      return views as TareasSavedView[];
    } finally {
      setSavingView(false);
    }
  }, []);

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
    setQuickFilter(normalizeTaskQuickFilter(filters.quickFilter));
    setGroupBy(normalizeTaskGroupBy(filters.groupBy));
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
    const count = [filters.filterEstado !== "todos", Boolean(filters.filterProvincia), filters.filterPrioridad !== "todas", filters.quickFilter !== "todos"].filter(Boolean).length;
    return `${count} filtros · ${filters.groupBy ? `agrupa por ${filters.groupBy}` : "sin agrupacion"} · ${view.search ? `busca ${view.search}` : "sin busqueda"}`;
  }, []);

  // Suprimir warning de session no usada
  void session;

  // Mobile card list for task items (< md breakpoint)
  const MobileTaskList = ({ items: taskItems }: { items: any[] }) => (
    <div className="md:hidden divide-y divide-surface-100">
      {taskItems.map((t) => {
        const selected = selectedIds.has(t.id);
        return (
        <div
          key={t.id}
          onClick={() => openDetail(t)}
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
            <span className="tabular-nums" title={t.updatedAt ? new Date(t.updatedAt).toLocaleString("es-AR") : ""}>{formatRelativeDate(t.updatedAt)}</span>
            {t.lacR && (
              <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${t.lacR?.toUpperCase() === "SI" ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-red-50 text-red-500 border border-red-200"}`}>
                LAC-R: {t.lacR}
              </span>
            )}
            {t.asignaciones?.length > 0 && (
              <span className="px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded text-[11px] font-medium">
                {t.asignaciones.map((a: any) => a.usuario?.nombre?.split(" ")[0]).join(", ")}
              </span>
            )}
            {(t.etiquetas?.length > 0 || isModOrAdmin) && (
              <TareaEtiquetasEditor etiquetas={t.etiquetas} canEdit={Boolean(isModOrAdmin)} compact onSave={(next) => saveEtiquetas(t.id, next)} />
            )}
            {t.provincia && <span className="text-surface-400">{t.provincia}</span>}
          </div>
        </div>
        );
      })}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 sm:mb-5 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 tracking-tight">Cronograma</h1>
          <p className="text-surface-400 text-xs mt-0.5">
            {tareas.length} de {pagination.total || tareas.length} registros cargados{serverSearch ? ` · filtro: ${serverSearch}` : ""}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:flex-nowrap">
          <div className="relative min-w-0 flex-[1_1_100%] sm:flex-initial">
            <input
              type="text"
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
            onChange={(e) => {
              setGroupBy(e.target.value);
              setExpandedSections(new Set(Object.keys(groupedTareas)));
            }}
            className="min-w-0 flex-1 px-2 py-1.5 border border-surface-200 rounded-md text-xs bg-white focus:outline-none focus:border-surface-400 text-surface-600 cursor-pointer sm:flex-none"
            title="Agrupar por"
          >
            {GROUP_BY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
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
          {isModOrAdmin && (
            <button
              onClick={() => openCreateModal()}
              className="px-2.5 py-1.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 transition-colors flex items-center gap-1"
            >
              <IconPlus className="w-3.5 h-3.5" />
              Nueva
            </button>
          )}
        </div>
      </div>

      <SavedViewsBar
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
        {hasServerFilters && (
          <button type="button" onClick={clearServerFilters} className="text-xs text-primary-600">
            Limpiar
          </button>
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
            { key: "sin-espacio", label: "Sin espacio" },
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
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
            className="px-3 py-2 text-xs border border-surface-200 rounded-md focus:outline-none focus:border-surface-400"
          />
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
          <button
            onClick={clearServerFilters}
            disabled={!hasServerFilters}
            className="px-3 py-2 text-xs rounded-md border border-surface-200 text-surface-600 hover:bg-surface-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* Panel lateral de Campos (drawer) */}
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
              {/* Mostrados header */}
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
                      {/* Toggle switch — solo mod/admin */}
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

            {/* Estados (visibilidad) */}
            {isModOrAdmin && estados.length > 0 && (
              <div className="px-4 py-3 border-t border-surface-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">Estados</span>
                  <button onClick={() => setShowEstadoModal(true)} className="text-[11px] text-primary-500 hover:text-primary-700 font-medium">+ Nuevo</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {estados.map(e => {
                    const isHidden = userHiddenEstados.has(e.id);
                    return (
                      <label key={e.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border group cursor-pointer transition-colors ${isHidden ? "opacity-40 bg-surface-50" : ""}`}
                        style={{ borderColor: `${e.color}40`, color: isHidden ? "#94a3b8" : e.color }}>
                        <input type="checkbox" checked={!isHidden} onChange={() => setUserHiddenEstados(prev => { const next = new Set(prev); if (next.has(e.id)) next.delete(e.id); else next.add(e.id); return next; })} className="sr-only" />
                        <StatusIcon clave={e.clave} color={e.color} size={12} />
                        {e.nombre}
                        {session?.rol === "ADMIN" && (
                          <button onClick={(ev) => { ev.preventDefault(); setConfirmDelete({ type: "estado", id: e.id, label: e.nombre }); }}
                            className="ml-0.5 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all" title="Eliminar estado">
                            <IconX className="w-3 h-3" />
                          </button>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barra de acciones masivas */}
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
            onChange={(e) => { setBulkAction(e.target.value); setBulkValue(""); }}
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
            <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
              className="px-2 py-1 border border-primary-300 rounded text-xs bg-white focus:outline-none focus:border-primary-500">
              <option value="">— Estado —</option>
              {estados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          )}
          {bulkAction === "espacioId" && (
            <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
              className="px-2 py-1 border border-primary-300 rounded text-xs bg-white focus:outline-none focus:border-primary-500">
              <option value="">— Espacio —</option>
              {espacios.length > 0 ? espacios.map((e: any) => (
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
            <input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder="Ej: BUENOS AIRES"
              className="px-2 py-1 border border-primary-300 rounded text-xs bg-white focus:outline-none focus:border-primary-500 w-32" />
          )}
          {bulkAction === "ambito" && (
            <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
              className="px-2 py-1 border border-primary-300 rounded text-xs bg-white focus:outline-none focus:border-primary-500">
              <option value="">— Ámbito —</option>
              <option value="Urbano">Urbano</option>
              <option value="Rural">Rural</option>
              <option value="Rural Disperso">Rural Disperso</option>
            </select>
          )}
          {bulkAction === "prioridad" && (
            <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
              className="px-2 py-1 border border-primary-300 rounded text-xs bg-white focus:outline-none focus:border-primary-500">
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

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {groupBy === "estado" ? (
          <>
          {/* Resumen de espacios cuando hay búsqueda global */}
          {serverSearch && espacioSummary && Object.keys(espacioSummary).length > 0 && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs">
              <div className="font-semibold text-blue-900 mb-2">📂 Resultados por espacio/carpeta:</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {Object.entries(espacioSummary).map(([spaceId, data]: any) => (
                  <div key={spaceId} className="flex items-center justify-between px-2 py-1 bg-blue-100 rounded text-blue-800">
                    <span className="truncate">{data.nombre || spaceId}</span>
                    <span className="font-semibold ml-1 flex-shrink-0">{data.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
            const totalInGroup = getGroupTotal(estado.id, items.length);
            const isExpanded = expandedSections.has(estado.id);

            // Ocultar estados sin tareas si no se activó el toggle
            if (totalInGroup === 0 && !showEmptyStates) return null;

            // Ocultar estados restringidos por permisos de rol
            if (hiddenEstadoIds.has(estado.id)) return null;

            // Ocultar estados que el usuario eligió no ver
            if (userHiddenEstados.has(estado.id)) return null;

            return (
              <div key={estado.id} className="bg-white border border-surface-200 rounded-lg overflow-hidden">
                <div className="flex items-center">
                  <button
                    onClick={() => toggleSection(estado.id)}
                    className="flex-1 flex items-center gap-2.5 px-3 py-2 hover:bg-surface-50 transition-colors text-left"
                  >
                    <IconChevron expanded={isExpanded} className="w-3.5 h-3.5 text-surface-400" />
                    <StatusIcon clave={estado.clave} color={estado.color} size={16} />
                    <span className="text-sm font-medium text-surface-700">{estado.nombre}</span>
                    <span className="text-[11px] text-surface-400 tabular-nums">{totalInGroup}</span>
                  </button>
                  <div className="pr-3 flex items-center gap-1.5">
                    {session?.rol === "ADMIN" && items.length > 1 && (
                      bulkDeleteGroup === estado.id ? (
                        <>
                          <span className="text-[11px] text-red-500 font-medium">¿Eliminar {items.length}?</span>
                          <button
                            onClick={() => handleBulkDelete(estado.id)}
                            disabled={bulkDeleting}
                            className="px-2 py-0.5 bg-red-500 text-white text-[11px] rounded hover:bg-red-600 disabled:opacity-50 transition-colors"
                          >
                            {bulkDeleting ? "..." : "Sí"}
                          </button>
                          <button
                            onClick={() => setBulkDeleteGroup(null)}
                            className="px-2 py-0.5 text-surface-500 text-[11px] rounded hover:bg-surface-100 transition-colors"
                          >
                            No
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setBulkDeleteGroup(estado.id)}
                          className="text-red-400 hover:text-red-600 transition-colors"
                          title="Eliminar todas"
                        >
                          <IconTrash className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                    {isModOrAdmin && (
                      <span
                        onClick={() => openCreateModal({ estadoId: estado.id })}
                        className="text-[11px] text-surface-400 hover:text-surface-600 font-medium cursor-pointer"
                      >
                        + Añadir
                      </span>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-surface-100">
                    {items.length === 0 ? (
                      <div className="text-center py-4 text-surface-300 text-[11px] italic">
                        Sin tareas en este estado
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <MobileTaskList items={items.slice(0, renderLimits[estado.id] || ROWS_BATCH)} />
                        <table className="w-full min-w-max text-[11px] hidden md:table">
                          <thead>
                            <tr className="border-b border-surface-100">
                              {isModOrAdmin && <th className="w-16 px-1 text-center"><input type="checkbox" checked={items.length > 0 && items.every((t: any) => selectedIds.has(t.id))} onChange={() => toggleSelectGroup(items)} className="accent-primary-600 cursor-pointer" /></th>}
                              {visibleColumns.map(renderColHeader)}
                            </tr>
                          </thead>
                          <tbody>
                            {items.slice(0, renderLimits[estado.id] || ROWS_BATCH).map((t, idx) => (
                              <tr
                                key={t.id}
                                onClick={() => openDetail(t)}
                                className={`cursor-pointer transition-colors hover:bg-surface-50 ${idx % 2 === 0 ? "" : "bg-surface-50/40"}`}
                              >
                              {isModOrAdmin && <td className="w-16 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center gap-1">
                                    <span
                                      draggable
                                      onDragStart={(e) => handleRowDragStart(e, t.id)}
                                      className="cursor-grab active:cursor-grabbing text-surface-300 hover:text-surface-500 px-0.5"
                                      title="Arrastrar a un espacio"
                                    >
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                                    </span>
                                    <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} className="accent-primary-600 cursor-pointer" />
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
                                </td>}
                                {visibleColumns.map((col) => (
                                  <td
                                    key={col.id}
                                    style={{ width: getColWidth(col), minWidth: 40, maxWidth: getColWidth(col) }}
                                    className="px-2.5 py-1.5 text-surface-600 overflow-hidden"
                                  >
                                    {renderCell(t, col)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {items.length > (renderLimits[estado.id] || ROWS_BATCH) && (
                          <button onClick={() => showMore(estado.id)} className="w-full py-1.5 text-[11px] text-orange-600 hover:text-orange-700 hover:bg-orange-50 transition-colors font-medium">
                            Mostrar más ({items.length - (renderLimits[estado.id] || ROWS_BATCH)} restantes)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Sin estado */}
          {getGroupTotal("sin-estado", groupedTareas["sin-estado"]?.length || 0) > 0 && (
            <div className="bg-white border border-surface-200 rounded-lg overflow-hidden">
              <div className="flex items-center">
                <button
                  onClick={() => toggleSection("sin-estado")}
                  className="flex-1 flex items-center gap-2.5 px-3 py-2 hover:bg-surface-50 transition-colors text-left"
                >
                  <IconChevron expanded={expandedSections.has("sin-estado")} className="w-3.5 h-3.5 text-surface-400" />
                  <span className="w-2 h-2 rounded-full bg-surface-300 flex-shrink-0" />
                  <span className="text-sm font-medium text-surface-500">Sin estado</span>
                  <span className="text-[11px] text-surface-400 tabular-nums">{getGroupTotal("sin-estado", groupedTareas["sin-estado"]?.length || 0)}</span>
                </button>
                {session?.rol === "ADMIN" && groupedTareas["sin-estado"].length > 0 && (
                  <div className="pr-3 flex items-center gap-1.5">
                    {bulkDeleteGroup === "sin-estado" ? (
                      <>
                        <span className="text-[11px] text-red-500 font-medium">¿Eliminar {groupedTareas["sin-estado"].length}?</span>
                        <button
                          onClick={() => handleBulkDelete("sin-estado")}
                          disabled={bulkDeleting}
                          className="px-2 py-0.5 bg-red-500 text-white text-[11px] rounded hover:bg-red-600 disabled:opacity-50 transition-colors"
                        >
                          {bulkDeleting ? "..." : "Sí"}
                        </button>
                        <button
                          onClick={() => setBulkDeleteGroup(null)}
                          className="px-2 py-0.5 text-surface-500 text-[11px] rounded hover:bg-surface-100 transition-colors"
                        >
                          No
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setBulkDeleteGroup("sin-estado")}
                        className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-600 transition-colors"
                        title="Eliminar todas las tareas sin estado"
                      >
                        <IconTrash className="w-3.5 h-3.5" />
                        Eliminar todas
                      </button>
                    )}
                  </div>
                )}
              </div>
              {expandedSections.has("sin-estado") && (
                <div className="border-t border-surface-100 overflow-x-auto">
                  <MobileTaskList items={groupedTareas["sin-estado"].slice(0, renderLimits["sin-estado"] || ROWS_BATCH)} />
                  <table className="w-full min-w-max text-[11px] hidden md:table">
                    <thead>
                      <tr className="border-b border-surface-100">
                        {isModOrAdmin && <th className="w-16 px-1 text-center"><input type="checkbox" checked={groupedTareas["sin-estado"].length > 0 && groupedTareas["sin-estado"].every((t: any) => selectedIds.has(t.id))} onChange={() => toggleSelectGroup(groupedTareas["sin-estado"])} className="accent-primary-600 cursor-pointer" /></th>}
                        {visibleColumns.map(renderColHeader)}
                      </tr>
                    </thead>
                    <tbody>
                      {groupedTareas["sin-estado"].slice(0, renderLimits["sin-estado"] || ROWS_BATCH).map((t, idx) => (
                        <tr
                          key={t.id}
                          onClick={() => openDetail(t)}
                          className={`cursor-pointer transition-colors hover:bg-surface-50 ${idx % 2 === 0 ? "" : "bg-surface-50/40"}`}
                        >
                          {isModOrAdmin && <td className="w-16 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <span
                                draggable
                                onDragStart={(e) => handleRowDragStart(e, t.id)}
                                className="cursor-grab active:cursor-grabbing text-surface-300 hover:text-surface-500 px-0.5"
                                title="Arrastrar a un espacio"
                              >
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                              </span>
                              <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} className="accent-primary-600 cursor-pointer" />
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
                          </td>}
                          {visibleColumns.map((col) => (
                            <td
                              key={col.id}
                              style={{ width: getColWidth(col), minWidth: 40, maxWidth: getColWidth(col) }}
                              className="px-2.5 py-1.5 text-surface-600 overflow-hidden"
                            >
                              {renderCell(t, col)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {groupedTareas["sin-estado"].length > (renderLimits["sin-estado"] || ROWS_BATCH) && (
                    <button onClick={() => showMore("sin-estado")} className="w-full py-1.5 text-[11px] text-orange-600 hover:text-orange-700 hover:bg-orange-50 transition-colors font-medium">
                      Mostrar más ({groupedTareas["sin-estado"].length - (renderLimits["sin-estado"] || ROWS_BATCH)} restantes)
                    </button>
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
              const totalInGroup = getGroupTotal(groupKey, items.length);
              return (
                <div key={groupKey} className="bg-white border border-surface-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection(groupKey)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-50 transition-colors text-left"
                  >
                    <IconChevron expanded={isExpanded} className="w-3.5 h-3.5 text-surface-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-surface-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-surface-700">{groupKey}</span>
                    <span className="text-[11px] text-surface-400 tabular-nums">{totalInGroup}</span>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-surface-100 overflow-x-auto">
                      <MobileTaskList items={items.slice(0, renderLimits[groupKey] || ROWS_BATCH)} />
                      <table className="w-full min-w-max text-[11px] hidden md:table">
                        <thead>
                          <tr className="border-b border-surface-100">
                            {isModOrAdmin && <th className="w-16 px-1 text-center"><input type="checkbox" checked={items.length > 0 && items.every((t: any) => selectedIds.has(t.id))} onChange={() => toggleSelectGroup(items)} className="accent-primary-600 cursor-pointer" /></th>}
                            {visibleColumns.map(renderColHeader)}
                          </tr>
                        </thead>
                        <tbody>
                          {items.slice(0, renderLimits[groupKey] || ROWS_BATCH).map((t: any, idx: number) => (
                            <tr
                              key={t.id}
                              onClick={() => openDetail(t)}
                              className={`cursor-pointer transition-colors hover:bg-surface-50 ${idx % 2 === 0 ? "" : "bg-surface-50/40"}`}
                            >
                              {isModOrAdmin && <td className="w-16 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-1">
                                  <span
                                    draggable
                                    onDragStart={(e) => handleRowDragStart(e, t.id)}
                                    className="cursor-grab active:cursor-grabbing text-surface-300 hover:text-surface-500 px-0.5"
                                    title="Arrastrar a un espacio"
                                  >
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                                  </span>
                                  <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} className="accent-primary-600 cursor-pointer" />
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
                              </td>}
                              {visibleColumns.map((col) => (
                                <td
                                  key={col.id}
                                  style={{ width: getColWidth(col), minWidth: 40, maxWidth: getColWidth(col) }}
                                  className="px-2.5 py-1.5 text-surface-600 overflow-hidden"
                                >
                                  {renderCell(t, col)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {items.length > (renderLimits[groupKey] || ROWS_BATCH) && (
                        <button onClick={() => showMore(groupKey)} className="w-full py-1.5 text-[11px] text-orange-600 hover:text-orange-700 hover:bg-orange-50 transition-colors font-medium">
                          Mostrar más ({items.length - (renderLimits[groupKey] || ROWS_BATCH)} restantes)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
          )}

          {/* Vista tabla completa sin estados */}
          {estados.length === 0 && tareas.length > 0 && (
            <div className="bg-white border border-surface-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-surface-100 flex items-center justify-between">
                <span className="text-sm font-medium text-surface-600">Todas las tareas</span>
                <span className="text-[11px] text-surface-400">Crea estados para agrupar</span>
              </div>
              <div className="overflow-x-auto">
                <MobileTaskList items={tareas.slice(0, renderLimits["_all"] || ROWS_BATCH)} />
                <table className="w-full min-w-max text-[11px] hidden md:table">
                  <thead>
                    <tr className="border-b border-surface-100">
                      {isModOrAdmin && <th className="w-16 px-1 text-center"><input type="checkbox" checked={tareas.length > 0 && tareas.every((t: any) => selectedIds.has(t.id))} onChange={() => toggleSelectGroup(tareas)} className="accent-primary-600 cursor-pointer" /></th>}
                      {visibleColumns.map(renderColHeader)}
                    </tr>
                  </thead>
                  <tbody>
                    {(sortConfig ? [...tareas].sort((a, b) => {
                      const aVal = a[sortConfig.field] ?? "";
                      const bVal = b[sortConfig.field] ?? "";
                      const cmp = String(aVal).localeCompare(String(bVal), "es", { numeric: true });
                      return sortConfig.dir === "asc" ? cmp : -cmp;
                    }) : tareas).slice(0, renderLimits["_all"] || ROWS_BATCH).map((t, idx) => (
                      <tr
                        key={t.id}
                        onClick={() => openDetail(t)}
                        className={`cursor-pointer transition-colors hover:bg-surface-50 ${idx % 2 === 0 ? "" : "bg-surface-50/40"}`}
                      >
                        {isModOrAdmin && <td className="w-16 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <span
                              draggable
                              onDragStart={(e) => handleRowDragStart(e, t.id)}
                              className="cursor-grab active:cursor-grabbing text-surface-300 hover:text-surface-500 px-0.5"
                              title="Arrastrar a un espacio"
                            >
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                            </span>
                            <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} className="accent-primary-600 cursor-pointer" />
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
                        </td>}
                        {visibleColumns.map((col) => (
                          <td
                            key={col.id}
                            style={{ width: getColWidth(col), minWidth: 40, maxWidth: getColWidth(col) }}
                            className="px-2.5 py-1.5 text-surface-600 overflow-hidden"
                          >
                            {renderCell(t, col)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {tareas.length > (renderLimits["_all"] || ROWS_BATCH) && (
                  <button onClick={() => showMore("_all")} className="w-full py-1.5 text-[11px] text-orange-600 hover:text-orange-700 hover:bg-orange-50 transition-colors font-medium">
                    Mostrar más ({tareas.length - (renderLimits["_all"] || ROWS_BATCH)} restantes)
                  </button>
                )}
              </div>
            </div>
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
      )}

      {selectedTarea && (
        <TareaDetalleModal
          tareaId={selectedTarea.id}
          estados={estados}
          isModOrAdmin={isModOrAdmin}
          onClose={closeDetail}
          onUpdated={fetchTareas}
          listColumns={sanitizeTaskFieldConfigs(columns)}
          variant="drawer"
        />
      )}

      {showModal && (
        <CreateTareaModal
          estados={estados}
          fieldsConfig={sanitizeTaskFieldConfigs(columns.filter((column) => column.visible))}
          espacios={espacios}
          allowSpaceSelection
          requireSpaceSelection
          isAdmin={session?.rol === "ADMIN"}
          initialEstadoId={createDefaults.estadoId}
          initialEspacioId={createDefaults.espacioId}
          espacioNombre={createDefaults.espacioId ? espacios.find((espacio: any) => espacio.id === createDefaults.espacioId)?.nombre : undefined}
          onClose={() => setShowModal(false)}
          onCreated={() => fetchTareas()}
          onSpaceCreated={(space) => setEspacios((prev) => prev.some((item: any) => item.id === space.id) ? prev : [...prev, space])}
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
                  style={{
                    borderColor: `${nuevoEstado.color}40`,
                    color: nuevoEstado.color
                  }}
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
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-100 rounded-md transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 font-medium transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dropdown inline de estado (fixed, fuera de tablas) */}
      <EstadoInlineDropdown ref={estadoDropdownRef} tareas={tareas} estados={estados} onChange={changeEstado} />
    </div>
  );
}
