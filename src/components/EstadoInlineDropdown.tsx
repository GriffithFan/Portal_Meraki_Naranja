"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import StatusIcon from "@/components/StatusIcon";
import { IconCheck } from "@/components/ui/Icons";

export interface EstadoInlineDropdownHandle {
  toggle: (tareaId: string, anchor: HTMLElement) => void;
}

interface Estado {
  id: string;
  clave?: string;
  icono?: string | null;
  color: string;
  nombre: string;
}

interface Tarea {
  id: string;
  estadoId?: string | null;
}

interface EstadoInlineDropdownProps {
  tareas: Tarea[];
  estados: Estado[];
  onChange: (tareaId: string, estadoId: string) => void | Promise<void>;
}

const DROPDOWN_WIDTH = 170;
const DROPDOWN_MAX_HEIGHT = 240;
const MARGIN = 8;

/**
 * Dropdown inline para cambiar el estado de una tarea, posicionado vía
 * coordenadas fijas. Mantiene su propio estado para no forzar un re-render
 * de la tabla (potencialmente grande) que la contiene cada vez que se
 * abre/cierra.
 */
const EstadoInlineDropdown = forwardRef<EstadoInlineDropdownHandle, EstadoInlineDropdownProps>(
  function EstadoInlineDropdown({ tareas, estados, onChange }, ref) {
    const [state, setState] = useState<{ id: string; x: number; y: number } | null>(null);

    useImperativeHandle(ref, () => ({
      toggle: (tareaId, anchor) => {
        setState((prev) => {
          if (prev?.id === tareaId) return null;
          const rect = anchor.getBoundingClientRect();
          let x = rect.left;
          let y = rect.bottom + 4;
          if (x + DROPDOWN_WIDTH > window.innerWidth - MARGIN) {
            x = Math.max(MARGIN, window.innerWidth - DROPDOWN_WIDTH - MARGIN);
          }
          if (y + DROPDOWN_MAX_HEIGHT > window.innerHeight - MARGIN) {
            // No entra abajo: abrir hacia arriba del icono
            y = Math.max(MARGIN, rect.top - DROPDOWN_MAX_HEIGHT - 4);
          }
          return { id: tareaId, x, y };
        });
      },
    }), []);

    useEffect(() => {
      if (!state) return;
      const handler = () => setState(null);
      document.addEventListener("click", handler);
      return () => document.removeEventListener("click", handler);
    }, [state]);

    if (!state) return null;
    const tarea = tareas.find((t) => t.id === state.id);
    if (!tarea) return null;

    return (
      <div
        className="fixed z-[9999] bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-xl py-1 min-w-[170px] animate-fade-in-up"
        style={{ left: state.x, top: state.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-h-56 overflow-y-auto">
          {estados.map((e) => (
            <button
              key={e.id}
              onClick={() => {
                setState(null);
                onChange(tarea.id, e.id);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors text-left"
            >
              <StatusIcon clave={e.clave} icono={e.icono} color={e.color} size={14} />
              <span className="text-surface-700 dark:text-surface-200">{e.nombre}</span>
              {tarea.estadoId === e.id && <IconCheck className="w-3.5 h-3.5 text-surface-500 ml-auto" />}
            </button>
          ))}
        </div>
      </div>
    );
  }
);

export default EstadoInlineDropdown;
