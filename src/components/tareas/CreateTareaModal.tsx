"use client";

import { useEffect, useMemo, useState } from "react";
import { IconEdit, IconPlus, IconTrash } from "@/components/ui/Icons";

interface EstadoOption {
  id: string;
  nombre: string;
}

interface EquipoOption {
  key: string;
  display: string;
}

interface TaskFieldConfig {
  id: string;
  label: string;
  field: string;
  type?: "text" | "badge" | "date" | "select" | "multiselect" | "colored-select" | string;
  visible?: boolean;
  options?: string[];
  optionColors?: Record<string, string>;
  width?: number;
  editable?: boolean;
  showInCreate?: boolean;
}

interface EspacioOption {
  id: string;
  nombre: string;
  parentId?: string | null;
  _depth?: number;
  camposConfig?: unknown;
  estadosConfig?: unknown;
}

interface CreateTareaModalProps {
  estados: EstadoOption[];
  equipoOpts: EquipoOption[];
  fieldsConfig?: TaskFieldConfig[];
  espacios?: EspacioOption[];
  allowSpaceSelection?: boolean;
  requireSpaceSelection?: boolean;
  isAdmin?: boolean;
  initialEstadoId?: string;
  initialEspacioId?: string;
  espacioNombre?: string;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  onFieldsConfigChange?: (fields: TaskFieldConfig[]) => void | Promise<void>;
  onSpaceCreated?: (space: EspacioOption) => void | Promise<void>;
}

const emptyForm = {
  nombre: "",
  codigo: "",
  direccion: "",
  ciudad: "",
  notas: "",
  prioridad: "MEDIA",
  incidencias: "",
  lacR: "",
  cue: "",
  ambito: "",
  equipoAsignado: "",
  provincia: "",
  cuePredio: "",
  gpsPredio: "",
  fechaDesde: "",
  fechaHasta: "",
  estadoId: "",
  espacioId: "",
};

