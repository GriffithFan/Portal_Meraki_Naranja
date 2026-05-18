"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { Command } from "cmdk";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileText,
  HardDrive,
  HelpCircle,
  Home,
  Import,
  Inbox,
  KeyRound,
  MapPin,
  MessageSquare,
  Network,
  PackageSearch,
  RadioTower,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trophy,
  User,
  Users,
  Wifi,
  Zap,
} from "lucide-react";

type PaletteItem = {
  label: string;
  href: string;
  section: string;
  Icon: LucideIcon;
  keywords?: string;
};

type GlobalResult = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  badge?: string;
  href: string;
};

const PAGES: PaletteItem[] = [
  { label: "Topología", href: "/dashboard/topologia", section: "Monitoreo", Icon: Network, keywords: "red meraki mapa enlaces" },
  { label: "Switches", href: "/dashboard/switches", section: "Monitoreo", Icon: HardDrive, keywords: "puertos cable test meraki" },
  { label: "Access Points", href: "/dashboard/aps", section: "Monitoreo", Icon: Wifi, keywords: "aps access points clientes" },
  { label: "Appliance", href: "/dashboard/appliance", section: "Monitoreo", Icon: ShieldCheck, keywords: "mx appliance wan uplink" },
  { label: "Tareas", href: "/dashboard/tareas", section: "Gestión", Icon: ClipboardList, keywords: "predios espacios clickup" },
  { label: "Ranking", href: "/dashboard/ranking", section: "Gestión", Icon: Trophy, keywords: "tecnicos productividad semana" },
  { label: "Calendario", href: "/dashboard/calendario", section: "Gestión", Icon: CalendarDays, keywords: "agenda vencimientos recordatorios" },
  { label: "Stock", href: "/dashboard/stock", section: "Gestión", Icon: PackageSearch, keywords: "equipos inventario seriales" },
  { label: "Hospedajes", href: "/dashboard/hospedajes", section: "Gestión", Icon: Home, keywords: "hoteles estadias" },
  { label: "Importar", href: "/dashboard/importar", section: "Gestión", Icon: Import, keywords: "excel csv carga masiva" },
  { label: "Mapa GPS", href: "/dashboard/predios", section: "Gestión", Icon: MapPin, keywords: "ubicacion coordenadas predios" },
  { label: "Chat", href: "/dashboard/chat", section: "Comunicación", Icon: MessageSquare, keywords: "mesa ayuda soporte mensajes" },
  { label: "Bandeja", href: "/dashboard/bandeja", section: "Comunicación", Icon: Inbox, keywords: "notificaciones mensajes" },
  { label: "Actividad", href: "/dashboard/actividad", section: "Comunicación", Icon: Activity, keywords: "historial auditoria acciones" },
  { label: "Instructivo", href: "/dashboard/instructivo", section: "Recursos", Icon: BookOpen, keywords: "guias videos ayuda" },
  { label: "Actas", href: "/dashboard/actas", section: "Recursos", Icon: FileText, keywords: "pdf docx documentos" },
  { label: "KPIs", href: "/dashboard/kpis", section: "Administración", Icon: BarChart3, keywords: "indicadores metricas reportes" },
  { label: "Calidad de datos", href: "/dashboard/calidad-datos", section: "Administración", Icon: ShieldCheck, keywords: "validacion datos errores" },
  { label: "Diccionario de campos", href: "/dashboard/diccionario-campos", section: "Administración", Icon: SlidersHorizontal, keywords: "campos columnas configuracion" },
  { label: "Usuarios", href: "/dashboard/usuarios", section: "Administración", Icon: Users, keywords: "accesos cuentas roles" },
  { label: "Permisos", href: "/dashboard/permisos", section: "Administración", Icon: KeyRound, keywords: "roles secciones seguridad" },
  { label: "Perfil", href: "/dashboard/perfil", section: "Cuenta", Icon: User, keywords: "preferencias avatar cuenta" },
];

const ACTIONS: PaletteItem[] = [
  { label: "Abrir mis tareas", href: "/dashboard/mis-tareas", section: "Acciones frecuentes", Icon: Zap, keywords: "pendientes asignadas trabajo" },
  { label: "Responder chats", href: "/dashboard/chat", section: "Acciones frecuentes", Icon: MessageSquare, keywords: "mesa soporte abiertas en curso" },
  { label: "Importar archivo", href: "/dashboard/importar", section: "Acciones frecuentes", Icon: Import, keywords: "excel csv predios stock" },
  { label: "Revisar stock", href: "/dashboard/stock", section: "Acciones frecuentes", Icon: PackageSearch, keywords: "inventario disponible roto instalado" },
  { label: "Buscar red Meraki", href: "/dashboard/topologia", section: "Acciones frecuentes", Icon: RadioTower, keywords: "network serial mac predio" },
  { label: "Ver operación", href: "/dashboard/operacion", section: "Acciones frecuentes", Icon: Activity, keywords: "resumen estado sistema" },
  { label: "Abrir ayuda", href: "/dashboard/instructivo", section: "Acciones frecuentes", Icon: HelpCircle, keywords: "manual guia soporte" },
];

