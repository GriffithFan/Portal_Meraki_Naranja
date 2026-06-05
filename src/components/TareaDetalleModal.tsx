"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { IconX, IconChevron, IconCheck, IconClock, IconEdit, IconTrash } from "@/components/ui/Icons";
import { dedupeUsersByName, normalizeAssigneeName } from "@/utils/asignacionUtils";
import { hasTaskFieldConfig, sanitizeTaskFieldConfigs } from "@/utils/taskFieldConfig";
import { toast } from "sonner";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── CopyButton ──────────────────────────────
function CopyButton({ value }: { value: string }) {
  if (!value || value === "—") return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value).then(() => toast.success("Copiado"));
      }}
      className="ml-1 p-0.5 text-surface-300 hover:text-surface-500 transition-colors shrink-0"
      title="Copiar"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
    </button>
  );
}

// ── Props ──────────────────────────────────────
type TaskColumnConfig = {
  id: string;
  field?: string;
  visible?: boolean;
  label?: string;
  detailLabel?: string;
  type?: string;
};

interface TareaDetalleModalProps {
  tareaId: string;
  estados: any[];
  isModOrAdmin: boolean;
  onClose: () => void;
  onUpdated?: (options?: { page?: number; append?: boolean }) => void | Promise<void>; // callback para refrescar la lista
  listColumns?: TaskColumnConfig[];
  variant?: "modal" | "drawer";
}

interface DetailFieldDef {
  id: string;
  label: string;
  field: string;
  editable: boolean;
  type?: string;
  customKey?: string;
  options?: string[];
  hidden?: boolean;
}

const DEFAULT_DETAIL_FIELDS: DetailFieldDef[] = [
  { id: "nombre", label: "Predio", field: "nombre", editable: false },
  { id: "incidencias", label: "Incidencia", field: "incidencias", editable: true },
  { id: "ambito", label: "Ámbito", field: "ambito", editable: true },
  { id: "cue", label: "CUE", field: "cue", editable: true },
  { id: "cuePredio", label: "CUE_Predio", field: "cuePredio", editable: true },
  { id: "ciudad", label: "Departamento", field: "ciudad", editable: true },
  { id: "direccion", label: "Dirección", field: "direccion", editable: true },
  { id: "fechaDesde", label: "DESDE", field: "fechaDesde", type: "date", editable: true },
  { id: "fechaHasta", label: "HASTA", field: "fechaHasta", type: "date", editable: true },
  { id: "gpsPredio", label: "GPS_Predio", field: "gpsPredio", editable: true },
  { id: "lacR", label: "LAC-R", field: "lacR", type: "badge", editable: true },
  { id: "provincia", label: "Provincia", field: "provincia", editable: true },
];

const NOTES_DETAIL_FIELD: DetailFieldDef = { id: "notas", label: "Notas", field: "notas", editable: true };
const MAS_20_AP_KEY = "tieneMas20Ap";

function normalizeMas20Ap(value: unknown): "SI" | "NO" | "" {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "SI" || normalized === "NO" ? normalized : "";
}

function labelFromKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function customKeyFromField(field: { id?: string; field?: string }) {
  const fieldName = String(field.field || "");
  if (fieldName.startsWith("_custom_")) return fieldName.substring(8);
  const id = String(field.id || "");
  if (id.startsWith("custom_")) return id.substring(7);
  return undefined;
}

function detailFieldFromColumn(column: any): DetailFieldDef | null {
  if (!column?.id || !column?.field) return null;
  const customKey = customKeyFromField(column);
  const assignmentField = column.id === "asignados" || column.field === "asignaciones";
  return {
    id: String(column.id),
    label: String(column.detailLabel || column.label || column.nombre || column.id),
    field: String(column.field),
    editable: assignmentField ? true : column.editable !== false,
    type: column.type || column.tipo || "text",
    customKey,
    options: Array.isArray(column.options) ? column.options : Array.isArray(column.opciones) ? column.opciones : undefined,
    hidden: column.visible === false,
  };
}

