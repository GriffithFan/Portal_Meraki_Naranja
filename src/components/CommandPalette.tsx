"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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

type Resultado = {
  tipo: "predio" | "acta" | "usuario" | "instructivo";
  id: string;
  titulo: string;
  subtitulo?: string;
  href: string;
};

const TIPO_META: Record<Resultado["tipo"], { label: string; icon: string }> = {
  predio: { label: "Predios", icon: "📍" },
  acta: { label: "Actas", icon: "📄" },
  usuario: { label: "Usuarios", icon: "👤" },
  instructivo: { label: "Instructivos", icon: "📖" },
};
const ORDEN_TIPOS: Resultado["tipo"][] = ["predio", "acta", "usuario", "instructivo"];

function normaliza(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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

  // Al cerrar, limpiar el estado de búsqueda.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResultados([]);
      setBuscando(false);
    }
  }, [open]);

  // Búsqueda de datos reales (debounced) contra /api/search.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResultados([]);
      setBuscando(false);
      abortRef.current?.abort();
      return;
    }
    setBuscando(true);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { credentials: "include", signal: ctrl.signal });
        if (res.ok) {
          const data = await res.json();
          setResultados(data.resultados || []);
        }
      } catch { /* abortado o error de red: se ignora */ } finally {
        if (!ctrl.signal.aborted) setBuscando(false);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const navigate = useCallback((href: string) => {
    router.push(href);
    setOpen(false);
  }, [router]);

  // Filtrado propio de páginas (cmdk con shouldFilter={false}).
  const paginasFiltradas = useMemo(() => {
    const q = normaliza(query.trim());
    if (!q) return PAGES;
    return PAGES.filter((p) => normaliza(`${p.label} ${p.section}`).includes(q));
  }, [query]);

  const resultadosPorTipo = useMemo(() => {
    const map: Record<string, Resultado[]> = {};
    for (const r of resultados) (map[r.tipo] ||= []).push(r);
    return map;
  }, [resultados]);

  if (!open) return null;

  const sectionsPaginas = Array.from(new Set(paginasFiltradas.map((p) => p.section)));
  const hayQuery = query.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="fixed inset-x-0 top-[15%] mx-auto w-full max-w-lg px-4" onClick={(e) => e.stopPropagation()}>
        <Command shouldFilter={false} className="bg-white dark:bg-surface-800 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-700 overflow-hidden">
          <div className="flex items-center border-b border-surface-200 dark:border-surface-700 px-4">
            <svg className="w-4 h-4 text-surface-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar predio, acta, usuario, instructivo o página..."
              className="flex-1 px-3 py-3 text-sm bg-transparent outline-none text-surface-800 dark:text-surface-100 placeholder:text-surface-400"
            />
            {buscando && (
              <svg className="w-4 h-4 shrink-0 animate-spin text-surface-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            <kbd className="ml-2 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-surface-400 bg-surface-100 dark:bg-surface-700 rounded border border-surface-200 dark:border-surface-600">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-96 overflow-y-auto p-2">
            {hayQuery && !buscando && resultados.length === 0 && paginasFiltradas.length === 0 && (
              <Command.Empty className="text-center py-8 text-sm text-surface-400">
                No se encontraron resultados
              </Command.Empty>
            )}

            {/* Resultados de datos reales, agrupados por tipo */}
            {ORDEN_TIPOS.filter((t) => resultadosPorTipo[t]?.length).map((tipo) => (
              <Command.Group
                key={tipo}
                heading={TIPO_META[tipo].label}
                className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-surface-400 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
              >
                {resultadosPorTipo[tipo].map((r) => (
                  <Command.Item
                    key={`${r.tipo}-${r.id}`}
                    value={`${r.tipo}-${r.id}`}
                    onSelect={() => navigate(r.href)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-surface-700 dark:text-surface-200 cursor-pointer data-[selected=true]:bg-primary-50 dark:data-[selected=true]:bg-primary-900/30 data-[selected=true]:text-primary-700 dark:data-[selected=true]:text-primary-300 transition-colors"
                  >
                    <span className="text-base shrink-0">{TIPO_META[tipo].icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{r.titulo}</span>
                      {r.subtitulo && <span className="block truncate text-[11px] text-surface-400">{r.subtitulo}</span>}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}

            {/* Páginas de navegación */}
            {sectionsPaginas.map((section) => (
              <Command.Group key={section} heading={section} className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-surface-400 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {paginasFiltradas.filter((p) => p.section === section).map((page) => (
                  <Command.Item
                    key={page.href}
                    value={`pagina-${page.href}`}
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
