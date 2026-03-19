"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "@/hooks/useSession";
import { IconSettings } from "@/components/ui/Icons";

interface SectionSettingsProps {
  seccion: string;
  children: React.ReactNode;
}

/**
 * Engranaje de configuración para cada sección.
 * Solo visible para Admin y Moderadores con permiso de edición.
 * El contenido (children) define las opciones de configuración específicas.
 */
export default function SectionSettings({ seccion, children }: SectionSettingsProps) {
  const { isModOrAdmin } = useSession();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  if (!isModOrAdmin) return null;

  // Void usage to suppress warnings
  void seccion;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`p-1.5 rounded-md transition-colors ${
          open ? "bg-surface-200 text-surface-700" : "text-surface-400 hover:bg-surface-100 hover:text-surface-600"
        }`}
        title="Configuración de sección"
      >
        <IconSettings className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-72 bg-white border border-surface-200 rounded-lg shadow-lg z-40 animate-fade-in overflow-hidden">
          <div className="px-3 py-2 border-b border-surface-100 bg-surface-50">
            <p className="text-[11px] font-semibold text-surface-600 uppercase tracking-wider">Configuración</p>
          </div>
          <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
