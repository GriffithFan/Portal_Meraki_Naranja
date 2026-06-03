"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, Save, Trash2 } from "lucide-react";

type SavedViewsBarProps<TView extends { id: string; name: string }> = {
  title?: string;
  emptyText?: string;
  activeView: TView | null;
  views: TView[];
  saving: boolean;
  newViewName: string;
  onNewViewNameChange: (value: string) => void;
  onSave: () => void;
  onUpdate: () => void;
  onApply: (view: TView) => void;
  onDelete: (id: string) => void;
  getSummary: (view: TView) => string;
};

export default function SavedViewsBar<TView extends { id: string; name: string }>({
  title = "Vistas guardadas",
  emptyText = "Guarda filtros, orden y columnas para reutilizarlos",
  activeView,
  views,
  saving,
  newViewName,
  onNewViewNameChange,
  onSave,
  onUpdate,
  onApply,
  onDelete,
  getSummary,
}: SavedViewsBarProps<TView>) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="mb-3 flex flex-col gap-2 rounded-xl border border-surface-200 bg-white px-3 py-2 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
          <Bookmark className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-surface-700">{title}</p>
          <p className="truncate text-[11px] text-surface-400">
            {activeView
              ? `Activa: ${activeView.name}`
              : views.length > 0
                ? `${views.length} vista${views.length === 1 ? "" : "s"} disponible${views.length === 1 ? "" : "s"}`
                : emptyText}
          </p>
        </div>
      </div>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-surface-200 px-3 py-2 text-xs font-medium text-surface-600 transition hover:bg-surface-50 sm:w-auto"
        >
          <Bookmark className="h-3.5 w-3.5" />
          Gestionar vistas
        </button>
        {open && (
          <div className="fixed inset-x-3 top-28 z-50 overflow-hidden rounded-xl border border-surface-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
            <div className="border-b border-surface-100 p-3">
              <p className="text-xs font-semibold text-surface-700">Guardar vista actual</p>
              <div className="mt-2 flex gap-2">
                <input
                  value={newViewName}
                  onChange={(event) => onNewViewNameChange(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") onSave(); }}
                  placeholder="Ej: Vencidas THNET, Provincia, LAC-R..."
                  className="min-w-0 flex-1 rounded-lg border border-surface-200 px-2 py-1.5 text-xs outline-none focus:border-primary-400"
                  maxLength={60}
                />
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  Guardar
                </button>
              </div>
              {activeView && (
                <button
                  type="button"
                  onClick={onUpdate}
                  disabled={saving}
                  className="mt-2 text-[11px] font-medium text-primary-600 transition hover:text-primary-700 disabled:opacity-50"
                >
                  Actualizar vista {activeView.name} con filtros actuales
                </button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {views.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-surface-400">Todavia no hay vistas guardadas</p>
              ) : views.map((view) => (
                <div key={view.id} className="group/view flex items-center gap-2 rounded-lg px-2 py-2 transition hover:bg-surface-50">
                  <button type="button" onClick={() => { onApply(view); setOpen(false); }} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-xs font-semibold text-surface-700">{view.name}</p>
                    <p className="truncate text-[10px] text-surface-400">{getSummary(view)}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(view.id)}
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
  );
}
