"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSession } from "@/hooks/useSession";
import { useSearchContext } from "@/contexts/SearchContext";
import { IconChevron, IconSettings, IconPlus, IconX, IconCheck, IconClock, IconSort, IconTrash } from "@/components/ui/Icons";
import StatusIcon from "@/components/StatusIcon";
import { obtenerProvincia } from "@/utils/provinciaUtils";

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

// ═══════════════════════════════════════════════════════════════
// OPCIONES DE AGRUPACIÓN
// ═══════════════════════════════════════════════════════════════
const GROUP_BY_OPTIONS = [
  { value: "estado", label: "Estado" },
  { value: "provincia", label: "Provincia" },
  { value: "asignados", label: "Persona asignada" },
  { value: "lacR", label: "LAC-R" },
  { value: "equipoAsignado", label: "Equipo" },
  { value: "ambito", label: "Ámbito" },
  { value: "ciudad", label: "Departamento" },
];

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
  type: "text" | "badge" | "date" | "select";
  options?: string[];
}

const DEFAULT_COLUMNS: Column[] = [
  { id: "codigoPredio", label: "Predio", field: "codigo", width: 100, visible: true, editable: false, type: "text" },
  { id: "predio", label: "Incidencia", field: "incidencias", width: 140, visible: true, editable: false, type: "text" },
  { id: "fechaActualizacion", label: "Fecha de actualización", field: "updatedAt", width: 110, visible: true, editable: false, type: "date" },
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
  { id: "orden", label: "Orden", field: "orden", width: 60, visible: false, editable: true, type: "text" },
];

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function TareasPage() {
  const { session, isModOrAdmin } = useSession();
  const { headerSearch } = useSearchContext();
  const [tareas, setTareas] = useState<any[]>([]);
  const [estados, setEstados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Sincronizar búsqueda del Header global
  useEffect(() => { if (headerSearch !== undefined) setSearch(headerSearch); }, [headerSearch]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
  const [sortConfig, setSortConfig] = useState<{ field: string; dir: "asc" | "desc" } | null>(null);
  const [groupBy, setGroupBy] = useState("estado");
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [showModal, setShowModal] = useState(false);
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

  // Cargar config del servidor (compartida) al montar
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/config-vista?clave=${COL_CONFIG_KEY}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data?.config) {
            hadSavedConfig.current = true;
            const config: { id: string; visible: boolean; order: number; width?: number }[] = data.config;
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
      } catch { /* ignore — usará defaults */ }
      colConfigLoaded.current = true;
    })();
  }, []);

  // Guardar config al servidor cuando ADMIN/MOD cambia columnas (debounced)
  useEffect(() => {
    if (!colConfigLoaded.current) return;
    if (!isModOrAdmin) return; // Técnicos no guardan
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
  const [showUserPicker, setShowUserPicker] = useState(false);

  // Modal de detalle
  const [selectedTarea, setSelectedTarea] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actividades, setActividades] = useState<any[]>([]);
  const [comentarios, setComentarios] = useState<any[]>([]);
  const [nuevoComentario, setNuevoComentario] = useState("");
  const [estadoDropdown, setEstadoDropdown] = useState(false);

  // Form para nueva tarea
  const [form, setForm] = useState({
    nombre: "", direccion: "", ciudad: "", notas: "", prioridad: "MEDIA",
    incidencias: "", lacR: "", cue: "", ambito: "", equipoAsignado: "",
    provincia: "", cuePredio: "", gpsPredio: "", estadoId: ""
  });

  // Cargar datos
  const autoHideDone = useRef(false);
  const fetchTareas = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/tareas?limit=2000", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      const predios = data.predios || [];
      setTareas(predios);

      // Auto-ocultar columnas sin datos (corre siempre en el primer load)
      if (!autoHideDone.current && predios.length > 0) {
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
    setLoading(false);
  }, []);

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
            return newCols.length > 0 ? [...prev, ...newCols] : prev;
          });
        }
      })
      .catch(() => {});
    // Cargar usuarios para asignación
    if (isModOrAdmin) {
      fetch("/api/usuarios", { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then(setAllUsers)
        .catch(() => {});
      fetch("/api/espacios", { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then((data: any[]) => {
          const flat: any[] = [];
          const walk = (arr: any[], depth: number) => {
            for (const e of arr) {
              flat.push({ ...e, _depth: depth });
              if (e.hijos?.length) walk(e.hijos, depth + 1);
            }
          };
          walk(data, 0);
          setEspacios(flat);
        })
        .catch(() => {});
    }
  }, [fetchTareas, isModOrAdmin]);

  // Agrupar tareas
  const groupedTareas = useMemo(() => {
    let filtered = tareas;
    if (search) {
      const s = search.toLowerCase();
      filtered = tareas.filter(t => {
        const prov = obtenerProvincia(t.provincia, t.codigo);
        if (
          t.nombre?.toLowerCase().includes(s) ||
          t.codigo?.toLowerCase().includes(s) ||
          t.incidencias?.toLowerCase().includes(s) ||
          t.cue?.toLowerCase().includes(s) ||
          prov.toLowerCase().includes(s) ||
          t.equipoAsignado?.toLowerCase().includes(s)
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
  }, [tareas, estados, search, sortConfig, groupBy]);

  // Abrir modal de detalle
  async function openDetail(tarea: any) {
    setSelectedTarea(tarea);
    setDetailLoading(true);
    setEstadoDropdown(false);
    setShowUserPicker(false);

    const [tareaRes, actRes, comRes] = await Promise.all([
      fetch(`/api/tareas/${tarea.id}`, { credentials: "include" }),
      isModOrAdmin ? fetch(`/api/actividad?entidad=PREDIO&entidadId=${tarea.id}&limite=30`, { credentials: "include" }) : null,
      fetch(`/api/comentarios?predioId=${tarea.id}`, { credentials: "include" }),
    ]);

    if (tareaRes.ok) {
      const fullTarea = await tareaRes.json();
      setSelectedTarea(fullTarea);
    }
    
    if (actRes?.ok) {
      const actData = await actRes.json();
      setActividades(actData.actividades || []);
    }
    
    if (comRes.ok) {
      const comData = await comRes.json();
      setComentarios(comData.comentarios || []);
    }

    setDetailLoading(false);
  }

  // Cambiar estado
  async function changeEstado(tareaId: string, estadoId: string) {
    const newEstado = estados.find(e => e.id === estadoId);

    const res = await fetch(`/api/tareas/${tareaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ estadoId }),
    });

    if (res.ok) {
      if (selectedTarea?.id === tareaId) {
        setSelectedTarea((prev: any) => ({ ...prev, estadoId, estado: newEstado }));
      }
      fetchTareas();
    }
    setEstadoDropdown(false);
  }

  // Guardar comentario
  async function saveComentario() {
    if (!nuevoComentario.trim() || !selectedTarea) return;

    const res = await fetch("/api/comentarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ contenido: nuevoComentario, predioId: selectedTarea.id }),
    });

    if (res.ok) {
      const newCom = await res.json();
      setComentarios(prev => [newCom, ...prev]);
      setNuevoComentario("");
    }
  }

  // Guardar asignados
  async function saveAsignados(userIds: string[]) {
    if (!selectedTarea) return;
    const res = await fetch(`/api/tareas/${selectedTarea.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ asignadoIds: userIds }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSelectedTarea((prev: any) => ({ ...prev, asignaciones: updated.asignaciones }));
      setTareas(prev => prev.map(t => t.id === selectedTarea.id ? { ...t, asignaciones: updated.asignaciones } : t));
    }
  }

  // Guardar campo editable
  async function saveField(field: string, value: any) {
    if (!selectedTarea) return;

    // Campos personalizados se guardan en camposExtra
    if (field.startsWith("_custom_")) {
      const clave = field.substring(8);
      const newExtra = { ...(selectedTarea.camposExtra || {}), [clave]: value };
      const res = await fetch(`/api/tareas/${selectedTarea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ camposExtra: newExtra }),
      });
      if (res.ok) {
        setSelectedTarea((prev: any) => ({ ...prev, camposExtra: newExtra }));
        setTareas(prev => prev.map(t => t.id === selectedTarea.id ? { ...t, camposExtra: newExtra } : t));
      }
      return;
    }

    const res = await fetch(`/api/tareas/${selectedTarea.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ [field]: value }),
    });

    if (res.ok) {
      setSelectedTarea((prev: any) => ({ ...prev, [field]: value }));
      setTareas(prev => prev.map(t => t.id === selectedTarea.id ? { ...t, [field]: value } : t));
    }
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
      if (selectedTarea?.id === tareaId) {
        setSelectedTarea((prev: any) => ({ ...prev, [field]: value }));
      }
    }
  }

  // Crear tarea
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/tareas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowModal(false);
      setForm({
        nombre: "", direccion: "", ciudad: "", notas: "", prioridad: "MEDIA",
        incidencias: "", lacR: "", cue: "", ambito: "", equipoAsignado: "",
        provincia: "", cuePredio: "", gpsPredio: "", estadoId: ""
      });
      fetchTareas();
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
        if (selectedTarea?.id === id) setSelectedTarea(null);
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
      const actionKey = bulkAction;
      let actionValue: any = bulkValue;

      // Para asignaciones, enviar como array de IDs
      if (bulkAction === "asignadoIds") {
        actionValue = bulkValue ? [bulkValue] : [];
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
    if (!d) return "—";
    return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  };

  const formatRelativeDate = (d: string | null) => {
    if (!d) return "—";
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

  const formatDateTime = (d: string) => {
    return new Date(d).toLocaleDateString("es-AR", { 
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
    });
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
            <option value="">—</option>
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
    // Para la columna "codigoPredio", mostrar icono estado + codigo + indicador notas
    if (col.id === "codigoPredio") {
      const displayCode = t.codigo || "\u2014";
      return (
        <span className="flex items-center gap-1 group/cell">
          {t.estado && <StatusIcon clave={t.estado.clave} color={t.estado.color} size={14} />}
          <span className="text-surface-800 font-medium truncate">{displayCode}</span>
          <NotesIndicator notas={t.notas} comentarios={t._count?.comentarios} />
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
  const visibleColumns = useMemo(() => {
    return columns.filter(c => c.visible);
  }, [columns]);

  // Suprimir warning de session no usada
  void session;

  // Mobile card list for task items (< md breakpoint)
  const MobileTaskList = ({ items: taskItems }: { items: any[] }) => (
    <div className="md:hidden divide-y divide-surface-100">
      {taskItems.map((t) => (
        <button
          key={t.id}
          onClick={() => openDetail(t)}
          className="w-full text-left px-3 py-3.5 hover:bg-surface-50 active:bg-surface-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            {t.estado && <StatusIcon clave={t.estado.clave} color={t.estado.color} size={16} />}
            {t.codigo && <span className="text-sm font-semibold text-surface-800 tabular-nums">{t.codigo}</span>}
            <NotesIndicator notas={t.notas} comentarios={t._count?.comentarios} />
            <p className="text-sm font-medium text-surface-700 truncate">
              {t.incidencias || t.nombre || "Sin nombre"}
            </p>
          </div>
          {t.nombre && t.incidencias && (
            <p className="text-xs text-surface-400 truncate mt-0.5">{t.nombre}</p>
          )}
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
            {t.asignaciones?.length > 0 && (
              <span className="px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded text-[11px] font-medium">
                {t.asignaciones.map((a: any) => a.usuario?.nombre?.split(" ")[0]).join(", ")}
              </span>
            )}
            {t.provincia && <span className="text-surface-400">{t.provincia}</span>}
          </div>
        </button>
      ))}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 tracking-tight">Cronograma</h1>
          <p className="text-surface-400 text-xs mt-0.5">{tareas.length} registros</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 sm:flex-initial">
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
            className="px-2 py-1.5 border border-surface-200 rounded-md text-xs bg-white focus:outline-none focus:border-surface-400 text-surface-600 cursor-pointer"
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
              onClick={() => setShowModal(true)}
              className="px-2.5 py-1.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 transition-colors flex items-center gap-1"
            >
              <IconPlus className="w-3.5 h-3.5" />
              Nueva
            </button>
          )}
        </div>
      </div>

      {/* Panel lateral de Campos (drawer) */}
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
        <div className="mb-3 p-2.5 bg-primary-50 border border-primary-200 rounded-lg flex items-center gap-2 flex-wrap animate-fade-in-up">
          <span className="text-xs font-semibold text-primary-700">
            {selectedIds.size} seleccionado{selectedIds.size > 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-[11px] text-primary-600 hover:text-primary-800 underline"
          >
            Deseleccionar
          </button>
          <span className="text-surface-300 mx-1">|</span>
          <select
            value={bulkAction}
            onChange={(e) => { setBulkAction(e.target.value); setBulkValue(""); }}
            className="px-2 py-1 border border-primary-300 rounded text-xs bg-white focus:outline-none focus:border-primary-500 text-surface-700"
          >
            <option value="">— Acción masiva —</option>
            <option value="estadoId">Cambiar estado</option>
            <option value="espacioId">Mover a espacio</option>
            <option value="asignadoIds">Asignar técnico</option>
            <option value="equipoAsignado">Cambiar equipo</option>
            <option value="provincia">Cambiar provincia</option>
            <option value="ambito">Cambiar ámbito</option>
            <option value="prioridad">Cambiar prioridad</option>
            <option value="autoProvince">Auto-detectar provincia</option>
            <option value="autoGPS">Auto-parsear GPS → lat/lng</option>
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
          {bulkAction === "asignadoIds" && (
            <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}
              className="px-2 py-1 border border-primary-300 rounded text-xs bg-white focus:outline-none focus:border-primary-500">
              <option value="">— Técnico —</option>
              {allUsers.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          )}
          {bulkAction === "equipoAsignado" && (
            <input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder="Ej: TH01"
              className="px-2 py-1 border border-primary-300 rounded text-xs bg-white focus:outline-none focus:border-primary-500 w-24" />
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
            disabled={bulkExecuting || !bulkAction || (!["autoProvince", "autoGPS"].includes(bulkAction) && !bulkValue)}
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

            // Ocultar estados sin tareas si no se activó el toggle
            if (items.length === 0 && !showEmptyStates) return null;

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
                    <span className="text-[11px] text-surface-400 tabular-nums">{items.length}</span>
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
                        onClick={() => { setForm(f => ({ ...f, estadoId: estado.id })); setShowModal(true); }}
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
                        <MobileTaskList items={items} />
                        <table className="w-full min-w-max text-[11px] hidden md:table">
                          <thead>
                            <tr className="border-b border-surface-100">
                              {isModOrAdmin && <th className="w-8 px-1 text-center"><input type="checkbox" checked={items.length > 0 && items.every((t: any) => selectedIds.has(t.id))} onChange={() => toggleSelectGroup(items)} className="accent-primary-600 cursor-pointer" /></th>}
                              {visibleColumns.map(renderColHeader)}
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((t, idx) => (
                              <tr
                                key={t.id}
                                onClick={() => openDetail(t)}
                                className={`cursor-pointer transition-colors hover:bg-surface-50 ${idx % 2 === 0 ? "" : "bg-surface-50/40"}`}
                              >
                                {isModOrAdmin && <td className="w-8 px-1 text-center" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} className="accent-primary-600 cursor-pointer" /></td>}
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
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Sin estado */}
          {groupedTareas["sin-estado"]?.length > 0 && (
            <div className="bg-white border border-surface-200 rounded-lg overflow-hidden">
              <div className="flex items-center">
                <button
                  onClick={() => toggleSection("sin-estado")}
                  className="flex-1 flex items-center gap-2.5 px-3 py-2 hover:bg-surface-50 transition-colors text-left"
                >
                  <IconChevron expanded={expandedSections.has("sin-estado")} className="w-3.5 h-3.5 text-surface-400" />
                  <span className="w-2 h-2 rounded-full bg-surface-300 flex-shrink-0" />
                  <span className="text-sm font-medium text-surface-500">Sin estado</span>
                  <span className="text-[11px] text-surface-400 tabular-nums">{groupedTareas["sin-estado"].length}</span>
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
                  <MobileTaskList items={groupedTareas["sin-estado"]} />
                  <table className="w-full min-w-max text-[11px] hidden md:table">
                    <thead>
                      <tr className="border-b border-surface-100">
                        {isModOrAdmin && <th className="w-8 px-1 text-center"><input type="checkbox" checked={groupedTareas["sin-estado"].length > 0 && groupedTareas["sin-estado"].every((t: any) => selectedIds.has(t.id))} onChange={() => toggleSelectGroup(groupedTareas["sin-estado"])} className="accent-primary-600 cursor-pointer" /></th>}
                        {visibleColumns.map(renderColHeader)}
                      </tr>
                    </thead>
                    <tbody>
                      {groupedTareas["sin-estado"].map((t, idx) => (
                        <tr
                          key={t.id}
                          onClick={() => openDetail(t)}
                          className={`cursor-pointer transition-colors hover:bg-surface-50 ${idx % 2 === 0 ? "" : "bg-surface-50/40"}`}
                        >
                          {isModOrAdmin && <td className="w-8 px-1 text-center" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} className="accent-primary-600 cursor-pointer" /></td>}
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
                    <IconChevron expanded={isExpanded} className="w-3.5 h-3.5 text-surface-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-surface-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-surface-700">{groupKey}</span>
                    <span className="text-[11px] text-surface-400 tabular-nums">{items.length}</span>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-surface-100 overflow-x-auto">
                      <MobileTaskList items={items} />
                      <table className="w-full min-w-max text-[11px] hidden md:table">
                        <thead>
                          <tr className="border-b border-surface-100">
                            {isModOrAdmin && <th className="w-8 px-1 text-center"><input type="checkbox" checked={items.length > 0 && items.every((t: any) => selectedIds.has(t.id))} onChange={() => toggleSelectGroup(items)} className="accent-primary-600 cursor-pointer" /></th>}
                            {visibleColumns.map(renderColHeader)}
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((t: any, idx: number) => (
                            <tr
                              key={t.id}
                              onClick={() => openDetail(t)}
                              className={`cursor-pointer transition-colors hover:bg-surface-50 ${idx % 2 === 0 ? "" : "bg-surface-50/40"}`}
                            >
                              {isModOrAdmin && <td className="w-8 px-1 text-center" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} className="accent-primary-600 cursor-pointer" /></td>}
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
                <MobileTaskList items={tareas} />
                <table className="w-full min-w-max text-[11px] hidden md:table">
                  <thead>
                    <tr className="border-b border-surface-100">
                      {isModOrAdmin && <th className="w-8 px-1 text-center"><input type="checkbox" checked={tareas.length > 0 && tareas.every((t: any) => selectedIds.has(t.id))} onChange={() => toggleSelectGroup(tareas)} className="accent-primary-600 cursor-pointer" /></th>}
                      {visibleColumns.map(renderColHeader)}
                    </tr>
                  </thead>
                  <tbody>
                    {(sortConfig ? [...tareas].sort((a, b) => {
                      const aVal = a[sortConfig.field] ?? "";
                      const bVal = b[sortConfig.field] ?? "";
                      const cmp = String(aVal).localeCompare(String(bVal), "es", { numeric: true });
                      return sortConfig.dir === "asc" ? cmp : -cmp;
                    }) : tareas).map((t, idx) => (
                      <tr
                        key={t.id}
                        onClick={() => openDetail(t)}
                        className={`cursor-pointer transition-colors hover:bg-surface-50 ${idx % 2 === 0 ? "" : "bg-surface-50/40"}`}
                      >
                        {isModOrAdmin && <td className="w-8 px-1 text-center" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} className="accent-primary-600 cursor-pointer" /></td>}
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
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          MODAL DETALLE
          ═══════════════════════════════════════════════════════════ */}
      {selectedTarea && (
        <div className="fixed inset-0 z-50 flex flex-col md:flex-row bg-black/40">
          {/* Panel principal */}
          <div className="flex-1 flex justify-center items-start pt-4 md:pt-8 pb-4 md:pb-8 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-2 md:mx-4 animate-fade-in-up">
              {/* Header */}
              <div className="px-5 py-4 border-b border-surface-100">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-surface-400 uppercase tracking-wider mb-1">Detalle</p>
                    <h2 className="text-base font-semibold text-surface-800 truncate">
                      {selectedTarea.incidencias || selectedTarea.nombre || "Sin nombre"}
                    </h2>
                  </div>
                  <button
                    onClick={() => setSelectedTarea(null)}
                    className="p-1.5 hover:bg-surface-100 rounded-md transition-colors ml-3 flex-shrink-0"
                  >
                    <IconX className="w-4 h-4 text-surface-400" />
                  </button>
                </div>
                {session?.rol === "ADMIN" && (
                  <button
                    onClick={() => setConfirmDelete({ type: "tarea", id: selectedTarea.id, label: selectedTarea.incidencias || selectedTarea.nombre || "esta tarea" })}
                    className="mt-2 flex items-center gap-1 text-[11px] text-red-400 hover:text-red-600 transition-colors"
                  >
                    <IconTrash className="w-3.5 h-3.5" />
                    Eliminar tarea
                  </button>
                )}
              </div>

              {detailLoading ? (
                <div className="flex justify-center py-12">
                  <div className="w-5 h-5 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" />
                </div>
              ) : (
                <div className="px-5 py-4 space-y-4">
                  {/* Estado */}
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-surface-400 uppercase tracking-wider w-16">Estado</span>
                    <div className="relative">
                      <button
                        onClick={() => setEstadoDropdown(!estadoDropdown)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border"
                        style={{
                          borderColor: selectedTarea.estado?.color ? `${selectedTarea.estado.color}40` : "#e2e8f0",
                          color: selectedTarea.estado?.color || "#64748b"
                        }}
                      >
                        <StatusIcon clave={selectedTarea.estado?.clave} color={selectedTarea.estado?.color || "#94a3b8"} size={12} />
                        {selectedTarea.estado?.nombre || "Sin estado"}
                        <IconChevron className="w-2.5 h-2.5" />
                      </button>

                      {estadoDropdown && (
                        <div className="absolute top-full left-0 mt-1 bg-white border border-surface-200 rounded-lg shadow-lg py-1 min-w-[160px] z-10 animate-fade-in-up">
                          <div className="max-h-48 overflow-y-auto">
                            {estados.map(e => (
                              <button
                                key={e.id}
                                onClick={() => changeEstado(selectedTarea.id, e.id)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-50 transition-colors text-left"
                              >
                                <StatusIcon clave={e.clave} color={e.color} size={14} />
                                <span className="text-surface-700">{e.nombre}</span>
                                {selectedTarea.estadoId === e.id && <IconCheck className="w-3.5 h-3.5 text-surface-500 ml-auto" />}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Asignados */}
                  <div className="flex items-start gap-3">
                    <span className="text-[11px] text-surface-400 uppercase tracking-wider w-16 pt-1">Asignados</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(selectedTarea.asignaciones || []).map((a: any) => (
                          <span key={a.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-700 border border-primary-200 rounded-full text-[11px] font-medium">
                            {a.usuario?.nombre || "?"}
                            {isModOrAdmin && (
                              <button
                                onClick={() => {
                                  const ids = selectedTarea.asignaciones
                                    .filter((x: any) => x.id !== a.id)
                                    .map((x: any) => x.usuario?.id || x.userId);
                                  saveAsignados(ids);
                                }}
                                className="ml-0.5 text-primary-400 hover:text-red-500 transition-colors"
                              >
                                <IconX className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        ))}
                        {(selectedTarea.asignaciones || []).length === 0 && (
                          <span className="text-xs text-surface-400">Sin asignar</span>
                        )}
                        {isModOrAdmin && (
                          <div className="relative">
                            <button
                              onClick={() => setShowUserPicker(!showUserPicker)}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] text-surface-400 hover:text-primary-600 hover:bg-primary-50 rounded-full border border-dashed border-surface-300 hover:border-primary-300 transition-colors"
                            >
                              <IconPlus className="w-3 h-3" />
                              Asignar
                            </button>
                            {showUserPicker && (
                              <div className="absolute top-full left-0 mt-1 bg-white border border-surface-200 rounded-lg shadow-lg py-1 min-w-[180px] z-10 animate-fade-in-up max-h-48 overflow-y-auto">
                                {allUsers
                                  .filter(u => !(selectedTarea.asignaciones || []).some((a: any) => (a.usuario?.id || a.userId) === u.id))
                                  .map(u => (
                                    <button
                                      key={u.id}
                                      onClick={() => {
                                        const currentIds = (selectedTarea.asignaciones || []).map((a: any) => a.usuario?.id || a.userId);
                                        saveAsignados([...currentIds, u.id]);
                                        setShowUserPicker(false);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-50 transition-colors text-left"
                                    >
                                      <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px] font-semibold shrink-0">
                                        {u.nombre.charAt(0)}
                                      </span>
                                      <span className="text-surface-700">{u.nombre}</span>
                                    </button>
                                  ))}
                                {allUsers.filter(u => !(selectedTarea.asignaciones || []).some((a: any) => (a.usuario?.id || a.userId) === u.id)).length === 0 && (
                                  <p className="text-xs text-surface-400 text-center py-2">Todos asignados</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Campos */}
                  <div className="border border-surface-200 rounded-lg">
                    <div className="px-3 py-2 border-b border-surface-100">
                      <span className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">Campos</span>
                    </div>
                    <div className="divide-y divide-surface-50">
                      {[
                        { label: "Ámbito", field: "ambito", editable: true },
                        { label: "CUE", field: "cue", editable: true },
                        { label: "CUE_Predio", field: "cuePredio", editable: true },
                        { label: "Departamento", field: "ciudad", editable: true },
                        { label: "Dirección", field: "direccion", editable: true },
                        { label: "Equipo", field: "equipoAsignado", editable: true },
                        { label: "DESDE", field: "fechaDesde", type: "date", editable: true },
                        { label: "HASTA", field: "fechaHasta", type: "date", editable: true },
                        { label: "GPS_Predio", field: "gpsPredio", editable: true },
                        { label: "LAC-R", field: "lacR", type: "badge", editable: true },
                        { label: "Provincia", field: "provincia", editable: true },
                      ].map(f => (
                        <div key={f.field} className="flex items-center gap-3 px-3 py-2">
                          <span className="text-[11px] text-surface-400 w-24 flex-shrink-0">{f.label}</span>
                          {isModOrAdmin && f.editable ? (
                            f.type === "badge" ? (
                              <select
                                value={selectedTarea[f.field] || ""}
                                onChange={(e) => saveField(f.field, e.target.value)}
                                className="text-xs border-0 bg-transparent focus:ring-0 p-0 cursor-pointer text-surface-700"
                              >
                                <option value="">—</option>
                                <option value="SI">SI</option>
                                <option value="NO">NO</option>
                              </select>
                            ) : f.type === "date" ? (
                              <input
                                type="date"
                                value={selectedTarea[f.field] ? new Date(selectedTarea[f.field]).toISOString().split("T")[0] : ""}
                                onChange={(e) => saveField(f.field, e.target.value)}
                                className="text-xs border-0 bg-transparent focus:ring-0 p-0 cursor-pointer text-surface-700"
                              />
                            ) : (
                              <input
                                type="text"
                                value={selectedTarea[f.field] || ""}
                                onChange={(e) => setSelectedTarea((p: any) => ({ ...p, [f.field]: e.target.value }))}
                                onBlur={(e) => saveField(f.field, e.target.value)}
                                className="flex-1 text-xs border-0 bg-transparent focus:ring-0 p-0 text-surface-700"
                                placeholder="—"
                              />
                            )
                          ) : (
                            <span className="text-xs text-surface-600">
                              {f.type === "date" && selectedTarea[f.field]
                                ? new Date(selectedTarea[f.field]).toLocaleDateString("es-AR")
                                : selectedTarea[f.field] || "—"}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Notas */}
                  <div className="border border-surface-200 rounded-lg">
                    <div className="px-3 py-2 border-b border-surface-100">
                      <span className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">Notas</span>
                    </div>
                    {isModOrAdmin ? (
                      <textarea
                        value={selectedTarea.notas || ""}
                        onChange={(e) => setSelectedTarea((p: any) => ({ ...p, notas: e.target.value }))}
                        onBlur={(e) => saveField("notas", e.target.value)}
                        placeholder="Agregar notas..."
                        rows={3}
                        className="w-full text-xs border-0 bg-transparent p-3 focus:ring-0 resize-none text-surface-700 placeholder:text-surface-300"
                      />
                    ) : (
                      <p className="text-xs text-surface-600 p-3">
                        {selectedTarea.notas || "Sin notas"}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Panel lateral */}
          {isModOrAdmin && (
            <div className="hidden md:flex w-72 bg-surface-800 text-white flex-col border-l border-surface-700">
              <div className="p-3 border-b border-surface-700">
                <span className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">Actividad</span>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {/* Comentario */}
                <div className="space-y-1.5">
                  <textarea
                    value={nuevoComentario}
                    onChange={(e) => setNuevoComentario(e.target.value)}
                    placeholder="Escribe un comentario..."
                    rows={2}
                    className="w-full text-xs bg-surface-700/50 border border-surface-600 rounded-md p-2 text-white placeholder-surface-500 focus:ring-0 focus:border-surface-500 resize-none"
                  />
                  {nuevoComentario.trim() && (
                    <button
                      onClick={saveComentario}
                      className="px-2.5 py-1 bg-surface-600 text-white rounded-md text-[11px] font-medium hover:bg-surface-500 transition-colors"
                    >
                      Comentar
                    </button>
                  )}
                </div>

                {/* Lista */}
                <div className="space-y-2.5">
                  {comentarios.map(c => (
                    <div key={c.id} className="text-[11px]">
                      <div className="flex items-start gap-2">
                        <div className="w-5 h-5 rounded-full bg-surface-600 flex items-center justify-center text-[9px] font-semibold flex-shrink-0 mt-0.5">
                          {c.usuario?.nombre?.charAt(0) || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-surface-300">
                            <span className="text-white font-medium">{c.usuario?.nombre || "Usuario"}</span>
                          </p>
                          <p className="text-surface-400 mt-0.5 break-words">{c.contenido}</p>
                          <p className="text-surface-500 text-[10px] mt-0.5">{formatDateTime(c.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                  ))}

                  {actividades.map(a => (
                    <div key={a.id} className="text-[11px]">
                      <div className="flex items-start gap-2">
                        <div className="w-5 h-5 rounded-full bg-surface-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <IconClock className="w-2.5 h-2.5 text-surface-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-surface-300">
                            <span className="text-white font-medium">{a.usuario?.nombre || "Sistema"}</span>
                            {" "}{a.descripcion || a.accion}
                          </p>
                          <p className="text-surface-500 text-[10px] mt-0.5">{formatDateTime(a.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                  ))}

                  {actividades.length === 0 && comentarios.length === 0 && (
                    <p className="text-surface-500 text-center text-[11px] py-6">Sin actividad</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal crear tarea */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-xl p-5 w-full max-w-lg mx-4 animate-fade-in-up max-h-[90vh] overflow-y-auto">
            <h2 className="text-sm font-semibold text-surface-800 mb-4">Nueva tarea</h2>
            <div className="space-y-2.5">
              <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre / CUE *" className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300" />
              <input value={form.incidencias} onChange={(e) => setForm({ ...form, incidencias: e.target.value })} placeholder="Número de Predio (NI-...)" className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300" />
              
              <div className="grid grid-cols-2 gap-2">
                <input value={form.cue} onChange={(e) => setForm({ ...form, cue: e.target.value })} placeholder="CUE" className="px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300" />
                <select value={form.lacR} onChange={(e) => setForm({ ...form, lacR: e.target.value })} className="px-2.5 py-1.5 border border-surface-200 rounded-md text-xs text-surface-600">
                  <option value="">LAC-R</option>
                  <option value="SI">SI</option>
                  <option value="NO">NO</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select value={form.ambito} onChange={(e) => setForm({ ...form, ambito: e.target.value })} className="px-2.5 py-1.5 border border-surface-200 rounded-md text-xs text-surface-600">
                  <option value="">Ámbito</option>
                  <option value="Urbano">Urbano</option>
                  <option value="Rural">Rural</option>
                </select>
                <input value={form.equipoAsignado} onChange={(e) => setForm({ ...form, equipoAsignado: e.target.value.toUpperCase() })} placeholder="Equipo (TH01-TH10)" className="px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input value={form.provincia} onChange={(e) => setForm({ ...form, provincia: e.target.value })} placeholder="Provincia" className="px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300" />
                <input value={form.ciudad} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} placeholder="Ciudad/Departamento" className="px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300" />
              </div>

              <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} placeholder="Dirección" className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300" />

              <div className="grid grid-cols-2 gap-2">
                <input value={form.cuePredio} onChange={(e) => setForm({ ...form, cuePredio: e.target.value })} placeholder="CUE_Predio" className="px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300" />
                <input value={form.gpsPredio} onChange={(e) => setForm({ ...form, gpsPredio: e.target.value })} placeholder="GPS_Predio" className="px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300" />
              </div>

              <select value={form.estadoId} onChange={(e) => setForm({ ...form, estadoId: e.target.value })} className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs text-surface-600">
                <option value="">Estado inicial</option>
                {estados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>

              <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Notas" rows={2} className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 resize-none placeholder:text-surface-300" />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setShowModal(false)} className="px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-100 rounded-md transition-colors">Cancelar</button>
              <button type="submit" className="px-3 py-1.5 text-xs bg-surface-800 text-white rounded-md hover:bg-surface-700 font-medium transition-colors">Crear</button>
            </div>
          </form>
        </div>
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
    </div>
  );
}