export default function TareaDetalleModal({
  tareaId,
  estados,
  isModOrAdmin,
  onClose,
  onUpdated,
  listColumns,
  variant = "modal",
}: TareaDetalleModalProps) {
  const [tarea, setTarea] = useState<any>(null);
  const [actividades, setActividades] = useState<any[]>([]);
  const [comentarios, setComentarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [estadoDropdown, setEstadoDropdown] = useState(false);
  const [nuevoComentario, setNuevoComentario] = useState("");
  const [activeTab, setActiveTab] = useState<"info" | "actividad">("info");
  const [espacioDetalle, setEspacioDetalle] = useState<any>(null);
  const [listaColumnConfig, setListaColumnConfig] = useState<TaskColumnConfig[] | null>(null);
  const [espacioDetalleLoading, setEspacioDetalleLoading] = useState(false);
  const [savingDetailConfig, setSavingDetailConfig] = useState(false);
  const [showHiddenDetailFields, setShowHiddenDetailFields] = useState(false);
  const [allUsers, setAllUsers] = useState<Array<{ id: string; nombre: string; email?: string | null }>>([]);
  const [editingDetailField, setEditingDetailField] = useState<DetailFieldDef | null>(null);
  const [editingDetailLabel, setEditingDetailLabel] = useState("");
  const [hidingDetailField, setHidingDetailField] = useState<DetailFieldDef | null>(null);
  const [notasTecnicoDraft, setNotasTecnicoDraft] = useState("");
  const [savingNotasTecnico, setSavingNotasTecnico] = useState(false);
  const [savingMas20Ap, setSavingMas20Ap] = useState(false);

  const formatDateTime = (d: string) =>
    new Date(d).toLocaleDateString("es-AR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatFileSize = (size?: number) => {
    if (!size) return "";
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const refreshTimeline = useCallback(async () => {
    const [actRes, comRes] = await Promise.all([
      fetch(`/api/actividad?entidad=PREDIO&entidadId=${tareaId}&limite=50`, { credentials: "include" }),
      fetch(`/api/comentarios?predioId=${tareaId}`, { credentials: "include" }),
    ]);
    if (actRes.ok) {
      const d = await actRes.json();
      setActividades(d.actividades || []);
    }
    if (comRes.ok) {
      const d = await comRes.json();
      setComentarios(d.comentarios || []);
    }
  }, [tareaId]);

  // ── Cargar datos ──────────────────────────────
  const fetchDetail = useCallback(async () => {
    setLoading(true);

    const tareaRes = await fetch(`/api/tareas/${tareaId}`, { credentials: "include" });

    if (tareaRes.ok) setTarea(await tareaRes.json());
    await refreshTimeline();

    setLoading(false);
  }, [refreshTimeline, tareaId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  useEffect(() => {
    setNotasTecnicoDraft(String(tarea?.notasTecnico || ""));
  }, [tarea?.id, tarea?.notasTecnico]);

  useEffect(() => {
    if (!isModOrAdmin) return;
    fetch("/api/catalogos/usuarios", { credentials: "include" })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setAllUsers(dedupeUsersByName(Array.isArray(data) ? data : [])))
      .catch(() => setAllUsers([]));
  }, [isModOrAdmin]);

  useEffect(() => {
    if (!tarea?.espacioId) {
      setEspacioDetalle(null);
      setListaColumnConfig(null);
      setEspacioDetalleLoading(false);
      return;
    }
    let active = true;
    setEspacioDetalleLoading(true);
    Promise.all([
      fetch(`/api/espacios/${tarea.espacioId}`, { credentials: "include" }).then((res) => res.ok ? res.json() : null).catch(() => null),
      fetch(`/api/config-vista?clave=col-config-espacio-${tarea.espacioId}`, { credentials: "include" }).then((res) => res.ok ? res.json() : null).catch(() => null),
    ])
      .then(([espacioData, vistaData]) => {
        if (!active) return;
        setEspacioDetalle(espacioData?.espacio || null);
        setListaColumnConfig(Array.isArray(vistaData?.config) ? sanitizeTaskFieldConfigs(vistaData.config) : null);
      })
      .catch(() => {
        if (!active) return;
        setEspacioDetalle(null);
        setListaColumnConfig(null);
      })
      .finally(() => {
        if (active) setEspacioDetalleLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tarea?.espacioId]);

  // ── ESC key handler ──────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // ── Cambiar estado ──────────────────────────────
  async function changeEstado(estadoId: string) {
    const newEstado = estados.find((e) => e.id === estadoId);
    const res = await fetch(`/api/tareas/${tareaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ estadoId }),
    });
    if (res.ok) {
      setTarea((prev: any) => ({ ...prev, estadoId, estado: newEstado }));
      await refreshTimeline();
      onUpdated?.();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Error al cambiar estado");
    }
    setEstadoDropdown(false);
  }

  // ── Guardar campo inline ──────────────────────────────
  async function saveField(field: string, value: any): Promise<boolean> {
    try {
      const res = await fetch(`/api/tareas/${tareaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error || "No se pudo guardar el cambio");
        return false;
      }

      const updated = await res.json().catch(() => null);
      setTarea((prev: any) => updated?.id ? updated : (field === "camposExtra"
        ? { ...prev, camposExtra: { ...(prev?.camposExtra || {}), ...(value || {}) } }
        : { ...prev, [field]: value }));
      await refreshTimeline();
      onUpdated?.();
      return true;
    } catch {
      toast.error("No se pudo guardar el cambio");
      return false;
    }
  }

  // ── Guardar comentario ──────────────────────────────
  async function saveComentario() {
    if (!nuevoComentario.trim()) return;
    const res = await fetch("/api/comentarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ contenido: nuevoComentario, predioId: tareaId }),
    });
    if (res.ok) {
      const newCom = await res.json();
      setComentarios((prev) => [newCom, ...prev]);
      setNuevoComentario("");
      await refreshTimeline();
    }
  }

  async function saveNotasTecnico() {
    if (savingNotasTecnico) return;
    const current = String(tarea?.notasTecnico || "");
    if (notasTecnicoDraft === current) return;
    setSavingNotasTecnico(true);
    const ok = await saveField("notasTecnico", notasTecnicoDraft);
    if (ok) toast.success("Observaciones guardadas");
    setSavingNotasTecnico(false);
  }

  async function saveMas20Ap(value: "SI" | "NO" | "") {
    if (savingMas20Ap) return;
    const current = normalizeMas20Ap(tarea?.camposExtra?.[MAS_20_AP_KEY]);
    if (value === current) return;
    setSavingMas20Ap(true);
    const payload = value ? value : null;
    const ok = await saveField("camposExtra", { [MAS_20_AP_KEY]: payload });
    if (ok) toast.success("Campo guardado");
    setSavingMas20Ap(false);
  }

  const timelineItems = useMemo(() => {
    const items = [
      ...comentarios.map((c) => ({ ...c, _type: "comentario" as const, _date: c.createdAt })),
      ...actividades.map((a) => ({ ...a, _type: "actividad" as const, _date: a.createdAt })),
      ...(tarea?.actas || []).map((a: any) => ({ ...a, _type: "acta" as const, _date: a.createdAt })),
    ];
    return items.sort((a, b) => new Date(b._date).getTime() - new Date(a._date).getTime());
  }, [actividades, comentarios, tarea?.actas]);

  const lastTimelineItem = timelineItems[0];

  const getActivityMeta = (item: any) => {
    if (item._type === "comentario") {
      return { label: "Comentario", dot: "bg-primary-500", chip: "bg-primary-50 text-primary-700", actor: item.usuario?.nombre || "Usuario" };
    }
    if (item._type === "acta") {
      return { label: "Archivo", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700", actor: item.subidoPor?.nombre || "Usuario" };
    }
    const accion = String(item.accion || "").toUpperCase();
    if (accion.includes("COMENTARIO")) return { label: "Comentario", dot: "bg-primary-500", chip: "bg-primary-50 text-primary-700", actor: item.usuario?.nombre || "Sistema" };
    if (accion.includes("EDIT") || accion.includes("ACTUAL")) return { label: "Cambio", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700", actor: item.usuario?.nombre || "Sistema" };
    if (accion.includes("CREAR")) return { label: "Creacion", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700", actor: item.usuario?.nombre || "Sistema" };
    if (accion.includes("ELIMIN")) return { label: "Eliminacion", dot: "bg-red-500", chip: "bg-red-50 text-red-700", actor: item.usuario?.nombre || "Sistema" };
    return { label: item.accion || "Actividad", dot: "bg-surface-400", chip: "bg-surface-100 text-surface-600", actor: item.usuario?.nombre || "Sistema" };
  };

  const getActivityChanges = (item: any) => {
    const changes = item.metadata?.changes;
    if (Array.isArray(changes) && changes.length > 0) {
      return changes.map((change: any) => ({
        label: change.label || change.field || "Campo",
        before: change.before ?? "Sin valor",
        after: change.after ?? "Sin valor",
      }));
    }

    const before = item.metadata?.before;
    const after = item.metadata?.after;
    if (before && after) {
      const rows: Array<{ label: string; before: string; after: string }> = [];
      const beforeAsignados = Array.isArray(before.asignados) ? before.asignados.map((a: any) => a.nombre || a.userId).filter(Boolean).join(", ") : "";
      const afterAsignados = Array.isArray(after.asignados) ? after.asignados.map((a: any) => a.nombre || a.userId).filter(Boolean).join(", ") : "";
      if (beforeAsignados !== afterAsignados) {
        rows.push({ label: "Asignados", before: beforeAsignados || "Sin asignados", after: afterAsignados || "Sin asignados" });
      }
      return rows;
    }

    return [];
  };

  const detalleCamposConfig = useMemo(() => {
    const config = espacioDetalle?.estadosConfig?.detalleCamposConfig;
    return sanitizeTaskFieldConfigs<TaskColumnConfig>(Array.isArray(config) ? config : []);
  }, [espacioDetalle]);

  const camposConfig = useMemo(() => sanitizeTaskFieldConfigs<TaskColumnConfig>(Array.isArray(espacioDetalle?.camposConfig) ? espacioDetalle.camposConfig : []), [espacioDetalle]);
  const hasOwnCamposConfig = hasTaskFieldConfig(camposConfig);
  const effectiveListaColumnConfig = useMemo(() => (
    sanitizeTaskFieldConfigs<TaskColumnConfig>(Array.isArray(listColumns) ? listColumns : listaColumnConfig)
  ), [listColumns, listaColumnConfig]);
  const listaVisibilityById = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const item of effectiveListaColumnConfig || []) {
      if (item?.id) map.set(item.id, item.visible !== false);
      if (item?.field) map.set(item.field, item.visible !== false);
    }
    return map;
  }, [effectiveListaColumnConfig]);
  const baseDetailFields = useMemo<DetailFieldDef[]>(() => {
    if (!hasOwnCamposConfig) return DEFAULT_DETAIL_FIELDS;
    return camposConfig.map(detailFieldFromColumn).filter((field: DetailFieldDef | null): field is DetailFieldDef => Boolean(field));
  }, [camposConfig, hasOwnCamposConfig]);

  const getDetailConfig = useCallback((field: DetailFieldDef) => (
    detalleCamposConfig.find((item: any) => item.id === field.id || item.field === field.field)
  ), [detalleCamposConfig]);

  const getColumnConfig = useCallback((field: DetailFieldDef) => (
    camposConfig.find((item: any) => item.id === field.id || item.field === field.field)
  ), [camposConfig]);

  const isHiddenByListStructure = useCallback((field: DetailFieldDef) => {
    if (hasOwnCamposConfig && field.hidden === true) return true;
    const ids = [field.id, field.field];
    if (field.customKey) ids.push(`custom_${field.customKey}`);
    return ids.some((id) => listaVisibilityById.get(id) === false);
  }, [hasOwnCamposConfig, listaVisibilityById]);

  const showNotasSection = useMemo(() => {
    const columnCfg = getColumnConfig(NOTES_DETAIL_FIELD);
    if (hasOwnCamposConfig && !columnCfg) return false;
    const field = columnCfg ? { ...NOTES_DETAIL_FIELD, hidden: columnCfg.visible === false } : NOTES_DETAIL_FIELD;
    return !isHiddenByListStructure(field);
  }, [getColumnConfig, hasOwnCamposConfig, isHiddenByListStructure]);

  const detailFields = useMemo(() => baseDetailFields
    .map((field) => {
      const detailCfg = getDetailConfig(field);
      const columnCfg = getColumnConfig(field);
      return {
        ...field,
        label: detailCfg?.label || columnCfg?.detailLabel || columnCfg?.label || field.label,
        hidden: isHiddenByListStructure(field) || detailCfg?.visible === false,
      };
    })
    .filter((field) => !field.hidden), [baseDetailFields, getColumnConfig, getDetailConfig, isHiddenByListStructure]);

  function currentEstadosConfig() {
    return espacioDetalle?.estadosConfig && typeof espacioDetalle.estadosConfig === "object" && !Array.isArray(espacioDetalle.estadosConfig)
      ? espacioDetalle.estadosConfig
      : {};
  }

  async function persistDetalleCamposConfig(nextConfig: any[]) {
    if (!tarea?.espacioId || savingDetailConfig) return;
    setSavingDetailConfig(true);
    const estadosConfig = { ...currentEstadosConfig(), detalleCamposConfig: sanitizeTaskFieldConfigs(nextConfig) };
    const res = await fetch(`/api/espacios/${tarea.espacioId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ estadosConfig }),
    });
    if (res.ok) {
      setEspacioDetalle((prev: any) => prev ? { ...prev, estadosConfig } : prev);
      toast.success("Detalle actualizado para este espacio");
    } else {
      toast.error("No se pudo guardar la estructura del detalle");
    }
    setSavingDetailConfig(false);
  }

  function baseConfigFor(field: DetailFieldDef) {
    const columnCfg = getColumnConfig(field);
    return {
      id: field.id,
      field: field.field,
      label: columnCfg?.detailLabel || columnCfg?.label || field.label,
      type: field.type || columnCfg?.type || "text",
      customKey: field.customKey,
    };
  }

  async function updateDetailFieldConfig(field: DetailFieldDef, patch: Record<string, unknown>) {
    const current = [...detalleCamposConfig];
    const index = current.findIndex((item: any) => item.id === field.id || item.field === field.field);
    if (index >= 0) current[index] = { ...current[index], ...patch };
    else current.push({ ...baseConfigFor(field), ...patch });
    await persistDetalleCamposConfig(current);
  }

  async function editDetailField(field: DetailFieldDef) {
    setEditingDetailField(field);
    setEditingDetailLabel(field.label);
  }

  async function hideDetailField(field: DetailFieldDef) {
    setHidingDetailField(field);
  }

  async function confirmEditDetailField() {
    if (!editingDetailField) return;
    const nextLabel = editingDetailLabel.trim();
    if (nextLabel && nextLabel !== editingDetailField.label) {
      await updateDetailFieldConfig(editingDetailField, { label: nextLabel, visible: true });
    }
    setEditingDetailField(null);
    setEditingDetailLabel("");
  }

  async function confirmHideDetailField() {
    if (!hidingDetailField) return;
    await updateDetailFieldConfig(hidingDetailField, { visible: false });
    setHidingDetailField(null);
  }

  async function restoreDetailField(field: DetailFieldDef) {
    await updateDetailFieldConfig(field, { visible: true });
  }

  function DetailFieldActions({ field }: { field: DetailFieldDef }) {
    if (!isModOrAdmin || !tarea?.espacioId) return null;
    return (
      <div className="ml-1 flex shrink-0 items-center gap-1">
        <button type="button" onClick={() => editDetailField(field)} disabled={savingDetailConfig} className="rounded p-1 text-surface-300 hover:bg-surface-100 hover:text-primary-600 disabled:opacity-50" title="Editar campo en detalle">
          <IconEdit className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => hideDetailField(field)} disabled={savingDetailConfig} className="rounded p-1 text-surface-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50" title="Quitar del detalle">
          <IconTrash className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const assignedUsers = useMemo<Array<{ id: string; nombre: string; email?: string | null }>>(() => (tarea?.asignaciones || [])
    .map((asignacion: any) => asignacion.usuario || { id: asignacion.userId, nombre: asignacion.userId })
    .filter((user: any) => user?.id && user?.nombre), [tarea?.asignaciones]);

  const assignedDisplayUsers = useMemo(() => dedupeUsersByName(assignedUsers), [assignedUsers]);

  const assignedUserIds = useMemo(() => assignedUsers.map((user: any) => user.id), [assignedUsers]);

  const assignedNameKeys = useMemo(
    () => new Set(assignedUsers.map((user) => normalizeAssigneeName(user.nombre))),
    [assignedUsers]
  );

  const assignmentUsers = useMemo(() => {
    const selectedIds = new Set(assignedUserIds);
    const byName = new Map<string, { id: string; nombre: string; email?: string | null }>();
    const addUser = (user: { id: string; nombre: string; email?: string | null }) => {
      const key = normalizeAssigneeName(user.nombre);
      if (!key) return;
      const current = byName.get(key);
      if (!current || (selectedIds.has(user.id) && !selectedIds.has(current.id))) byName.set(key, user);
    };
    for (const user of allUsers) addUser(user);
    for (const user of assignedUsers) addUser(user);
    return Array.from(byName.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [allUsers, assignedUsers, assignedUserIds]);

  function assignmentNames() {
    return assignedDisplayUsers.map((user) => user.nombre).filter(Boolean).join(", ");
  }

  function isAssignmentField(field: DetailFieldDef) {
    return field.id === "asignados" || field.field === "asignaciones";
  }

  function fieldRawValue(field: DetailFieldDef): unknown {
    if (field.customKey) return tarea?.camposExtra?.[field.customKey] ?? "";
    return tarea?.[field.field] ?? "";
  }

  function fieldDisplayValue(field: DetailFieldDef): string {
    if (isAssignmentField(field)) return assignmentNames() || "—";
    const raw = fieldRawValue(field);
    if (field.type === "date" && raw && !field.customKey && (raw instanceof Date || typeof raw === "string" || typeof raw === "number")) {
      return new Date(raw).toLocaleDateString("es-AR");
    }
    if (Array.isArray(raw)) return raw.length ? raw.join(", ") : "—";
    return raw === null || raw === undefined || raw === "" ? "—" : String(raw);
  }

  async function toggleAssignedUser(user: { id: string; nombre: string }) {
    const key = normalizeAssigneeName(user.nombre);
    const next = assignedNameKeys.has(key)
      ? assignedUsers.filter((assigned) => normalizeAssigneeName(assigned.nombre) !== key).map((assigned) => assigned.id)
      : [...assignedUserIds, user.id];
    await saveField("asignadoIds", Array.from(new Set(next)));
  }

  const customEntries = useMemo(() => {
    if (hasOwnCamposConfig) return [];
    const extra = tarea?.camposExtra;
    if (!extra || typeof extra !== "object" || Array.isArray(extra)) return [];
    return Object.entries(extra)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key, value]) => ({
        id: `custom_${key}`,
        key,
        field: `_custom_${key}`,
        editable: true,
        customKey: key,
        type: "text",
        label: labelFromKey(key),
        value: Array.isArray(value) ? value.join(", ") : String(value),
      }))
      .map((entry) => {
        const detailCfg = getDetailConfig(entry);
        const columnCfg = getColumnConfig(entry);
        return {
          ...entry,
          label: detailCfg?.label || columnCfg?.detailLabel || columnCfg?.label || entry.label,
          hidden: isHiddenByListStructure(entry) || detailCfg?.visible === false,
        };
      })
      .filter((entry) => !entry.hidden);
  }, [getColumnConfig, getDetailConfig, hasOwnCamposConfig, isHiddenByListStructure, tarea?.camposExtra]);

  const hiddenDetailFields = useMemo(() => {
    const hiddenBase = baseDetailFields
      .map((field) => {
        const detailCfg = getDetailConfig(field);
        const columnCfg = getColumnConfig(field);
        return { ...field, label: detailCfg?.label || columnCfg?.detailLabel || columnCfg?.label || field.label, hidden: !isHiddenByListStructure(field) && detailCfg?.visible === false };
      })
      .filter((field) => field.hidden);
    const hiddenCustom = hasOwnCamposConfig ? [] : detalleCamposConfig
      .filter((field: any) => field?.visible === false && String(field.field || "").startsWith("_custom_"))
      .map((field: any) => ({
        id: field.id || `custom_${String(field.field).substring(8)}`,
        field: field.field,
        label: field.label || labelFromKey(String(field.field).substring(8)),
        editable: true,
        customKey: String(field.field).substring(8),
      }))
      .filter((field: DetailFieldDef) => !isHiddenByListStructure(field));
    return [...hiddenBase, ...hiddenCustom];
  }, [baseDetailFields, detalleCamposConfig, getColumnConfig, getDetailConfig, hasOwnCamposConfig, isHiddenByListStructure]);

  const notasTecnicoDirty = notasTecnicoDraft !== String(tarea?.notasTecnico || "");
  const mas20ApValue = normalizeMas20Ap(tarea?.camposExtra?.[MAS_20_AP_KEY]);

  // ── Render ──────────────────────────────
  const isDrawer = variant === "drawer";

  return (
    <div className={`fixed inset-0 z-50 flex bg-black/40 ${isDrawer ? "items-stretch justify-end sm:bg-black/20" : "items-end justify-center sm:items-center"}`} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de tarea"
        className={`flex h-[100dvh] w-full flex-col bg-white shadow-xl animate-fade-in-up ${isDrawer ? "sm:max-w-2xl sm:border-l sm:border-surface-200" : "max-w-3xl sm:mx-4 sm:h-auto sm:max-h-[90vh] sm:rounded-xl"}`}
      >
        {/* Header */}
        <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-surface-100 flex items-start justify-between shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-surface-400 uppercase tracking-wider mb-1">Detalle de Tarea</p>
            <h2 className="text-base font-semibold text-surface-800 truncate flex items-center gap-1">
              {loading ? "Cargando..." : tarea?.nombre || tarea?.incidencias || "Sin nombre"}
              {!loading && tarea && <CopyButton value={tarea.nombre || tarea.incidencias || ""} />}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar detalle"
            className="p-1.5 hover:bg-surface-100 rounded-md transition-colors ml-3 shrink-0"
          >
            <IconX className="w-4 h-4 text-surface-400" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-5 h-5 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" />
          </div>
        ) : tarea ? (
          <>
            {/* Tabs */}
            <div className="flex border-b border-surface-100 px-4 sm:px-5 shrink-0 overflow-x-auto">
              <button
                onClick={() => setActiveTab("info")}
                className={`text-xs font-medium px-3 py-2.5 border-b-2 transition-colors ${
                  activeTab === "info"
                    ? "border-primary-600 text-primary-600"
                    : "border-transparent text-surface-400 hover:text-surface-600"
                }`}
              >
                Información
              </button>
              <button
                onClick={() => setActiveTab("actividad")}
                className={`text-xs font-medium px-3 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === "actividad"
                    ? "border-primary-600 text-primary-600"
                    : "border-transparent text-surface-400 hover:text-surface-600"
                }`}
              >
                Actividad
                {(actividades.length + comentarios.length) > 0 && (
                  <span className="bg-surface-100 text-surface-500 text-[10px] px-1.5 py-0.5 rounded-full tabular-nums">
                    {actividades.length + comentarios.length}
                  </span>
                )}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === "info" ? (
                <div className="px-4 py-4 sm:px-5 space-y-4">
                  {/* Estado */}
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-surface-400 uppercase tracking-wider w-20 shrink-0">Estado</span>
                    <div className="relative">
                      <button
                        onClick={() => setEstadoDropdown(!estadoDropdown)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border"
                        style={{
                          borderColor: tarea.estado?.color ? `${tarea.estado.color}40` : "#e2e8f0",
                          color: tarea.estado?.color || "#64748b",
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: tarea.estado?.color || "#94a3b8" }}
                        />
                        {tarea.estado?.nombre || "Sin estado"}
                        <IconChevron className="w-2.5 h-2.5" />
                      </button>

                      {estadoDropdown && (
                        <div className="absolute top-full left-0 mt-1 bg-white border border-surface-200 rounded-lg shadow-lg py-1 min-w-[180px] z-20 animate-fade-in-up">
                          <div className="max-h-48 overflow-y-auto">
                            {estados.map((e) => (
                              <button
                                key={e.id}
                                onClick={() => changeEstado(e.id)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-50 transition-colors text-left"
                              >
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: e.color }}
                                />
                                <span className="text-surface-700">{e.nombre}</span>
                                {tarea.estadoId === e.id && (
                                  <IconCheck className="w-3.5 h-3.5 text-surface-500 ml-auto" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {espacioDetalleLoading ? (
                    <div className="rounded-lg border border-surface-200 px-3 py-3 text-xs text-surface-400">
                      Cargando estructura...
                    </div>
                  ) : (
                    <>
                  {detailFields.length > 0 && (
                  <div className="border border-surface-200 rounded-lg">
                    <div className="divide-y divide-surface-50">
                      {detailFields.map((f) => (
                        <div key={`${f.id}:${f.field}`} className="flex items-center gap-3 px-3 py-2">
                          <span className="text-[11px] text-surface-400 w-24 shrink-0">{f.label}</span>
                          <div className="flex items-center flex-1 min-w-0">
                          {isModOrAdmin && f.editable ? (
                            isAssignmentField(f) ? (
                              <div className="flex-1 space-y-1.5">
                                <div className="flex flex-wrap gap-1">
                                  {assignedDisplayUsers.length > 0 ? assignedDisplayUsers.map((user) => (
                                    <span key={user.id} className="rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                                      {user.nombre}
                                    </span>
                                  )) : <span className="text-xs text-surface-300">—</span>}
                                </div>
                                <div className="grid max-h-28 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-surface-100 bg-white p-1.5 sm:grid-cols-3">
                                  {assignmentUsers.map((user) => {
                                    const checked = assignedNameKeys.has(normalizeAssigneeName(user.nombre));
                                    return (
                                      <button
                                        key={user.id}
                                        type="button"
                                        onClick={() => toggleAssignedUser(user)}
                                        className={`flex min-w-0 items-center gap-1 rounded border px-1.5 py-1 text-left text-[11px] transition-colors ${checked ? "border-primary-300 bg-primary-50 text-primary-700" : "border-surface-200 text-surface-600 hover:bg-surface-50"}`}
                                      >
                                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full border ${checked ? "border-primary-500 bg-primary-500" : "border-surface-300"}`} />
                                        <span className="truncate">{user.nombre}</span>
                                      </button>
                                    );
                                  })}
                                  {assignmentUsers.length === 0 && <span className="col-span-3 px-1 py-2 text-center text-[11px] text-surface-300">Sin usuarios</span>}
                                </div>
                              </div>
                            ) : f.type === "badge" ? (
                              <select
                                value={String(fieldRawValue(f) || "")}
                                onChange={(e) => f.customKey ? saveField("camposExtra", { [f.customKey]: e.target.value }) : saveField(f.field, e.target.value)}
                                className="text-xs border-0 bg-transparent focus:ring-0 p-0 cursor-pointer text-surface-700"
                              >
                                <option value="">—</option>
                                {(f.options?.length ? f.options : ["SI", "PEDIDO", "NO"]).map((option) => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            ) : f.type === "date" && !f.customKey ? (
                              <input
                                type="date"
                                value={
                                  tarea[f.field]
                                    ? new Date(tarea[f.field]).toISOString().split("T")[0]
                                    : ""
                                }
                                onChange={(e) => saveField(f.field, e.target.value)}
                                className="text-xs border-0 bg-transparent focus:ring-0 p-0 cursor-pointer text-surface-700"
                              />
                            ) : (
                              <input
                                type="text"
                                defaultValue={String(fieldRawValue(f) || "")}
                                onBlur={(e) => {
                                  if (e.target.value !== String(fieldRawValue(f) || "")) {
                                    if (f.customKey) saveField("camposExtra", { [f.customKey]: e.target.value });
                                    else saveField(f.field, e.target.value);
                                  }
                                }}
                                className="flex-1 text-xs border-0 bg-transparent focus:ring-0 p-0 text-surface-700"
                                placeholder="—"
                              />
                            )
                          ) : (
                            <span className="text-xs text-surface-600">
                              {fieldDisplayValue(f)}
                            </span>
                          )}
                          <CopyButton value={String(fieldDisplayValue(f) === "—" ? "" : fieldDisplayValue(f))} />
                          <DetailFieldActions field={f} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  )}

                  {customEntries.length > 0 && (
                    <div className="border border-surface-200 rounded-lg">
                      <div className="px-3 py-2 border-b border-surface-100">
                        <span className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">
                          Campos personalizados
                        </span>
                      </div>
                      <div className="divide-y divide-surface-50">
                        {customEntries.map((entry) => (
                          <div key={entry.key} className="flex items-center gap-3 px-3 py-2">
                            <span className="text-[11px] text-surface-400 w-24 shrink-0">{entry.label}</span>
                            <div className="flex items-center flex-1 min-w-0">
                              {isModOrAdmin ? (
                                <input
                                  type="text"
                                  defaultValue={entry.value}
                                  onBlur={(e) => {
                                    if (e.target.value !== entry.value) {
                                      saveField("camposExtra", { [entry.key]: e.target.value });
                                    }
                                  }}
                                  className="flex-1 text-xs border-0 bg-transparent focus:ring-0 p-0 text-surface-700"
                                  placeholder="—"
                                />
                              ) : (
                                <span className="text-xs text-surface-600 truncate">{entry.value || "—"}</span>
                              )}
                              <CopyButton value={entry.value} />
                              <DetailFieldActions field={entry} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {isModOrAdmin && hiddenDetailFields.length > 0 && (
                    <div className="rounded-lg border border-dashed border-surface-200 bg-surface-50/60 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setShowHiddenDetailFields((value) => !value)}
                        className="text-[11px] font-medium text-surface-500 hover:text-primary-600"
                      >
                        {showHiddenDetailFields ? "Ocultar campos quitados" : `Campos quitados del detalle (${hiddenDetailFields.length})`}
                      </button>
                      {showHiddenDetailFields && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {hiddenDetailFields.map((field) => (
                            <button
                              key={field.id}
                              type="button"
                              onClick={() => restoreDetailField(field)}
                              disabled={savingDetailConfig}
                              className="rounded border border-surface-200 bg-white px-2 py-1 text-[11px] text-surface-600 hover:border-primary-300 hover:text-primary-600 disabled:opacity-50"
                            >
                              + {field.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                    </>
                  )}

                  {/* Notas */}
                  {showNotasSection && (
                  <div className="border border-surface-200 rounded-lg">
                    <div className="px-3 py-2 border-b border-surface-100">
                      <span className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">
                        Notas
                      </span>
                    </div>
                    {isModOrAdmin ? (
                      <textarea
                        defaultValue={tarea.notas || ""}
                        onBlur={(e) => {
                          if (e.target.value !== (tarea.notas || "")) {
                            saveField("notas", e.target.value);
                          }
                        }}
                        placeholder="Agregar notas..."
                        rows={3}
                        className="w-full text-xs border-0 bg-transparent p-3 focus:ring-0 resize-none text-surface-700 placeholder:text-surface-300"
                      />
                    ) : (
                      <p className="text-xs text-surface-600 p-3">{tarea.notas || "Sin notas"}</p>
                    )}
                  </div>
                  )}

                  {/* Observaciones del técnico */}
                  <div className="border border-surface-200 rounded-lg">
                    <div className="px-3 py-2 border-b border-surface-100 flex items-center justify-between">
                      <span className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">
                        Observaciones del técnico
                      </span>
                      {tarea.notasTecnico && isModOrAdmin && (
                        <span className="text-[10px] text-amber-500 font-medium">● Tiene observaciones</span>
                      )}
                    </div>
                    {!isModOrAdmin ? (
                      <div className="p-3 space-y-2">
                        <textarea
                          value={notasTecnicoDraft}
                          onChange={(e) => setNotasTecnicoDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                              e.preventDefault();
                              void saveNotasTecnico();
                            }
                          }}
                          placeholder="Escribir observaciones..."
                          rows={3}
                          className="w-full text-xs border border-surface-200 bg-white rounded-md p-2.5 focus:outline-none focus:border-primary-400 resize-none text-surface-700 placeholder:text-surface-300"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[11px] ${notasTecnicoDirty ? "text-amber-600" : "text-surface-400"}`}>
                            {notasTecnicoDirty ? "Cambios sin guardar" : "Sin cambios pendientes"}
                          </span>
                          <button
                            type="button"
                            onClick={() => { void saveNotasTecnico(); }}
                            disabled={!notasTecnicoDirty || savingNotasTecnico}
                            className="rounded-md bg-surface-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-surface-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {savingNotasTecnico ? "Guardando..." : "Guardar"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-surface-600 p-3 whitespace-pre-wrap">{tarea.notasTecnico || <span className="text-surface-300 italic">Sin observaciones</span>}</p>
                    )}
                  </div>

                  {/* Tiene más de 20 AP */}
                  <div className="border border-surface-200 rounded-lg">
                    <div className="px-3 py-2 border-b border-surface-100 flex items-center justify-between">
                      <span className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">
                        Tiene más de 20 AP
                      </span>
                      {mas20ApValue === "SI" && (
                        <span className="text-[10px] text-violet-600 font-medium">● Marcado SI</span>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={mas20ApValue}
                          onChange={(e) => { void saveMas20Ap(normalizeMas20Ap(e.target.value)); }}
                          disabled={savingMas20Ap}
                          className="w-full max-w-[220px] rounded-md border border-surface-200 bg-white px-2.5 py-1.5 text-xs text-surface-700 focus:outline-none focus:border-primary-400 disabled:opacity-50"
                        >
                          <option value="">Sin dato</option>
                          <option value="SI">Sí</option>
                          <option value="NO">No</option>
                        </select>
                        {savingMas20Ap && <span className="text-[11px] text-surface-400">Guardando...</span>}
                      </div>
                    </div>
                  </div>

                  {/* Info de creación */}
                  <div className="flex items-center gap-4 text-[10px] text-surface-400 pt-2">
                    <span>Creado: {formatDateTime(tarea.createdAt)}</span>
                    <span>Actualizado: {formatDateTime(tarea.updatedAt)}</span>
                  </div>
                </div>
              ) : (
                /* ── Tab: Actividad ── */
                <div className="px-5 py-4 space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="border border-surface-200 rounded-lg p-3">
                      <p className="text-[10px] text-surface-400 uppercase tracking-wider">Comentarios</p>
                      <p className="text-lg font-semibold text-surface-800 tabular-nums">{comentarios.length}</p>
                    </div>
                    <div className="border border-surface-200 rounded-lg p-3">
                      <p className="text-[10px] text-surface-400 uppercase tracking-wider">Cambios</p>
                      <p className="text-lg font-semibold text-surface-800 tabular-nums">{actividades.length}</p>
                    </div>
                    <div className="border border-surface-200 rounded-lg p-3">
                      <p className="text-[10px] text-surface-400 uppercase tracking-wider">Archivos</p>
                      <p className="text-lg font-semibold text-surface-800 tabular-nums">{tarea.actas?.length || 0}</p>
                    </div>
                  </div>

                  {lastTimelineItem && (
                    <div className="rounded-lg bg-surface-50 border border-surface-100 px-3 py-2 text-xs text-surface-600">
                      Ultimo movimiento: <span className="font-medium text-surface-800">{formatDateTime(lastTimelineItem._date)}</span>
                    </div>
                  )}

                  {/* Comentar */}
                  <div className="flex gap-2">
                    <textarea
                      value={nuevoComentario}
                      onChange={(e) => setNuevoComentario(e.target.value)}
                      placeholder="Escribe un comentario..."
                      rows={2}
                      className="flex-1 text-xs border border-surface-200 rounded-lg p-2.5 focus:outline-none focus:border-primary-400 resize-none placeholder:text-surface-300"
                    />
                  </div>
                  {nuevoComentario.trim() && (
                    <div className="flex justify-end -mt-2">
                      <button
                        onClick={saveComentario}
                        className="px-3 py-1 bg-primary-600 text-white rounded-md text-[11px] font-medium hover:bg-primary-700 transition-colors"
                      >
                        Comentar
                      </button>
                    </div>
                  )}

                  <div className="relative pl-3">
                    <div className="absolute left-[22px] top-2 bottom-2 w-px bg-surface-100" />
                    {timelineItems.map((item) => {
                      const meta = getActivityMeta(item);
                      const changes = getActivityChanges(item);
                      const title = item._type === "comentario"
                        ? item.contenido
                        : item._type === "acta"
                          ? item.nombre || item.archivoNombre
                          : item.descripcion || item.accion;
                      const fileSize = item._type === "acta" ? formatFileSize(item.archivoSize) : "";
                      const subtitle = item._type === "acta"
                        ? `${item.archivoNombre}${fileSize ? ` · ${fileSize}` : ""}`
                        : item._type === "actividad" && item.metadata?.contenido
                          ? item.metadata.contenido
                          : "";
                      return (
                        <div key={`${item._type}-${item.id}`} className="relative flex gap-3 py-3 border-b border-surface-50 last:border-0">
                          <div className={`w-5 h-5 rounded-full ${meta.dot} ring-4 ring-white shrink-0 mt-0.5 z-10`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-medium text-surface-700">
                                {meta.actor}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${meta.chip}`}>
                                {meta.label}
                              </span>
                            </div>
                            <p className="text-xs text-surface-500 mt-0.5 break-words">
                              {title}
                            </p>
                            {subtitle && <p className="text-[11px] text-surface-400 mt-0.5 break-words">{subtitle}</p>}
                            {changes.length > 0 && (
                              <div className="mt-2 space-y-1 rounded-lg border border-surface-100 bg-surface-50/70 p-2">
                                {changes.map((change, index) => (
                                  <div key={`${item.id}-${change.label}-${index}`} className="grid grid-cols-[82px_1fr] gap-2 text-[11px]">
                                    <span className="font-medium text-surface-500">{change.label}</span>
                                    <span className="min-w-0 text-surface-500">
                                      <span className="text-red-600 line-through decoration-red-300">{String(change.before)}</span>
                                      <span className="mx-1 text-surface-300">-&gt;</span>
                                      <span className="font-medium text-emerald-700">{String(change.after)}</span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {item._type === "acta" && (
                              <a
                                href={`/api/actas/${item.id}`}
                                className="inline-flex mt-1 text-[11px] text-primary-600 hover:text-primary-700 font-medium"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Descargar archivo
                              </a>
                            )}
                            <p className="text-[10px] text-surface-400 mt-1">
                              {formatDateTime(item._date)}
                            </p>
                          </div>
                        </div>
                      );
                    })}

                    {timelineItems.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-surface-300">
                        <IconClock className="w-8 h-8 mb-2" />
                        <p className="text-xs">Sin actividad registrada</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex justify-center py-16 text-surface-400 text-sm">
            Tarea no encontrada
          </div>
        )}
      </div>
      {editingDetailField && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4" onClick={(event) => event.stopPropagation()}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-surface-800">Editar campo del detalle</h3>
            <p className="mt-1 text-xs text-surface-400">Este nombre se guarda para el espacio actual.</p>
            <input
              autoFocus
              value={editingDetailLabel}
              onChange={(event) => setEditingDetailLabel(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") confirmEditDetailField(); if (event.key === "Escape") setEditingDetailField(null); }}
              className="mt-4 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm outline-none focus:border-primary-400"
              maxLength={60}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingDetailField(null)} className="rounded-md px-3 py-1.5 text-xs text-surface-600 hover:bg-surface-100">Cancelar</button>
              <button type="button" onClick={confirmEditDetailField} className="rounded-md bg-surface-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-surface-700">Guardar</button>
            </div>
          </div>
        </div>
      )}
      {hidingDetailField && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4" onClick={(event) => event.stopPropagation()}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-surface-800">Quitar campo del detalle</h3>
            <p className="mt-2 text-xs text-surface-500">¿Quitar {hidingDetailField.label} del detalle de este espacio? No se elimina la informacion de las tareas.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setHidingDetailField(null)} className="rounded-md px-3 py-1.5 text-xs text-surface-600 hover:bg-surface-100">Cancelar</button>
              <button type="button" onClick={confirmHideDetailField} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">Quitar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