export default function CreateTareaModal({
  estados,
  equipoOpts,
  fieldsConfig,
  espacios = [],
  allowSpaceSelection = false,
  requireSpaceSelection = false,
  isAdmin = false,
  initialEstadoId = "",
  initialEspacioId = "",
  espacioNombre,
  onClose,
  onCreated,
  onFieldsConfigChange,
  onSpaceCreated,
}: CreateTareaModalProps) {
  const [form, setForm] = useState({ ...emptyForm, estadoId: initialEstadoId, espacioId: initialEspacioId });
  const [customValues, setCustomValues] = useState<Record<string, string | string[]>>({});
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [editingFields, setEditingFields] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [draftFields, setDraftFields] = useState<TaskFieldConfig[]>([]);
  const [savingFields, setSavingFields] = useState(false);
  const [useSpaceFormat, setUseSpaceFormat] = useState(true);
  const [localEspacios, setLocalEspacios] = useState<EspacioOption[]>(espacios);
  const [showNewSpaceForm, setShowNewSpaceForm] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [newSpaceParentId, setNewSpaceParentId] = useState("");
  const [newSpaceColor, setNewSpaceColor] = useState("#3b82f6");
  const [creatingSpace, setCreatingSpace] = useState(false);

  useEffect(() => setLocalEspacios(espacios), [espacios]);

  const selectedSpace = useMemo(() => localEspacios.find((space) => space.id === form.espacioId) || null, [form.espacioId, localEspacios]);
  const spaceFieldsConfig = Array.isArray(selectedSpace?.camposConfig) ? selectedSpace.camposConfig as TaskFieldConfig[] : undefined;
  const effectiveFieldsConfig = allowSpaceSelection && form.espacioId && useSpaceFormat
    ? (spaceFieldsConfig || fieldsConfig)
    : fieldsConfig;

  const effectiveEstados = useMemo(() => {
    if (!allowSpaceSelection || !form.espacioId || !useSpaceFormat) return estados;
    const config = selectedSpace?.estadosConfig;
    const typedConfig = config && typeof config === "object" && !Array.isArray(config)
      ? config as { estadoIds?: unknown }
      : null;
    const estadoIds = Array.isArray(typedConfig?.estadoIds)
      ? typedConfig.estadoIds.filter((id): id is string => typeof id === "string")
      : null;
    return estadoIds ? estados.filter((estado) => estadoIds.includes(estado.id)) : estados;
  }, [allowSpaceSelection, estados, form.espacioId, selectedSpace, useSpaceFormat]);

  const activeFields = (effectiveFieldsConfig || []).filter((field) => field.visible !== false);
  const configured = effectiveFieldsConfig !== undefined;
  const isCustomField = (field: TaskFieldConfig) => field.id.startsWith("custom_") || field.field.startsWith("_custom_");
  const createFields = activeFields.filter((field) => isCustomField(field) ? field.showInCreate === true : field.showInCreate !== false);
  const hasField = (fieldName: string, id?: string) => {
    if (!configured) return true;
    return createFields.some((field) => field.field === fieldName || (id && field.id === id));
  };
  const customFields = createFields.filter(isCustomField);
  const findField = (fieldName: string, id?: string) => activeFields.find((field) => field.field === fieldName || (id && field.id === id));

  const inputClass = "px-2.5 py-2 sm:py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300";
  const selectClass = "px-2.5 py-2 sm:py-1.5 border border-surface-200 rounded-md text-xs text-surface-600 bg-white";

  useEffect(() => {
    setDraftFields((effectiveFieldsConfig || []).filter((field) => field.visible !== false).map((field) => ({ ...field, options: field.options || [] })));
    setEditingFields(false);
    setEditingFieldId(null);
    setShowAllFields(false);
  }, [effectiveFieldsConfig]);

  useEffect(() => {
    if (!form.estadoId || effectiveEstados.some((estado) => estado.id === form.estadoId)) return;
    setForm((prev) => ({ ...prev, estadoId: "" }));
  }, [effectiveEstados, form.estadoId]);

  function customKey(field: TaskFieldConfig) {
    return field.field.startsWith("_custom_") ? field.field.substring(8) : field.id.replace(/^custom_/, "");
  }

  function slugFieldName(name: string) {
    return name
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || `campo_${Date.now()}`;
  }

  function parseOptions(raw: string) {
    const options: string[] = [];
    const optionColors: Record<string, string> = {};
    raw.split(",").map((item) => item.trim()).filter(Boolean).forEach((item) => {
      const [labelRaw, colorRaw] = item.split(":").map((part) => part.trim());
      if (!labelRaw) return;
      options.push(labelRaw);
      if (colorRaw) optionColors[labelRaw] = colorRaw;
    });
    return { options, optionColors: Object.keys(optionColors).length ? optionColors : undefined };
  }

  function serializeOptions(field: TaskFieldConfig) {
    return (field.options || []).map((option) => field.optionColors?.[option] ? `${option}:${field.optionColors[option]}` : option).join(", ");
  }

  function updateDraftField(index: number, patch: Partial<TaskFieldConfig>) {
    setDraftFields((prev) => prev.map((field, i) => i === index ? { ...field, ...patch } : field));
  }

  function addDraftField(type: TaskFieldConfig["type"] = "text") {
    const stamp = Date.now();
    const field = {
      id: `custom_campo_${stamp}`,
      label: "Nuevo campo",
      field: `_custom_campo_${stamp}`,
      type,
      visible: true,
      editable: true,
      showInCreate: true,
      width: 120,
      options: type === "select" || type === "multiselect" || type === "colored-select" || type === "badge" ? ["Opcion 1"] : undefined,
    };
    setDraftFields((prev) => [...prev, field]);
    setEditingFieldId(field.id);
    setEditingFields(true);
    setShowAllFields(false);
  }

  function normalizeFields(fields: TaskFieldConfig[]) {
    return fields
      .filter((field) => field.label.trim())
      .map((field) => {
        const isCustom = isCustomField(field);
        const key = isCustom ? customKey(field) : slugFieldName(field.label);
        const id = isCustom ? (field.id.startsWith("custom_") ? field.id : `custom_${key}`) : field.id;
        const fieldName = isCustom ? (field.field.startsWith("_custom_") ? field.field : `_custom_${key}`) : field.field;
        return {
          ...field,
          id,
          field: fieldName,
          label: field.label.trim(),
          visible: field.visible !== false,
          editable: field.editable !== false,
          showInCreate: isCustom ? field.showInCreate === true : field.showInCreate !== false,
          width: field.width || 120,
        };
      });
  }

  async function persistFields(fields: TaskFieldConfig[], closeEditor = true) {
    if (savingFields) return;
    setSavingFields(true);
    const normalized = normalizeFields(fields);
    if (onFieldsConfigChange) {
      await onFieldsConfigChange(normalized);
    } else if (allowSpaceSelection && form.espacioId) {
      const res = await fetch(`/api/espacios/${form.espacioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ camposConfig: normalized }),
      });
      if (res.ok) {
        setLocalEspacios((prev) => prev.map((space) => space.id === form.espacioId ? { ...space, camposConfig: normalized } : space));
      }
    } else if (allowSpaceSelection && showNewSpaceForm) {
      setDraftFields(normalized);
    }
    setSavingFields(false);
    if (closeEditor) {
      setEditingFields(false);
      setEditingFieldId(null);
    }
  }

  async function saveFieldConfig() {
    await persistFields(draftFields);
  }

  async function removeField(field: TaskFieldConfig) {
    if (!window.confirm(`¿Eliminar el campo "${field.label}" de este espacio?`)) return;
    const nextFields = draftFields.filter((item) => item.id !== field.id);
    setDraftFields(nextFields);
    await persistFields(nextFields);
  }

  function openFieldEditor(field: TaskFieldConfig) {
    setEditingFieldId(field.id);
    setEditingFields(true);
    setShowAllFields(false);
  }

  const canEditFields = isAdmin && Boolean(onFieldsConfigChange || (allowSpaceSelection && (form.espacioId || showNewSpaceForm)));

  function fieldActions(field?: TaskFieldConfig) {
    if (!field || !canEditFields) return null;
    return (
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={() => openFieldEditor(field)} className="rounded p-1 text-surface-300 hover:bg-surface-100 hover:text-primary-600" title={`Editar ${field.label}`}>
          <IconEdit className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => removeField(field)} className="rounded p-1 text-surface-300 hover:bg-red-50 hover:text-red-500" title={`Eliminar ${field.label}`}>
          <IconTrash className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  function fieldShell(field: TaskFieldConfig | undefined, element: React.ReactNode, span = false) {
    if (!fieldActions(field)) return element;
    return (
      <div key={field?.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 ${span ? "col-span-2" : ""}`}>
        {element}
        {fieldActions(field)}
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    if (requireSpaceSelection && !form.espacioId) {
      setFormError("Elegí un espacio o creá uno nuevo para esta tarea.");
      return;
    }
    setFormError("");
    setCreating(true);
    const res = await fetch("/api/tareas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...form, camposExtra: customValues }),
    });
    setCreating(false);
    if (res.ok) {
      onClose();
      void onCreated();
    }
  }

  async function createSpaceFromTask() {
    const nombre = newSpaceName.trim();
    if (!nombre || creatingSpace) return;
    setCreatingSpace(true);
    setFormError("");
    const normalizedFields = normalizeFields(draftFields.length ? draftFields : activeFields);
    const res = await fetch("/api/espacios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        nombre,
        color: newSpaceColor,
        parentId: newSpaceParentId || null,
        camposConfig: normalizedFields,
        estadosConfig: { estadoIds: effectiveEstados.map((estado) => estado.id) },
      }),
    });
    setCreatingSpace(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setFormError(data.error || "No se pudo crear el espacio.");
      return;
    }
    const created = await res.json();
    const parentDepth = newSpaceParentId ? localEspacios.find((space) => space.id === newSpaceParentId)?._depth ?? 0 : -1;
    const nextSpace = { ...created, _depth: parentDepth + 1, camposConfig: normalizedFields, estadosConfig: { estadoIds: effectiveEstados.map((estado) => estado.id) } };
    setLocalEspacios((prev) => [...prev, nextSpace]);
    setForm((prev) => ({ ...prev, espacioId: created.id }));
    setUseSpaceFormat(true);
    setNewSpaceName("");
    setNewSpaceParentId("");
    setShowNewSpaceForm(false);
    window.dispatchEvent(new CustomEvent("espacios-updated"));
    if (onSpaceCreated) await onSpaceCreated(nextSpace);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <form onSubmit={handleCreate} className="flex h-[100dvh] w-full max-w-2xl flex-col overflow-y-auto bg-white p-4 shadow-xl animate-fade-in-up sm:mx-4 sm:h-auto sm:max-h-[90vh] sm:rounded-xl sm:p-5">
        <div className="sticky -top-4 z-10 mb-4 flex items-start justify-between gap-3 border-b border-surface-100 bg-white pb-3 pt-1 sm:static sm:border-b-0 sm:pb-0 sm:pt-0">
          <div>
            <h2 className="text-sm font-semibold text-surface-800">Nueva tarea</h2>
            {allowSpaceSelection
              ? <p className="text-[11px] text-surface-400 mt-0.5">Elegí dónde crearla y qué formato usar.</p>
              : espacioNombre && <p className="text-[11px] text-surface-400 mt-0.5">Se creara en {espacioNombre}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-surface-300 hover:text-surface-500" title="Cerrar">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {allowSpaceSelection && (
          <div className="mb-3 rounded-lg border border-surface-200 bg-surface-50/70 p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-surface-700">Ubicación y formato</span>
              <button type="button" onClick={() => setShowNewSpaceForm((value) => !value)} className="text-[11px] text-primary-600 hover:text-primary-700">
                {showNewSpaceForm ? "Cancelar espacio" : "+ Nuevo espacio"}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <select
                value={form.espacioId}
                onChange={(e) => { setForm({ ...form, espacioId: e.target.value, estadoId: "" }); setUseSpaceFormat(true); setFormError(""); }}
                className={`w-full ${selectClass}`}
              >
                <option value="">Elegir espacio para esta tarea</option>
                {localEspacios.map((space) => (
                  <option key={space.id} value={space.id}>{"  ".repeat(space._depth || 0)}{(space._depth || 0) > 0 ? "└ " : ""}{space.nombre}</option>
                ))}
              </select>
              <label className={`inline-flex items-center gap-2 rounded-md border border-surface-200 bg-white px-2.5 py-1.5 text-[11px] ${form.espacioId ? "text-surface-600" : "text-surface-300"}`}>
                <input type="checkbox" checked={useSpaceFormat} disabled={!form.espacioId} onChange={(e) => setUseSpaceFormat(e.target.checked)} className="h-3.5 w-3.5 rounded border-surface-300" />
                Respetar formato
              </label>
            </div>
            {selectedSpace && useSpaceFormat && (
              <p className="mt-1.5 text-[10px] text-surface-400">
                Usando estructura de {selectedSpace.nombre}: {activeFields.length || "sin"} campos y {effectiveEstados.length || "sin"} estados.
              </p>
            )}
            {showNewSpaceForm && (
              <div className="mt-2 grid gap-2 rounded-md border border-surface-200 bg-white p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                <input value={newSpaceName} onChange={(e) => setNewSpaceName(e.target.value)} placeholder="Nombre del nuevo espacio" className={inputClass} />
                <select value={newSpaceParentId} onChange={(e) => setNewSpaceParentId(e.target.value)} className={selectClass}>
                  <option value="">Crear como espacio raíz</option>
                  {localEspacios.map((space) => (
                    <option key={space.id} value={space.id}>{"  ".repeat(space._depth || 0)}{(space._depth || 0) > 0 ? "└ " : ""}{space.nombre}</option>
                  ))}
                </select>
                <input type="color" value={newSpaceColor} onChange={(e) => setNewSpaceColor(e.target.value)} className="h-8 w-10 rounded border border-surface-200 p-0" title="Color" />
                <button type="button" onClick={createSpaceFromTask} disabled={!newSpaceName.trim() || creatingSpace} className="rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50">
                  {creatingSpace ? "Creando..." : "Crear espacio"}
                </button>
                <p className="sm:col-span-4 text-[10px] text-surface-400">El nuevo espacio se crea con los campos visibles/configurados actualmente y queda seleccionado para esta tarea.</p>
              </div>
            )}
          </div>
        )}

        {canEditFields && (
          <div className="mb-3 rounded-lg border border-surface-200 bg-surface-50/70 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-surface-700">Campos de este espacio</span>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => addDraftField("text")} className="inline-flex items-center gap-1 rounded border border-surface-200 bg-white px-2 py-1 text-[11px] text-surface-600 hover:bg-primary-50">
                  <IconPlus className="h-3 w-3" /> Campo
                </button>
                <button type="button" onClick={() => { setShowAllFields((value) => !value); setEditingFields(false); setEditingFieldId(null); }} className="rounded px-2 py-1 text-[11px] text-primary-600 hover:bg-white">
                  {showAllFields ? "Ocultar" : "Ver todos"}
                </button>
              </div>
            </div>
            {showAllFields && (
              <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
                {draftFields.map((field) => (
                  <div key={field.id} className="flex items-center gap-2 rounded border border-surface-200 bg-white px-2 py-1">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-surface-700">{field.label}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${isCustomField(field) ? field.showInCreate === true : field.showInCreate !== false ? "bg-emerald-50 text-emerald-700" : "bg-surface-100 text-surface-500"}`}>
                      {(isCustomField(field) ? field.showInCreate === true : field.showInCreate !== false) ? "Alta" : "Lista"}
                    </span>
                    {fieldActions(field)}
                  </div>
                ))}
                {draftFields.length === 0 && <p className="py-2 text-center text-[11px] text-surface-400">Sin campos configurados</p>}
              </div>
            )}
            {editingFields && (() => {
              const index = draftFields.findIndex((field) => field.id === editingFieldId);
              const field = index >= 0 ? draftFields[index] : null;
              if (!field) return null;
              const selectable = ["select", "badge", "multiselect", "colored-select"].includes(String(field.type || ""));
              return (
              <div className="mt-2 space-y-2">
                <div className="grid gap-1.5 rounded border border-surface-200 bg-white p-2">
                  <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input value={field.label} onChange={(e) => updateDraftField(index, { label: e.target.value })} className="min-w-0 rounded border border-surface-200 px-2 py-1 text-[11px]" />
                    <select value={field.type || "text"} onChange={(e) => updateDraftField(index, { type: e.target.value, options: ["select", "badge", "multiselect", "colored-select"].includes(e.target.value) ? (field.options?.length ? field.options : ["Opcion 1"]) : undefined })} className="rounded border border-surface-200 px-2 py-1 text-[11px]">
                      <option value="text">Label</option>
                      <option value="date">Fecha</option>
                      <option value="select">Desplegable</option>
                      <option value="multiselect">Multiple</option>
                      <option value="colored-select">Color</option>
                      <option value="badge">Badge</option>
                    </select>
                  </div>
                  {selectable && (
                    <input
                      value={serializeOptions(field)}
                      onChange={(e) => updateDraftField(index, parseOptions(e.target.value))}
                      placeholder="Opciones: Pendiente:#f59e0b, Listo:#22c55e"
                      className="rounded border border-surface-200 px-2 py-1 text-[11px]"
                    />
                  )}
                  <label className="inline-flex items-center gap-2 text-[11px] text-surface-500">
                    <input type="checkbox" checked={isCustomField(field) ? field.showInCreate === true : field.showInCreate !== false} onChange={(e) => updateDraftField(index, { showInCreate: e.target.checked })} className="h-3.5 w-3.5 rounded border-surface-300" />
                    Mostrar al crear tareas
                  </label>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setEditingFields(false); setEditingFieldId(null); setDraftFields(activeFields.map((field) => ({ ...field }))); }} className="rounded px-2 py-1 text-[11px] text-surface-500 hover:bg-white">Cancelar</button>
                  <button type="button" onClick={saveFieldConfig} disabled={savingFields} className="rounded bg-primary-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-primary-700 disabled:opacity-50">{savingFields ? "Guardando..." : "Guardar campos"}</button>
                </div>
              </div>
              );
            })()}
          </div>
        )}
        <div className="space-y-2.5">
          <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre / Predio *" className={`w-full ${inputClass}`} />
          {hasField("codigo", "codigoPredio") && fieldShell(findField("codigo", "codigoPredio"), <input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="Codigo" className={`w-full ${inputClass}`} />)}
          {hasField("incidencias", "predio") && fieldShell(findField("incidencias", "predio"), <input value={form.incidencias} onChange={(e) => setForm({ ...form, incidencias: e.target.value })} placeholder="Incidencia" className={`w-full ${inputClass}`} />)}

          {(hasField("cue") || hasField("lacR")) && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {hasField("cue") && fieldShell(findField("cue"), <input value={form.cue} onChange={(e) => setForm({ ...form, cue: e.target.value })} placeholder="CUE" className={inputClass} />)}
              {hasField("lacR") && fieldShell(findField("lacR"), <select value={form.lacR} onChange={(e) => setForm({ ...form, lacR: e.target.value })} className={selectClass}>
                <option value="">LAC-R</option>
                <option value="SI">SI</option>
                <option value="NO">NO</option>
              </select>)}
            </div>
          )}

          {(hasField("ambito") || hasField("equipoAsignado")) && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {hasField("ambito") && fieldShell(findField("ambito"), <select value={form.ambito} onChange={(e) => setForm({ ...form, ambito: e.target.value })} className={selectClass}>
                <option value="">Ambito</option>
                <option value="Urbano">Urbano</option>
                <option value="Rural">Rural</option>
                <option value="Rural Disperso">Rural Disperso</option>
              </select>)}
              {hasField("equipoAsignado") && fieldShell(findField("equipoAsignado"), <select value={form.equipoAsignado} onChange={(e) => setForm({ ...form, equipoAsignado: e.target.value })} className={selectClass}>
                <option value="">Equipo</option>
                {equipoOpts.map(opt => <option key={opt.key} value={opt.key}>{opt.display}</option>)}
              </select>)}
            </div>
          )}

          {(hasField("provincia") || hasField("ciudad")) && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {hasField("provincia") && fieldShell(findField("provincia"), <input value={form.provincia} onChange={(e) => setForm({ ...form, provincia: e.target.value })} placeholder="Provincia" className={inputClass} />)}
              {hasField("ciudad") && fieldShell(findField("ciudad"), <input value={form.ciudad} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} placeholder="Ciudad/Departamento" className={inputClass} />)}
            </div>
          )}

          {hasField("direccion") && fieldShell(findField("direccion"), <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} placeholder="Direccion" className={`w-full ${inputClass}`} />)}

          {(hasField("cuePredio") || hasField("gpsPredio")) && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {hasField("cuePredio") && fieldShell(findField("cuePredio"), <input value={form.cuePredio} onChange={(e) => setForm({ ...form, cuePredio: e.target.value })} placeholder="CUE_Predio" className={inputClass} />)}
              {hasField("gpsPredio") && fieldShell(findField("gpsPredio"), <input value={form.gpsPredio} onChange={(e) => setForm({ ...form, gpsPredio: e.target.value })} placeholder="GPS_Predio" className={inputClass} />)}
            </div>
          )}

          {(hasField("fechaDesde") || hasField("fechaHasta")) && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {hasField("fechaDesde") && fieldShell(findField("fechaDesde"), <input type="date" value={form.fechaDesde} onChange={(e) => setForm({ ...form, fechaDesde: e.target.value })} className={inputClass} />)}
              {hasField("fechaHasta") && fieldShell(findField("fechaHasta"), <input type="date" value={form.fechaHasta} onChange={(e) => setForm({ ...form, fechaHasta: e.target.value })} className={inputClass} />)}
            </div>
          )}

          {customFields.map((field) => {
            const key = customKey(field);
            const value = customValues[key] || "";
            if (["select", "badge", "colored-select"].includes(String(field.type || ""))) {
              const selectedValue = Array.isArray(value) ? "" : value;
              return fieldShell(field, (
                <select key={field.id} value={selectedValue} onChange={(e) => setCustomValues({ ...customValues, [key]: e.target.value })} className={`w-full ${selectClass}`}>
                  <option value="">{field.label}</option>
                  {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ));
            }
            if (field.type === "multiselect") {
              const selected = Array.isArray(value) ? value : [];
              return fieldShell(field, (
                <div key={field.id} className="rounded-md border border-surface-200 p-2">
                  <p className="mb-1.5 text-[11px] font-medium text-surface-500">{field.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(field.options || []).map((opt) => {
                      const checked = selected.includes(opt);
                      return (
                        <button key={opt} type="button" onClick={() => setCustomValues({ ...customValues, [key]: checked ? selected.filter((item) => item !== opt) : [...selected, opt] })} className={`rounded border px-2 py-1 text-[11px] ${checked ? "border-primary-400 bg-primary-50 text-primary-700" : "border-surface-200 text-surface-600"}`}>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ));
            }
            return fieldShell(field, <input key={field.id} type={field.type === "date" ? "date" : "text"} value={Array.isArray(value) ? value.join(", ") : value} onChange={(e) => setCustomValues({ ...customValues, [key]: e.target.value })} placeholder={field.label} className={`w-full ${inputClass}`} />);
          })}

          {effectiveEstados.length > 0 && (
            <select value={form.estadoId} onChange={(e) => setForm({ ...form, estadoId: e.target.value })} className={`w-full ${selectClass}`}>
              <option value="">Estado inicial</option>
              {effectiveEstados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          )}

          {hasField("notas") && fieldShell(findField("notas"), <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Notas" rows={2} className={`w-full ${inputClass} resize-none`} />)}
        </div>
        {formError && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{formError}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-100 rounded-md transition-colors">Cancelar</button>
          <button type="submit" disabled={creating} className="px-3 py-1.5 text-xs bg-surface-800 text-white rounded-md hover:bg-surface-700 disabled:opacity-60 font-medium transition-colors">
            {creating ? "Creando..." : "Crear"}
          </button>
        </div>
      </form>
    </div>
  );
}
