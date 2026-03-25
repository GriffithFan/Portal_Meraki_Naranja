"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { Command } from "cmdk";

const PAGES = [
  { label: "Topología", href: "/dashboard/topologia", section: "Monitoreo", icon: "🌐" },
  { label: "Switches", href: "/dashboard/switches", section: "Monitoreo", icon: "🔌" },
  { label: "Access Points", href: "/dashboard/aps", section: "Monitoreo", icon: "📡" },
  { label: "Appliance", href: "/dashboard/appliance", section: "Monitoreo", icon: "🛡️" },
  { label: "Tareas", href: "/dashboard/tareas", section: "Gestión", icon: "📋" },
  { label: "Calendario", href: "/dashboard/calendario", section: "Gestión", icon: "📅" },
  { label: "Stock", href: "/dashboard/stock", section: "Gestión", icon: "📦" },
  { label: "Hospedajes", href: "/dashboard/hospedajes", section: "Gestión", icon: "🏠" },
  { label: "Importar", href: "/dashboard/importar", section: "Gestión", icon: "📤" },
  { label: "Mapa GPS", href: "/dashboard/predios", section: "Gestión", icon: "📍" },
  { label: "Bandeja", href: "/dashboard/bandeja", section: "Comunicación", icon: "✉️" },
  { label: "Actividad", href: "/dashboard/actividad", section: "Comunicación", icon: "🕐" },
  { label: "Instructivo", href: "/dashboard/instructivo", section: "Recursos", icon: "📖" },
  { label: "Actas", href: "/dashboard/actas", section: "Recursos", icon: "📄" },
  { label: "KPIs", href: "/dashboard/kpis", section: "Administración", icon: "📊" },
  { label: "Usuarios", href: "/dashboard/usuarios", section: "Administración", icon: "👥" },
  { label: "Permisos", href: "/dashboard/permisos", section: "Administración", icon: "🛡️" },
  { label: "Perfil", href: "/dashboard/perfil", section: "Cuenta", icon: "👤" },
];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setOpen((v) => !v);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  function navigate(href: string) {
    router.push(href);
    setOpen(false);
  }

  if (!open) return null;

  const sections = Array.from(new Set(PAGES.map((p) => p.section)));

  return (
    <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="fixed inset-x-0 top-[15%] mx-auto w-full max-w-lg px-4" onClick={(e) => e.stopPropagation()}>
        <Command className="bg-white dark:bg-surface-800 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-700 overflow-hidden">
          <div className="flex items-center border-b border-surface-200 dark:border-surface-700 px-4">
            <svg className="w-4 h-4 text-surface-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <Command.Input
              autoFocus
              placeholder="Buscar página, acción..."
              className="flex-1 px-3 py-3 text-sm bg-transparent outline-none text-surface-800 dark:text-surface-100 placeholder:text-surface-400"
            />
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-surface-400 bg-surface-100 dark:bg-surface-700 rounded border border-surface-200 dark:border-surface-600">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="text-center py-8 text-sm text-surface-400">
              No se encontraron resultados
            </Command.Empty>
            {sections.map((section) => (
              <Command.Group key={section} heading={section} className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-surface-400 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {PAGES.filter((p) => p.section === section).map((page) => (
                  <Command.Item
                    key={page.href}
                    value={`${page.label} ${page.section}`}
                    onSelect={() => navigate(page.href)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-surface-700 dark:text-surface-200 cursor-pointer data-[selected=true]:bg-primary-50 dark:data-[selected=true]:bg-primary-900/30 data-[selected=true]:text-primary-700 dark:data-[selected=true]:text-primary-300 transition-colors"
                  >
                    <span className="text-base">{page.icon}</span>
                    <span>{page.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
