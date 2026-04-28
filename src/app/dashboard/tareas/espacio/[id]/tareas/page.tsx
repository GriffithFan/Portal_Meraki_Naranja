"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { useSession } from "@/hooks/useSession";
import Link from "next/link";
import TareaDetalleModal from "@/components/TareaDetalleModal";
import StatusIcon from "@/components/StatusIcon";
import { obtenerProvincia } from "@/utils/provinciaUtils";
import { aliasToKey, buildEquipoOptions } from "@/utils/equipoUtils";

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
const NotesIndicator = ({ notas, comentarios }: { notas?: string; comentarios?: number }) => {
  if (!notas && !(comentarios && comentarios > 0)) return null;
  const tip = [notas ? "Tiene notas" : "", comentarios ? `${comentarios} comentario${comentarios > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ");
  return (
    <span className="shrink-0" title={tip}>
      <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
      </svg>
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
  { id: "lacR", label: "LAC-R", field: "lacR", width: 70, visible: true, editable: true, type: "badge", options: ["SI", "NO", "PEDIDO"] },
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
  { id: "ciudad", label: "Departamento", field: "ciudad", width: 120, visible: false, editable: true, type: "text" },
];

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

const SERVER_PAGE_SIZE = 500;

export default function EspacioTareasPage() {
  const params = useParams();
  const espacioId = params.id as string;
  const { session, isModOrAdmin } = useSession();
  const [selectedTareaId, setSelectedTareaId] = useState<string | null>(null);

  // Read URL ?open= param on mount
  const urlOpenRef = useRef<string | null>(typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("open") : null);

  const [espacio, setEspacio] = useState<any>(null);
  const [tareas, setTareas] = useState<any[]>([]);
  const [estados, setEstados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, total: 0, hasMore: false, limit: SERVER_PAGE_SIZE });
  const [search, setSearch] = useState("");
  const [serverSearch, setServerSearch] = useState("");
  const [includeSubspaces, setIncludeSubspaces] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ field: string; dir: "asc" | "desc" } | null>(null);
  const [groupBy, setGroupBy] = useState("estado");

  // Columnas configurables
  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [showEstadoModal, setShowEstadoModal] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState({ nombre: "", color: "#3b82f6" });

  // Inline new column form
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState<"text" | "badge" | "date" | "select">("text");
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
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteGroup, setBulkDeleteGroup] = useState<string | null>(null);

  // Usuarios y espacios (para acciones masivas)
  const [allUsers, setAllUsers] = useState<{ id: string; nombre: string }[]>([]);
  const [allEspacios, setAllEspacios] = useState<any[]>([]);

  // Opciones de equipo dinámicas: EQUIPOS estáticos + usuarios activos
  const equipoOpts = useMemo(() => buildEquipoOptions(allUsers), [allUsers]);

  /** Resuelve un valor guardado de equipoAsignado al key canónico de equipoOpts */
  const resolveEquipoKey = useCallback((val: string | null | undefined): string => {
    if (!val) return "";
    const byAlias = aliasToKey(val);
    if (byAlias) return byAlias;
    const match = equipoOpts.find(o => o.key.toUpperCase() === val.toUpperCase() || o.display.toUpperCase() === val.toUpperCase());
    return match?.key || val;
  }, [equipoOpts]);

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

  // Dropdown inline de estado en la lista
  const [inlineEstado, setInlineEstado] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!inlineEstado) return;
    const handler = () => setInlineEstado(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [inlineEstado]);

  useEffect(() => {
    const timer = setTimeout(() => setServerSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const abrirInlineEstado = (e: React.MouseEvent, tareaId: string) => {
    e.stopPropagation();
    if (inlineEstado?.id === tareaId) { setInlineEstado(null); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setInlineEstado({ id: tareaId, x: rect.left, y: rect.bottom + 4 });
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
    }
    setInlineEstado(null);
  }

  // Auto-ocultar columnas sin datos (una sola vez)
  const autoHideDone = useRef(false);

  // Persistir columnas — config compartida vía servidor
  const colConfigLoaded = useRef(false);
  const hadSavedConfig = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const COL_CONFIG_KEY = "col-config-espacio";

  // Guardar config al servidor cuando ADMIN/MOD cambia columnas (debounced)
  useEffect(() => {
    if (!colConfigLoaded.current) return;
    if (!isModOrAdmin) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const config = columns.map((c, i) => ({ id: c.id, visible: c.visible, order: i, width: c.width }));
      fetch("/api/config-vista", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: COL_CONFIG_KEY, config }),
      }).catch(() => {});
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [columns, isModOrAdmin]);

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
      fetch("/api/usuarios", { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then(setAllUsers)
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

  const fetchData = useCallback(async (options?: { page?: number; append?: boolean }) => {
    const pageToLoad = options?.page || 1;
    const append = options?.append || false;
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
            const config: { id: string; visible: boolean; order: number; width?: number }[] = cfgData.config;
            setColumns(prev => {
              const orderMap = new Map(config.map((c, i) => [c.id, { visible: c.visible, order: i, width: c.width }]));
              return [...prev]
                .map(col => {
                  const cfg = orderMap.get(col.id);
                  return cfg ? { ...col, visible: cfg.visible, ...(cfg.width != null ? { width: cfg.width } : {}) } : col;
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

    const params = new URLSearchParams({ espacioId, limit: String(SERVER_PAGE_SIZE), page: String(pageToLoad) });
    if (includeSubspaces) params.set("includeSubspaces", "true");
    if (serverSearch) params.set("buscar", serverSearch);

    const [tareasRes, estadosRes, espacioRes] = await Promise.all([
      fetch(`/api/tareas?${params.toString()}`, { credentials: "include" }),
      fetch("/api/estados", { credentials: "include" }),
      fetch(`/api/espacios/${espacioId}`, { credentials: "include" }),
    ]);

    if (tareasRes.ok) {
      const d = await tareasRes.json();
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
        const ESSENTIAL = new Set(["codigoPredio", "predio", "fechaActualizacion", "lacR", "equipoAsignado", "asignados"]);
        setColumns(prev => prev.map(col => {
          if (ESSENTIAL.has(col.id)) return col;
          if (col.id.startsWith("custom_")) return col;
          const hasData = predios.some((t: any) => {
            const v = t[col.field];
            return v != null && v !== "" && v !== 0;
          });
          return hasData ? { ...col, visible: true } : { ...col, visible: false };
        }));
      }
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

    if (append) setLoadingMore(false);
    else setLoading(false);
  }, [espacioId, includeSubspaces, serverSearch]);

  const loadMoreTareas = useCallback(() => {
    if (loadingMore || !pagination.hasMore) return;
    fetchData({ page: pagination.page + 1, append: true });
  }, [fetchData, loadingMore, pagination.hasMore, pagination.page]);

  // Auto-open predio detail from URL ?open=CODIGO
  const openHandled = useRef(false);
  useEffect(() => {
    if (openHandled.current || loading || tareas.length === 0) return;
    const openCode = urlOpenRef.current;
    if (!openCode) return;
    openHandled.current = true;
    const tarea = tareas.find(t => t.codigo === openCode);
    if (tarea) setSelectedTareaId(tarea.id);
    window.history.replaceState({}, "", window.location.pathname);
  }, [loading, tareas]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Recargar tareas cuando el sidebar reporta un drop exitoso
  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener("espacios-updated", handler);
    return () => window.removeEventListener("espacios-updated", handler);
  }, [fetchData]);

  // Agrupar tareas por estado o campo
  const groupedTareas = useMemo(() => {
    let filtered = tareas;
    if (search && !serverSearch) {
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
  }, [tareas, estados, search, serverSearch, sortConfig, groupBy]);

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

  const formatRelativeDate = (d: string | null) => {
    if (!d) return "—";
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
    if (type === "estado") {
      const res = await fetch(`/api/estados/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { setEstados(prev => prev.filter(e => e.id !== id)); fetchData(); }
    } else if (type === "campo") {
      const res = await fetch(`/api/campos-personalizados?clave=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { setColumns(prev => prev.filter(c => c.id !== `custom_${id}`)); }
    }
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
            id: colId, label: campo.nombre, field: `_custom_${campo.clave}`,
            width: campo.ancho || 100, visible: true, editable: true,
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
  }

  // Acción masiva
  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    if (bulkAction !== "enFacturacion" && bulkAction !== "moverFacturado" && !bulkValue) return;
    setBulkExecuting(true);
    try {
      let actionKey = bulkAction;
      let actionValue: any = bulkAction === "enFacturacion" ? true : bulkValue;
      if (bulkAction === "moverFacturado") {
        const facturadoEsp = allEspacios.find((e: any) => e.nombre === "Facturado" && !e.parentId);
        if (!facturadoEsp) {
          alert("El espacio 'Facturado' no existe. Créalo primero.");
          setBulkExecuting(false);
          return;
        }
        actionKey = "espacioId";
        actionValue = facturadoEsp.id;
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
        alert(`Error: ${err.error || res.statusText}`);
      }
    } catch (e) { console.error("[BULK] exception:", e); }
    setBulkExecuting(false);
  };

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
      return <span className="flex items-center group/cell"><span className="text-surface-700 truncate">{val}</span><CopyBtn text={val} /></span>;
    }
    if (col.id === "asignados") {
      const asigns = t.asignaciones || [];
      // Derivar key actual de equipoAsignado
      const currentTH = resolveEquipoKey(t.equipoAsignado);
      if (isModOrAdmin) {
        return (
          <select
            value={currentTH}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              const th = e.target.value;
              saveCellField(t.id, "equipoAsignado", th);
            }}
            className="text-[10px] font-medium rounded px-1.5 py-0.5 border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-600 dark:bg-violet-900/50 dark:text-violet-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-300 [&>option]:bg-white [&>option]:text-surface-800 dark:[&>option]:bg-surface-800 dark:[&>option]:text-surface-100"
          >
            <option value="">Sin asignar</option>
            {equipoOpts.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.key}{opt.display !== opt.key ? ` (${opt.display})` : ""}</option>
            ))}
          </select>
        );
      }
      // Para no-admin: mostrar badge
      if (currentTH) {
        const dispOpt = equipoOpts.find(o => o.key === currentTH);
        return (
          <span className="px-1.5 py-px bg-violet-50 text-violet-700 border border-violet-200 rounded text-[10px] font-medium truncate max-w-[80px]">
            {dispOpt ? (dispOpt.display !== dispOpt.key ? `${dispOpt.key} (${dispOpt.display})` : dispOpt.key) : currentTH}
          </span>
        );
      }
      if (asigns.length > 0) {
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
      if (currentTH) {
        const dispOpt = equipoOpts.find(o => o.key === currentTH);
        return (
          <span className="px-1.5 py-px bg-violet-50 text-violet-700 border border-violet-200 rounded text-[10px] font-medium truncate max-w-[80px]">
            {dispOpt ? (dispOpt.display !== dispOpt.key ? `${dispOpt.key} (${dispOpt.display})` : dispOpt.key) : currentTH}
          </span>
        );
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
          <NotesIndicator notas={t.notas} comentarios={t._count?.comentarios} />
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
    // Equipo: mostrar KEY (DISPLAY)
    if (col.id === "equipoAsignado") {
      const raw = t[col.field];
      if (!raw) return <span className="text-surface-300">&mdash;</span>;
      const key = resolveEquipoKey(raw);
      const opt = equipoOpts.find(o => o.key === key);
      const display = opt ? (opt.display !== opt.key ? `${opt.key} (${opt.display})` : opt.key) : raw;
      return <span className="flex items-center group/cell" title={display}><span className="text-surface-700 truncate">{display}</span><CopyBtn text={display} /></span>;
    }
    const val = t[col.field];
    const display = val != null && val !== "" ? String(val) : "\u2014";
    return <span className="flex items-center group/cell" title={display !== "\u2014" ? display : ""}><span className="text-surface-700 truncate">{display}</span><CopyBtn text={display !== "\u2014" ? display : ""} /></span>;
  };

  // Columnas visibles
  const ALWAYS_VISIBLE = useMemo(() => new Set(["codigoPredio", "predio", "fechaActualizacion", "lacR", "equipoAsignado", "asignados"]), []);
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

  // Mobile cards (render function, not component — avoids remount)
  const renderMobileTaskList = (taskItems: any[]) => (
    <div className="md:hidden divide-y divide-surface-100">
      {taskItems.map((t) => (
        <div
          key={t.id}
          onClick={() => setSelectedTareaId(t.id)}
          className="w-full text-left px-3 py-3.5 hover:bg-surface-50 active:bg-surface-100 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            {t.estado ? (
              <span className="cursor-pointer active:opacity-60" onClick={(e) => abrirInlineEstado(e, t.id)}>
                <StatusIcon clave={t.estado.clave} color={t.estado.color} size={16} />
              </span>
            ) : null}
            {t.codigo && <span className="text-sm font-semibold text-surface-800 tabular-nums">{t.codigo}</span>}
            <NotesIndicator notas={t.notas} comentarios={t._count?.comentarios} />
            <p className="text-sm font-medium text-surface-700 truncate">
              {t.incidencias || t.nombre || "Sin nombre"}
            </p>
          </div>
          <div className="flex items-center gap-2.5 mt-1.5 text-xs text-surface-500 flex-wrap">
            <span className="tabular-nums">{formatRelativeDate(t.updatedAt)}</span>
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
        </div>
      ))}
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
      {renderMobileTaskList(items)}
      <table className="w-full min-w-max text-[11px] hidden md:table">
        <thead>
          <tr className="border-b border-surface-100">
            {isModOrAdmin && (
              <th className="w-8 px-1 text-center">
                <input
                  type="checkbox"
                  checked={items.length > 0 && items.every(t => selectedIds.has(t.id))}
                  onChange={() => toggleSelectGroup(items)}
                  className="accent-orange-500 w-3.5 h-3.5"
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
              className={`cursor-pointer hover:bg-surface-50 ${idx % 2 === 0 ? "" : "bg-surface-50/40"} ${selectedIds.has(t.id) ? "bg-orange-50/60" : ""}`}
            >
              {isModOrAdmin && (
                <td className="w-8 px-1 text-center" onClick={(e) => e.stopPropagation()}>
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
                      className="accent-orange-500 w-3.5 h-3.5"
                    />
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
          className="w-full py-1.5 text-[11px] text-orange-600 hover:text-orange-700 hover:bg-orange-50 transition-colors font-medium"
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
          <span className="text-xs text-surface-400">
            {tareas.length} de {pagination.total || tareas.length} registros{serverSearch ? ` · filtro: ${serverSearch}` : ""}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {espacio?.hijos?.length > 0 && (
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
      <div className="flex items-center gap-4 mb-5 border-b border-surface-200">
        <Link
          href={`/dashboard/tareas/espacio/${espacio.id}`}
          className="text-xs text-surface-400 hover:text-surface-600 pb-2 px-1 transition-colors"
        >
          Resumen
        </Link>
        <span className="text-xs font-medium text-primary-600 border-b-2 border-primary-600 pb-2 px-1">
          {includeSubspaces ? "Tareas con subcarpetas" : "Tareas directas"} ({tareas.length}/{pagination.total || tareas.length})
        </span>
      </div>

      {/* Config panel — drawer lateral */}
      {showColumnConfig && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setShowColumnConfig(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative w-80 max-w-[85vw] bg-white shadow-xl flex flex-col animate-slide-in-right"
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
        <div className="bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 rounded-lg px-3 py-2 mb-2 flex flex-wrap items-center gap-2 animate-fade-in-up">
          <span className="text-xs font-medium text-orange-700 dark:text-orange-300">{selectedIds.size} seleccionados</span>
          <select value={bulkAction} onChange={e => { setBulkAction(e.target.value); setBulkValue(""); }} className="text-[11px] border border-orange-200 dark:border-orange-700 rounded px-2 py-1 bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 focus:outline-none [&>option]:bg-white [&>option]:text-surface-800 dark:[&>option]:bg-surface-800 dark:[&>option]:text-surface-100">
            <option value="">Acción...</option>
            <option value="estadoId">Cambiar estado</option>
            <option value="espacioId">Mover a espacio</option>
            <option value="equipoAsignado">Asignar técnico</option>
            <option value="provincia">Cambiar provincia</option>
            <option value="ambito">Cambiar ámbito</option>
            <option value="prioridad">Cambiar prioridad</option>
            {session?.rol === "ADMIN" && <option value="enFacturacion">Mover a facturación</option>}
            {session?.rol === "ADMIN" && <option value="moverFacturado">Mover a Facturado</option>}
          </select>
          {bulkAction === "estadoId" && (
            <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="text-[11px] border border-orange-200 dark:border-orange-700 rounded px-2 py-1 bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 focus:outline-none [&>option]:bg-white [&>option]:text-surface-800 dark:[&>option]:bg-surface-800 dark:[&>option]:text-surface-100">
              <option value="">Estado...</option>
              {estados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          )}
          {bulkAction === "espacioId" && (
            <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="text-[11px] border border-orange-200 dark:border-orange-700 rounded px-2 py-1 bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 focus:outline-none [&>option]:bg-white [&>option]:text-surface-800 dark:[&>option]:bg-surface-800 dark:[&>option]:text-surface-100">
              <option value="">Espacio...</option>
              {allEspacios.map(e => <option key={e.id} value={e.id}>{"—".repeat(e._depth || 0)} {e.nombre}</option>)}
            </select>
          )}
          {bulkAction === "equipoAsignado" && (
            <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="text-[11px] border border-orange-200 dark:border-orange-700 rounded px-2 py-1 bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 focus:outline-none [&>option]:bg-white [&>option]:text-surface-800 dark:[&>option]:bg-surface-800 dark:[&>option]:text-surface-100">
              <option value="">Equipo...</option>
              {equipoOpts.map(opt => <option key={opt.key} value={opt.key}>{opt.key}{opt.display !== opt.key ? ` (${opt.display})` : ""}</option>)}
            </select>
          )}
          {(bulkAction === "provincia" || bulkAction === "ambito" || bulkAction === "prioridad") && (
            <input value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Valor..." className="text-[11px] border border-orange-200 dark:border-orange-700 rounded px-2 py-1 bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 focus:outline-none w-32" />
          )}
          <button
            onClick={handleBulkAction}
            disabled={bulkExecuting || !bulkAction || (!["enFacturacion", "moverFacturado"].includes(bulkAction) && !bulkValue)}
            className="text-[11px] px-3 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 font-medium transition-colors"
          >
            {bulkExecuting ? "Aplicando..." : "Aplicar"}
          </button>
          <button
            onClick={() => { setSelectedIds(new Set()); setBulkAction(""); setBulkValue(""); }}
            className="text-[11px] text-surface-400 hover:text-surface-600 ml-auto"
          >
            Cancelar
          </button>
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
                  <span className="text-[11px] text-surface-400 tabular-nums">{items.length}</span>
                </button>
                {isModOrAdmin && items.length > 0 && (
                  <button
                    onClick={() => { if (confirm(`¿Eliminar ${items.length} tareas de "${estado.nombre}"?`)) handleBulkDelete(estado.id); }}
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
                  {items.length === 0 ? (
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
        {groupedTareas["sin-estado"]?.length > 0 && (
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
              <span className="text-[11px] text-surface-400 tabular-nums">{groupedTareas["sin-estado"].length}</span>
            </button>
            {expandedSections.has("sin-estado") && (
              <div className="border-t border-surface-100">
                {renderTaskTable(groupedTareas["sin-estado"], "sin-estado")}
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

      {/* Modal detalle */}
      {selectedTareaId && (
        <TareaDetalleModal
          tareaId={selectedTareaId}
          estados={estados}
          isModOrAdmin={isModOrAdmin}
          onClose={() => setSelectedTareaId(null)}
          onUpdated={fetchData}
          equipoOptions={equipoOpts}
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
      {inlineEstado && (() => {
        const tarea = tareas.find(t => t.id === inlineEstado.id);
        if (!tarea) return null;
        return (
          <div
            className="fixed z-[9999] bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-xl py-1 min-w-[170px] animate-fade-in-up"
            style={{ left: inlineEstado.x, top: inlineEstado.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-h-56 overflow-y-auto">
              {estados.map(e => (
                <button key={e.id} onClick={() => changeEstadoInline(tarea.id, e.id)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors text-left">
                  <StatusIcon clave={e.clave} color={e.color} size={14} />
                  <span className="text-surface-700 dark:text-surface-200">{e.nombre}</span>
                  {tarea.estadoId === e.id && <svg className="w-3.5 h-3.5 text-surface-500 ml-auto" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                </button>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
