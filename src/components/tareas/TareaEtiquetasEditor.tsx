"use client";

import { useMemo, useState } from "react";

export type TareaEtiquetaValue = {
  id?: string;
  nombre: string;
  color?: string | null;
};

type TareaEtiquetaRelation = {
  etiqueta?: TareaEtiquetaValue | null;
};

type Props = {
  etiquetas?: TareaEtiquetaRelation[] | TareaEtiquetaValue[] | null;
  canEdit: boolean;
  onSave: (etiquetas: TareaEtiquetaValue[]) => Promise<void> | void;
  compact?: boolean;
};

const ETIQUETA_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#1e293b",
];

function isEtiquetaRelation(item: TareaEtiquetaRelation | TareaEtiquetaValue): item is TareaEtiquetaRelation {
  return "etiqueta" in item;
}

function normalizeEtiquetas(etiquetas: Props["etiquetas"]): TareaEtiquetaValue[] {
  if (!Array.isArray(etiquetas)) return [];
  const normalized: TareaEtiquetaValue[] = [];
  for (const item of etiquetas) {
    const value: TareaEtiquetaValue | null | undefined = isEtiquetaRelation(item) ? item.etiqueta : item;
    if (!value?.nombre) continue;
    normalized.push({
      id: value.id,
      nombre: value.nombre,
      color: value.color || ETIQUETA_COLORS[5],
    });
  }
  return normalized;
}

export default function TareaEtiquetasEditor({ etiquetas, canEdit, onSave, compact = false }: Props) {
  const current = useMemo(() => normalizeEtiquetas(etiquetas), [etiquetas]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [texto, setTexto] = useState("");
  const [color, setColor] = useState(ETIQUETA_COLORS[5]);

  async function addEtiqueta() {
    const nombre = texto.trim();
    if (!nombre || saving) return;
    const exists = current.some((tag) => tag.nombre.toLowerCase() === nombre.toLowerCase());
    const next = exists ? current : [...current, { nombre, color }];
    setSaving(true);
    await onSave(next);
    setSaving(false);
    setTexto("");
    setColor(ETIQUETA_COLORS[5]);
    setEditing(false);
  }

  async function removeEtiqueta(nombre: string) {
    if (saving) return;
    setSaving(true);
    await onSave(current.filter((tag) => tag.nombre !== nombre));
    setSaving(false);
  }

  return (
    <div className="flex max-w-full flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {current.map((tag) => (
        <span
          key={tag.id || tag.nombre}
          className="inline-flex max-w-[120px] items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
          style={{ backgroundColor: tag.color || ETIQUETA_COLORS[5] }}
          title={tag.nombre}
        >
          <span className="truncate">{tag.nombre}</span>
          {canEdit && (
            <button
              type="button"
              onClick={() => removeEtiqueta(tag.nombre)}
              disabled={saving}
              className="rounded text-white/80 hover:text-white disabled:opacity-50"
              title="Quitar etiqueta"
            >
              x
            </button>
          )}
        </span>
      ))}

      {canEdit && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`${current.length ? "" : "opacity-70"} rounded border border-dashed border-surface-300 px-1.5 py-0.5 text-[10px] font-medium text-surface-400 transition-colors hover:border-primary-300 hover:text-primary-600`}
          title="Agregar etiqueta"
        >
          + Etiqueta
        </button>
      )}

      {canEdit && editing && (
        <div className="flex items-center gap-1 rounded border border-primary-200 bg-white p-1 shadow-soft">
          <input
            autoFocus
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addEtiqueta();
              }
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder="Etiqueta"
            maxLength={50}
            className={`${compact ? "w-20" : "w-24"} rounded border border-surface-200 px-1.5 py-0.5 text-[10px] text-surface-700 focus:border-primary-400 focus:outline-none`}
          />
          <div className="flex gap-0.5">
            {ETIQUETA_COLORS.slice(0, compact ? 6 : ETIQUETA_COLORS.length).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setColor(item)}
                className={`h-3.5 w-3.5 rounded-full border-2 ${color === item ? "scale-110 border-surface-800" : "border-transparent"}`}
                style={{ backgroundColor: item }}
                title={item}
              />
            ))}
          </div>
          <button type="button" onClick={addEtiqueta} disabled={saving || !texto.trim()} className="px-1 text-[10px] font-semibold text-green-600 hover:text-green-700 disabled:opacity-40">
            OK
          </button>
          <button type="button" onClick={() => setEditing(false)} className="px-1 text-[10px] text-surface-400 hover:text-surface-600">
            x
          </button>
        </div>
      )}

      {!canEdit && current.length === 0 && <span className="text-surface-300">&mdash;</span>}
    </div>
  );
}
