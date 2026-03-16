"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import { useNetworkContext } from "@/contexts/NetworkContext";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MONITORING_PATHS = ["/dashboard/topologia", "/dashboard/switches", "/dashboard/aps", "/dashboard/appliance"];

interface HeaderProps {
  onMenuToggle?: () => void;
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { selectedNetwork, setSelectedNetwork } = useNetworkContext();
  const isMonitoring = MONITORING_PATHS.some((p) => pathname.startsWith(p));

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const closeMenu = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    if (searchRef.current && !searchRef.current.contains(e.target as Node)) setIsOpen(false);
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, [closeMenu]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setIsOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/meraki/networks/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.networks || [];
        // Auto-selección: si hay exactamente 1 resultado, seleccionar directamente
        if (list.length === 1) {
          handleSelectNetwork(list[0]);
          return;
        }
        setResults(list);
        setIsOpen(true);
        setActiveIdx(-1);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!isMonitoring) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search, isMonitoring]);

  function handleSelectNetwork(net: any) {
    setSelectedNetwork(net);
    setQuery("");
    setIsOpen(false);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 h-14 sm:h-16 bg-white/80 backdrop-blur-md border-b border-surface-200 flex items-center justify-between px-3 sm:px-4 md:px-6 gap-2">
      {/* Botón hamburguesa (solo móvil) */}
      <button
        onClick={onMenuToggle}
        className="md:hidden p-2 -ml-1 rounded-lg hover:bg-surface-100 transition-colors text-surface-500 shrink-0"
        aria-label="Abrir menú"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Barra de búsqueda */}
      <div className="relative flex-1 min-w-0 max-w-md" ref={searchRef}>
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => isMonitoring && query.length >= 2 && setIsOpen(true)}
          onKeyDown={(e) => {
            if (!isOpen || !isMonitoring) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter") {
              e.preventDefault();
              if (activeIdx >= 0 && results[activeIdx]) { handleSelectNetwork(results[activeIdx]); }
              else if (results.length === 1) { handleSelectNetwork(results[0]); }
              else if (results.length > 0) { handleSelectNetwork(results[0]); }
            }
            else if (e.key === "Escape") { setIsOpen(false); }
          }}
          placeholder={
            isMonitoring
              ? selectedNetwork ? `Red: ${selectedNetwork.name}` : "Buscar por predio, serial (XXXX-XXXX-XXXX) o MAC..."
              : "Buscar predio, equipo, red..."
          }
          className="w-full pl-10 pr-10 py-2 rounded-xl border border-surface-200 bg-surface-50 text-sm
            focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-colors"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-surface-300 border-t-primary-500 rounded-full animate-spin" />
        )}

        {/* Resultados de búsqueda */}
        {isMonitoring && isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-surface-200 rounded-xl shadow-lg max-h-80 overflow-y-auto z-50">
            {results.length > 0 ? results.map((net, i) => (
              <button
                key={net.id}
                onClick={() => handleSelectNetwork(net)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors border-b border-surface-100 last:border-0 flex justify-between items-center ${
                  i === activeIdx ? "bg-primary-50" : "hover:bg-surface-50"
                }`}
              >
                <span className="font-medium text-surface-800">{net.name}</span>
                {net.orgName && <span className="text-xs text-surface-400">{net.orgName}</span>}
              </button>
            )) : !loading && query.length >= 2 ? (
              <div className="px-4 py-6 text-center text-sm text-surface-400">No se encontraron resultados</div>
            ) : null}
          </div>
        )}

        {/* Badge de red seleccionada */}
        {isMonitoring && selectedNetwork && !query && (
          <button
            onClick={() => setSelectedNetwork(null)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
            title="Limpiar selección"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Notificaciones — dropdown preview */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative p-2 rounded-xl hover:bg-surface-100 transition-colors text-surface-500 hover:text-surface-700"
            aria-label="Notificaciones"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            <span className="absolute top-1 right-1 w-2 h-2 bg-accent-500 rounded-full" />
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-80 bg-white rounded-xl shadow-lg border border-surface-200 py-1 animate-fade-in z-50">
              <div className="px-4 py-3 border-b border-surface-100 flex items-center justify-between">
                <span className="font-semibold text-sm text-surface-800">Notificaciones</span>
                <span className="text-[11px] text-surface-400">Hoy</span>
              </div>
              <div className="max-h-72 overflow-y-auto">
                <div className="px-4 py-3 hover:bg-surface-50 transition-colors border-b border-surface-50 cursor-pointer">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-surface-700 leading-snug">Bienvenido al portal Meraki</p>
                      <p className="text-xs text-surface-400 mt-0.5">Sistema operativo</p>
                    </div>
                  </div>
                </div>
                <div className="px-4 py-8 text-center text-xs text-surface-400">
                  No hay más notificaciones
                </div>
              </div>
              <div className="border-t border-surface-100">
                <Link
                  href="/dashboard/bandeja"
                  onClick={() => setNotifOpen(false)}
                  className="block w-full text-center px-4 py-2.5 text-sm font-medium text-primary-600 hover:bg-surface-50 transition-colors"
                >
                  Ver todas las notificaciones
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Menú de usuario */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-surface-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-sm font-bold">
              U
            </div>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-surface-200 py-1 animate-fade-in">
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2.5 text-sm text-surface-700 hover:bg-surface-50 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
