"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { IconCheck } from "@/components/ui/Icons";

export interface AsignadosInlineEditorHandle {
  toggle: (tareaId: string, anchor: HTMLElement) => void;
}

interface UserLite {
  id: string;
  nombre: string;
  rol?: string;
  email?: string | null;
}

interface AsignacionLite {
  id?: string;
  usuario?: { id: string; nombre: string } | null;
  userId?: string;
}

interface Tarea {
  id: string;
  asignaciones?: AsignacionLite[] | null;
}

interface Props {
  tareas: Tarea[];
  users: UserLite[];
  /** Aplica los asignados elegidos. Debe persistir (PATCH) y actualizar el estado. */
  onSave: (tareaId: string, userIds: string[]) => void | Promise<void>;
}

const WIDTH = 250;
const MAX_HEIGHT = 320;
const MARGIN = 8;

function currentUserIds(tarea: Tarea | undefined): string[] {
  if (!tarea?.asignaciones) return [];
  return tarea.asignaciones
    .map((a) => a.usuario?.id || a.userId)
    .filter((id): id is string => Boolean(id));
}

/**
 * Editor inline de asignados, posicionado vía coordenadas fijas (igual que
 * EstadoInlineDropdown) para no recortarse dentro de celdas con overflow-hidden
 * ni forzar un re-render de la tabla al abrir/cerrar. Multi-select con búsqueda.
 */
const AsignadosInlineEditor = forwardRef<AsignadosInlineEditorHandle, Props>(
  function AsignadosInlineEditor({ tareas, users, onSave }, ref) {
    const [state, setState] = useState<{ id: string; x: number; y: number } | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [query, setQuery] = useState("");
    const [saving, setSaving] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      toggle: (tareaId, anchor) => {
        setState((prev) => {
          if (prev?.id === tareaId) return null;
          const tarea = tareas.find((t) => t.id === tareaId);
          setSelected(new Set(currentUserIds(tarea)));
          setQuery("");
          const rect = anchor.getBoundingClientRect();
          let x = rect.left;
          let y = rect.bottom + 4;
          if (x + WIDTH > window.innerWidth - MARGIN) {
            x = Math.max(MARGIN, window.innerWidth - WIDTH - MARGIN);
          }
          if (y + MAX_HEIGHT > window.innerHeight - MARGIN) {
            y = Math.max(MARGIN, rect.top - MAX_HEIGHT - 4);
          }
          return { id: tareaId, x, y };
        });
      },
    }), [tareas]);

    useEffect(() => {
      if (!state) return;
      // Cerrar SOLO al hacer clic fuera del panel. Antes se cerraba con cualquier
      // click confiando en stopPropagation, que no es confiable y cerraba el editor
      // al elegir un técnico o al tocar Guardar (nunca llegaba a guardar).
      const handler = (e: MouseEvent) => {
        if (panelRef.current?.contains(e.target as Node)) return;
        setState(null);
      };
      document.addEventListener("mousedown", handler);
      const t = setTimeout(() => searchRef.current?.focus(), 30);
      return () => {
        document.removeEventListener("mousedown", handler);
        clearTimeout(t);
      };
    }, [state]);

    // Nombres repetidos: mostrar email para distinguir cuentas.
    const nombreCount = useMemo(() => {
      const map = new Map<string, number>();
      for (const u of users) {
        const key = u.nombre.trim().toLowerCase();
        map.set(key, (map.get(key) || 0) + 1);
      }
      return map;
    }, [users]);

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return users;
      return users.filter(
        (u) => u.nombre.toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q)
      );
    }, [users, query]);

    if (!state) return null;
    const tarea = tareas.find((t) => t.id === state.id);
    if (!tarea) return null;

    const toggleUser = (id: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    const guardar = async () => {
      if (saving) return;
      setSaving(true);
      await onSave(state.id, Array.from(selected));
      setSaving(false);
      setState(null);
    };

    return (
      <div
        ref={panelRef}
        className="fixed z-[9999] flex flex-col bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-xl animate-fade-in-up"
        style={{ left: state.x, top: state.y, width: WIDTH, maxHeight: MAX_HEIGHT }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-2 border-b border-surface-100 dark:border-surface-700">
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setState(null);
            }}
            placeholder="Buscar técnico..."
            className="w-full rounded border border-surface-200 dark:border-surface-600 dark:bg-surface-700 px-2 py-1 text-xs text-surface-700 dark:text-surface-200 focus:border-primary-400 focus:outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-surface-400">Sin resultados</p>
          ) : (
            filtered.map((u) => {
              const checked = selected.has(u.id);
              const dup = (nombreCount.get(u.nombre.trim().toLowerCase()) || 0) > 1;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleUser(u.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors text-left"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked
                        ? "bg-primary-600 border-primary-600 text-white"
                        : "border-surface-300 dark:border-surface-500"
                    }`}
                  >
                    {checked && <IconCheck className="w-3 h-3" />}
                  </span>
                  <span className="truncate text-surface-700 dark:text-surface-200">{u.nombre}</span>
                  {dup && u.email && (
                    <span className="ml-auto truncate text-[10px] text-amber-600 dark:text-amber-400">{u.email}</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-2 border-t border-surface-100 dark:border-surface-700">
          <span className="text-[10px] text-surface-400">{selected.size} seleccionado{selected.size === 1 ? "" : "s"}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setState(null)}
              className="px-2 py-1 text-[11px] text-surface-500 hover:text-surface-700 dark:hover:text-surface-200"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={saving}
              className="px-2.5 py-1 text-[11px] font-semibold rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    );
  }
);

export default AsignadosInlineEditor;