const COMMAND_ITEMS = [...ACTIONS, ...PAGES];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [globalResults, setGlobalResults] = useState<GlobalResult[]>([]);
  const [loadingGlobal, setLoadingGlobal] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setOpen((v) => !v);
    }
  }, []);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pmn-open-command-palette", handleOpen);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pmn-open-command-palette", handleOpen);
    };
  }, [handleKeyDown]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setGlobalResults([]);
      setLoadingGlobal(false);
      return;
    }
    let alive = true;
    setLoadingGlobal(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/busqueda?q=${encodeURIComponent(trimmed)}`, { credentials: "include" })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (!alive) return;
          setGlobalResults(Array.isArray(data?.results) ? data.results : []);
        })
        .catch(() => { if (alive) setGlobalResults([]); })
        .finally(() => { if (alive) setLoadingGlobal(false); });
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  function navigate(href: string) {
    router.push(href);
    window.dispatchEvent(new CustomEvent("pmn-global-result-selected", { detail: { href } }));
    setOpen(false);
  }

  if (!open) return null;

  const sections = Array.from(new Set(COMMAND_ITEMS.map((p) => p.section)));
  const showGlobalResults = query.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="fixed inset-x-0 top-[15%] mx-auto w-full max-w-lg px-4" onClick={(e) => e.stopPropagation()}>
        <Command className="bg-white dark:bg-surface-800 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-700 overflow-hidden">
          <div className="flex items-center border-b border-surface-200 dark:border-surface-700 px-4">
            <Search className="h-4 w-4 shrink-0 text-surface-400" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar página, acción..."
              className="flex-1 px-3 py-3 text-sm bg-transparent outline-none text-surface-800 dark:text-surface-100 placeholder:text-surface-400"
            />
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-surface-400 bg-surface-100 dark:bg-surface-700 rounded border border-surface-200 dark:border-surface-600">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="text-center py-8 text-sm text-surface-400">
              {loadingGlobal ? "Buscando..." : "No se encontraron resultados"}
            </Command.Empty>
            {showGlobalResults && (
              <Command.Group heading="Resultados" className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-surface-400 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {globalResults.map((result) => (
                  <Command.Item
                    key={`${result.type}-${result.id}`}
                    value={`${result.title} ${result.subtitle || ""} ${result.badge || ""} ${result.type}`}
                    onSelect={() => navigate(result.href)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-surface-700 dark:text-surface-200 cursor-pointer data-[selected=true]:bg-primary-50 dark:data-[selected=true]:bg-primary-900/30 data-[selected=true]:text-primary-700 dark:data-[selected=true]:text-primary-300 transition-colors"
                  >
                    <span className="flex h-7 min-w-12 items-center justify-center rounded-lg bg-primary-50 px-2 text-[10px] font-semibold text-primary-600 dark:bg-primary-900/40 dark:text-primary-300">
                      {result.type}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{result.title}</span>
                      {result.subtitle && <span className="block truncate text-[11px] text-surface-400">{result.subtitle}</span>}
                    </span>
                    {result.badge && <span className="hidden max-w-24 truncate rounded-md bg-surface-100 px-2 py-0.5 text-[10px] text-surface-500 sm:inline">{result.badge}</span>}
                  </Command.Item>
                ))}
                {loadingGlobal && globalResults.length === 0 && (
                  <div className="px-3 py-2 text-xs text-surface-400">Buscando en tareas, stock, chats y recursos...</div>
                )}
                {!loadingGlobal && globalResults.length === 0 && (
                  <div className="px-3 py-2 text-xs text-surface-400">Sin resultados globales para esta búsqueda</div>
                )}
              </Command.Group>
            )}
            {sections.map((section) => (
              <Command.Group key={section} heading={section} className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-surface-400 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {COMMAND_ITEMS.filter((p) => p.section === section).map((page) => {
                  const Icon = page.Icon;
                  return (
                  <Command.Item
                    key={page.href}
                    value={`${page.label} ${page.section} ${page.keywords || ""}`}
                    onSelect={() => navigate(page.href)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-surface-700 dark:text-surface-200 cursor-pointer data-[selected=true]:bg-primary-50 dark:data-[selected=true]:bg-primary-900/30 data-[selected=true]:text-primary-700 dark:data-[selected=true]:text-primary-300 transition-colors"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-100 text-surface-500 dark:bg-surface-700 dark:text-surface-300">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{page.label}</span>
                  </Command.Item>
                  );
                })}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
