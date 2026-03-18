"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useSession } from "@/hooks/useSession";
import { usePermisos } from "@/hooks/usePermisos";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles?: ("ADMIN" | "MODERADOR" | "TECNICO")[]; // Si no se define, visible para todos
}

interface NavSection {
  title: string;
  items: NavItem[];
  roles?: ("ADMIN" | "MODERADOR" | "TECNICO")[]; // Si no se define, visible para todos
}

/* ── Íconos inline (SVG compactos) ────────────────────────── */

const icon = (d: string) => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const sections: NavSection[] = [
  {
    title: "Monitoreo Meraki",
    items: [
      { label: "Topología", href: "/dashboard/topologia", icon: icon("M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418") },
      { label: "Switches", href: "/dashboard/switches", icon: icon("M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z") },
      { label: "APs", href: "/dashboard/aps", icon: icon("M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z") },
      { label: "Appliance", href: "/dashboard/appliance", icon: icon("M21.75 17.25v-.228a4.328 4.328 0 00-.745-2.44 6.143 6.143 0 00-4.472-2.659 6.097 6.097 0 00-3.068.413 4.116 4.116 0 00-2.182 2.086c-.312.734-.443 1.538-.375 2.34.116 1.375.746 2.66 1.774 3.614a5.12 5.12 0 003.532 1.414h5.536") },
    ],
  },
  {
    title: "Gestión",
    items: [
      { label: "Tareas", href: "/dashboard/tareas", icon: icon("M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z") },
      { label: "Mapa GPS", href: "/dashboard/predios", icon: icon("M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"), roles: ["ADMIN", "MODERADOR"] },
      { label: "Calendario", href: "/dashboard/calendario", icon: icon("M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5") },
      { label: "Stock", href: "/dashboard/stock", icon: icon("M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z") },
      { label: "Hospedajes", href: "/dashboard/hospedajes", icon: icon("M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25") },
      { label: "Importar", href: "/dashboard/importar", icon: icon("M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"), roles: ["ADMIN", "MODERADOR"] },
    ],
  },
  {
    title: "Comunicación",
    items: [
      { label: "Bandeja", href: "/dashboard/bandeja", icon: icon("M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75") },
      { label: "Actividad", href: "/dashboard/actividad", icon: icon("M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z") },
    ],
  },
  {
    title: "Recursos",
    items: [
      { label: "Instructivo", href: "/dashboard/instructivo", icon: icon("M21 12a9 9 0 11-18 0 9 9 0 0118 0z M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z") },
      { label: "Actas", href: "/dashboard/actas", icon: icon("M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z") },
      { label: "Facturación", href: "/dashboard/facturacion", icon: icon("M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"), roles: ["ADMIN"] },
    ],
  },
  {
    title: "Administración",
    items: [
      { label: "KPIs", href: "/dashboard/kpis", icon: icon("M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"), roles: ["ADMIN", "MODERADOR"] },
      { label: "Usuarios", href: "/dashboard/usuarios", icon: icon("M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z") },
      { label: "Permisos", href: "/dashboard/permisos", icon: icon("M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"), roles: ["ADMIN"] },
    ],
    roles: ["ADMIN", "MODERADOR"],
  },
];

const SHOW_DATETIME_GPS = true;

interface LocationState {
  lat: number | null;
  lng: number | null;
  error: string | null;
  loading: boolean;
  source?: "GPS" | "IP";
}

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { session } = useSession();
  const { puedeVer } = usePermisos();
  const [collapsed, setCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(sections.map((s) => [s.title, true]))
  );
  const [currentDateTime, setCurrentDateTime] = useState<Date | null>(null);
  const [location, setLocation] = useState<LocationState>({
    lat: null, lng: null, error: null, loading: SHOW_DATETIME_GPS,
  });

  // Reloj (solo client-side para evitar hydration mismatch)
  useEffect(() => {
    if (!SHOW_DATETIME_GPS) return;
    setCurrentDateTime(new Date());
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // GPS fallback por IP (HTTPS only)
  const getLocationByIP = useCallback(async (): Promise<boolean> => {
    const apis = [
      { url: "https://ipapi.co/json/", lat: "latitude", lng: "longitude" },
      { url: "https://ipwho.is/", lat: "latitude", lng: "longitude" },
      { url: "https://freeipapi.com/api/json", lat: "latitude", lng: "longitude" },
    ];
    for (const api of apis) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(api.url, { signal: controller.signal });
        clearTimeout(timeout);
        const data = await res.json();
        if (data[api.lat] && data[api.lng]) {
          setLocation({ lat: data[api.lat], lng: data[api.lng], error: null, loading: false, source: "IP" });
          return true;
        }
      } catch { /* intentar siguiente */ }
    }
    return false;
  }, []);

  // GPS con fallback
  useEffect(() => {
    if (!SHOW_DATETIME_GPS) return;
    if (!navigator.geolocation) {
      getLocationByIP().then(ok => { if (!ok) setLocation({ lat: null, lng: null, error: null, loading: false }); });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, error: null, loading: false, source: "GPS" }),
      () => { getLocationByIP().then(ok => { if (!ok) setLocation({ lat: null, lng: null, error: null, loading: false }); }); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }, [getLocationByIP]);

  const retryLocation = () => {
    setLocation({ lat: null, lng: null, error: null, loading: true });
    if (!navigator.geolocation) {
      getLocationByIP().then(ok => { if (!ok) setLocation({ lat: null, lng: null, error: null, loading: false }); });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, error: null, loading: false, source: "GPS" }),
      () => { getLocationByIP().then(ok => { if (!ok) setLocation({ lat: null, lng: null, error: null, loading: false }); }); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const formatDateTime = (date: Date): string =>
    date.toLocaleString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  const userRole = session?.rol as "ADMIN" | "MODERADOR" | "TECNICO" | undefined;

  // Mapeo de ruta a clave de permiso
  const hrefToSeccion = (href: string): string | null => {
    const seg = href.split("/").pop();
    return seg || null;
  };

  // Filtrar secciones y elementos según el rol del usuario + permisos dinámicos
  const filteredSections = sections
    .filter(section => !section.roles || (userRole && section.roles.includes(userRole)))
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        if (item.roles && (!userRole || !item.roles.includes(userRole))) return false;
        const seccion = hrefToSeccion(item.href);
        if (seccion) return puedeVer(seccion);
        return true;
      })
    }))
    .filter(section => section.items.length > 0);

  function toggleSection(title: string) {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));
  }

  // Cerrar sidebar en navegación móvil
  const prevPathname = useRef(pathname);
  useEffect(() => {
    if (prevPathname.current !== pathname && onMobileClose) {
      onMobileClose();
    }
    prevPathname.current = pathname;
  }, [pathname, onMobileClose]);

  return (
    <>
      {/* Backdrop móvil */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={clsx(
          "h-screen flex flex-col bg-surface-900 text-surface-300 border-r border-surface-800 transition-all duration-300 overflow-hidden",
          // Desktop: sticky sidebar
          "hidden md:sticky md:top-0 md:flex",
          collapsed ? "md:w-[68px]" : "md:w-64",
          // Móvil: drawer fijo
          mobileOpen && "!fixed inset-y-0 left-0 z-50 !flex w-64"
        )}
      >
      {/* Header */}
      <div className="flex items-center h-16 px-3 border-b border-surface-800 shrink-0 gap-2">
        <button
          onClick={() => {
            if (mobileOpen && onMobileClose) {
              onMobileClose();
            } else {
              setCollapsed(!collapsed);
            }
          }}
          className="p-1.5 rounded-lg hover:bg-surface-800 transition-colors text-surface-400 hover:text-white shrink-0"
          aria-label={mobileOpen ? "Cerrar menú" : collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {collapsed ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            )}
          </svg>
        </button>
        {!collapsed && (
          <Image src="/images/logo-horizontal.png" alt="Carrot" width={140} height={68} className="object-contain max-h-[38px] w-auto" priority />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 scrollbar-thin">
        {filteredSections.map((section) => (
          <div key={section.title} className="mb-2">
            {/* Section header */}
            {!collapsed && (
              <button
                onClick={() => toggleSection(section.title)}
                className="w-full flex items-center justify-between px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-surface-500 hover:text-surface-300 transition-colors"
              >
                {section.title}
                <svg
                  className={clsx("w-3 h-3 transition-transform", openSections[section.title] && "rotate-180")}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
            )}

            {/* Items */}
            {(collapsed || openSections[section.title]) && (
              <ul className="space-y-0.5 px-2">
                {section.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={clsx(
                          "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                          active
                            ? "bg-primary-600/20 text-primary-400 shadow-sm"
                            : "text-surface-400 hover:bg-surface-800 hover:text-white"
                        )}
                      >
                        <span className={clsx("shrink-0", active && "text-accent-400")}>{item.icon}</span>
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </nav>

      {/* Footer — Reloj + GPS */}
      <div className="border-t border-surface-800 shrink-0 mt-auto">
        {SHOW_DATETIME_GPS ? (
          <div className={clsx("text-center transition-all duration-300", collapsed ? "px-2 py-3" : "px-4 py-3")}>
            {!collapsed ? (
              <>
                <div className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-1">Fecha y Hora</div>
                <div className="text-[13px] font-semibold text-surface-300 font-mono tracking-wide">{currentDateTime ? formatDateTime(currentDateTime) : "\u00A0"}</div>
                <div className="mt-2.5 pt-2.5 border-t border-surface-800">
                  <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    Ubicación
                  </div>
                  <div className="text-[11px] font-semibold font-mono tracking-wide">
                    {location.loading ? (
                      <span className="text-surface-500">Obteniendo...</span>
                    ) : location.lat != null ? (
                      <span className="text-surface-300">{location.lat?.toFixed(7)}, {location.lng?.toFixed(7)}</span>
                    ) : (
                      <button onClick={retryLocation} className="text-surface-500 hover:text-surface-300 transition-colors">Obtener ubicación</button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-[10px] font-semibold text-surface-300 font-mono leading-relaxed" title={`${currentDateTime ? formatDateTime(currentDateTime) : ""}${location.lat ? ` | GPS: ${location.lat.toFixed(4)}, ${location.lng?.toFixed(4)}` : ""}`}>
                <div>{currentDateTime ? currentDateTime.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }) : "\u00A0"}</div>
                <div className="mt-1 flex justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3">
            {!collapsed ? (
              <div className="flex items-center gap-2 text-xs text-surface-500">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Conectado
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
    </>
  );
}
