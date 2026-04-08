"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useSession } from "@/hooks/useSession";
import { obtenerProvincia } from "@/utils/provinciaUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MapView = dynamic(() => import("@/components/mapa/MapView"), { ssr: false });

interface PredioMapa {
  id: string;
  nombre: string;
  codigo: string;
  direccion: string | null;
  ciudad: string | null;
  provincia: string | null;
  latitud: number;
  longitud: number;
  tipo: string | null;
  equipoAsignado: string | null;
  ambito: string | null;
  nombreInstitucion: string | null;
  espacioId: string | null;
  estado: { id: string; nombre: string; color: string } | null;
}

// Colores de provincia (espejo de MapView)
const PROVINCIA_COLORS: Record<string, string> = {
  "Buenos Aires": "#3b82f6", "Santa Fe": "#f59e0b", "Entre Ríos": "#10b981",
  "Córdoba": "#8b5cf6", "Mendoza": "#ef4444", "Tucumán": "#06b6d4",
  "Salta": "#f97316", "Misiones": "#84cc16", "Chaco": "#ec4899",
  "Corrientes": "#14b8a6", "Santiago del Estero": "#a855f7", "San Juan": "#64748b",
  "Jujuy": "#d946ef", "Río Negro": "#0ea5e9", "Neuquén": "#22c55e",
  "Formosa": "#eab308", "Chubut": "#6366f1", "San Luis": "#f43f5e",
  "Catamarca": "#2dd4bf", "La Rioja": "#fb923c", "La Pampa": "#a3e635",
  "Santa Cruz": "#38bdf8", "Tierra del Fuego": "#c084fc", "CABA": "#818cf8",
  "SGO. DEL ESTERO": "#a855f7", "Demo": "#94a3b8",
};
const PROVINCIA_COLOR_MAP = new Map(
  Object.entries(PROVINCIA_COLORS).map(([k, v]) => [k.toUpperCase(), v])
);
function getProvColor(nombre: string): string {
  return PROVINCIA_COLOR_MAP.get(nombre.toUpperCase()) || "#94a3b8";
}

export default function PrediosPage() {
  const { session, isModOrAdmin } = useSession();
  const isTecnico = session?.rol === "TECNICO";
  const [predios, setPredios] = useState<PredioMapa[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroEquipo, setFiltroEquipo] = useState("");
  const [filtroProvincia, setFiltroProvincia] = useState("");
  const [search, setSearch] = useState("");
  const [colorBy, setColorBy] = useState<"provincia" | "estado" | "tecnico">("provincia");
  // Initialize colorBy based on role once session loads
  const [roleInitialized, setRoleInitialized] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Set initial colorBy and filter based on role
  useEffect(() => {
    if (!session || roleInitialized) return;
    if (isTecnico) {
      setColorBy("estado");
      setFiltroEquipo(session.nombre);
    } else if (isModOrAdmin) {
      setColorBy("tecnico");
    }
    setRoleInitialized(true);
  }, [session, isTecnico, isModOrAdmin, roleInitialized]);

  // For admin/mod: when filtering by specific tech, switch to estado view
  // When clearing tech filter, revert to tecnico view
  useEffect(() => {
    if (isTecnico || !roleInitialized) return;
    if (filtroEquipo) {
      setColorBy("estado");
    } else {
      setColorBy("tecnico");
    }
  }, [filtroEquipo, isTecnico, roleInitialized]);

  const fetchPredios = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filtroEstado) params.set("estadoId", filtroEstado);
      if (filtroEquipo) params.set("equipo", filtroEquipo);
      const res = await fetch(`/api/dashboard/mapa?${params}`, { credentials: "include" });
      if (res.ok) {
        setPredios(await res.json());
      } else if (res.status === 403) {
        setError("No tenés permisos para ver el mapa. Se requiere rol Moderador o Admin.");
      } else {
        setError("Error al cargar los predios");
      }
    } catch {
      setError("Error de conexión al cargar los predios");
    } finally {
      setLoading(false);
    }
  }, [filtroEstado, filtroEquipo]);

  useEffect(() => { fetchPredios(); }, [fetchPredios]);

  const estados = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; color: string }>();
    predios.forEach((p) => { if (p.estado) map.set(p.estado.id, p.estado); });
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [predios]);

  const equipos = useMemo(() => {
    const set = new Set<string>();
    predios.forEach((p) => { if (p.equipoAsignado) set.add(p.equipoAsignado); });
    return Array.from(set).sort();
  }, [predios]);

  const provincias = useMemo(() => {
    const map = new Map<string, number>();
    predios.forEach((p) => {
      const prov = obtenerProvincia(p.provincia, p.codigo) || "Sin provincia";
      map.set(prov, (map.get(prov) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([nombre, count]) => ({ nombre, count }));
  }, [predios]);

  // Colors for tecnico mode (mirrors MapView's TECNICO_COLORS)
  const TECNICO_COLORS_LEGEND = [
    "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
    "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#14b8a6",
    "#6366f1", "#d946ef", "#0ea5e9", "#f43f5e", "#eab308",
  ];

  const tecnicosList = useMemo(() => {
    const map = new Map<string, number>();
    predios.forEach((p) => {
      const eq = p.equipoAsignado || "Sin asignar";
      map.set(eq, (map.get(eq) || 0) + 1);
    });
    const sorted = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([nombre, count]) => ({ nombre, count }));
    // Build color map mirroring MapView
    const colorMap: Record<string, string> = {};
    const tecNames = Array.from(new Set(predios.map(p => p.equipoAsignado).filter(Boolean) as string[])).sort();
    tecNames.forEach((t, i) => { colorMap[t] = TECNICO_COLORS_LEGEND[i % TECNICO_COLORS_LEGEND.length]; });
    return sorted.map(s => ({ ...s, color: colorMap[s.nombre] || "#94a3b8" }));
  }, [predios]);

  const filtered = useMemo(() => {
    let result = predios;
    if (filtroProvincia) {
      result = result.filter(p => obtenerProvincia(p.provincia, p.codigo) === filtroProvincia);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.nombre?.toLowerCase().includes(q) ||
          p.codigo?.toLowerCase().includes(q) ||
          p.direccion?.toLowerCase().includes(q) ||
          p.ciudad?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [predios, search, filtroProvincia]);

  return (
    <div className="animate-fade-in-up flex flex-col overflow-hidden" style={{ height: "calc(100vh - 120px)" }}>
      <div className="mb-2 sm:mb-3">
        <h1 className="text-lg sm:text-xl font-semibold text-surface-800 mb-0.5">Mapa de Predios</h1>
        <p className="text-[11px] sm:text-xs text-surface-400">
          {loading ? "Cargando..." : `${filtered.length} predios con coordenadas GPS`}
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, código, dirección..."
          className="w-full sm:flex-1 sm:min-w-[200px] px-3 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
        />
        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin">
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="min-w-0 flex-1 sm:flex-none px-2 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
          >
            <option value="">Todos los estados</option>
            {estados.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
          <select
            value={filtroEquipo}
            onChange={(e) => setFiltroEquipo(e.target.value)}
            className="min-w-0 flex-1 sm:flex-none px-2 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
          >
            <option value="">Todos los equipos</option>
            {equipos.map((eq) => (
              <option key={eq} value={eq}>{eq}</option>
            ))}
          </select>
          <select
            value={filtroProvincia}
            onChange={(e) => setFiltroProvincia(e.target.value)}
            className="min-w-0 flex-1 sm:flex-none px-2 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
          >
            <option value="">Todas las provincias</option>
            {provincias.map((p) => (
              <option key={p.nombre} value={p.nombre === "Sin provincia" ? "" : p.nombre}>
                {p.nombre} ({p.count})
              </option>
            ))}
          </select>
        </div>

        {/* Toggle color por provincia/estado/tecnico */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center bg-surface-100 rounded-md p-0.5 text-xs">
            <button
              onClick={() => setColorBy("provincia")}
              className={`px-2.5 py-1 rounded transition-colors ${colorBy === "provincia" ? "bg-white text-surface-800 shadow-sm font-medium" : "text-surface-500 hover:text-surface-700"}`}
            >
              Provincia
            </button>
            <button
              onClick={() => setColorBy("estado")}
              className={`px-2.5 py-1 rounded transition-colors ${colorBy === "estado" ? "bg-white text-surface-800 shadow-sm font-medium" : "text-surface-500 hover:text-surface-700"}`}
            >
              Estado
            </button>
            {isModOrAdmin && (
              <button
                onClick={() => setColorBy("tecnico")}
                className={`px-2.5 py-1 rounded transition-colors ${colorBy === "tecnico" ? "bg-white text-surface-800 shadow-sm font-medium" : "text-surface-500 hover:text-surface-700"}`}
              >
                Técnico
              </button>
            )}
          </div>

          {/* Limpiar filtros */}
          {(filtroEstado || filtroEquipo || filtroProvincia || search) && (
            <button
              onClick={() => { setFiltroEstado(""); setFiltroEquipo(""); setFiltroProvincia(""); setSearch(""); }}
              className="px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-md transition-colors whitespace-nowrap"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Mapa + Leyenda */}
      <div className="flex-1 flex flex-col md:flex-row gap-2 sm:gap-3 min-h-0 overflow-hidden">
        {/* Mapa */}
        <div className="flex-1 bg-white rounded-lg border border-surface-200 overflow-hidden relative isolate min-h-[250px]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-sm text-surface-400 animate-pulse">Cargando mapa...</div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-surface-400">
              <svg className="w-12 h-12 mb-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
              <p className="text-sm text-red-500">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-surface-400">
              <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <p className="text-sm">No hay predios con coordenadas GPS</p>
              <p className="text-xs mt-1">Importa predios con latitud y longitud desde la sección Importar</p>
            </div>
          ) : (
            <MapView predios={filtered} colorBy={colorBy} />
          )}
        </div>

        {/* Leyenda lateral - colapsable en mobile */}
        {!loading && filtered.length > 0 && (
          <div className="md:w-44 shrink-0 bg-white rounded-lg border border-surface-200 overflow-hidden flex flex-col max-h-[140px] md:max-h-none">
            <h3 className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider px-3 pt-2 pb-1 shrink-0">
              {colorBy === "provincia" ? "Provincias" : colorBy === "tecnico" ? "Técnicos" : "Estados"}
            </h3>
            <div className="flex-1 overflow-y-auto px-3 pb-2 scrollbar-thin">
              <div className="flex flex-row flex-wrap md:flex-col gap-0.5">
                {colorBy === "provincia" ? (
                  provincias.map(({ nombre, count }) => (
                    <button
                      key={nombre}
                      onClick={() => setFiltroProvincia(nombre === "Sin provincia" ? "" : nombre)}
                      className={`flex items-center gap-1.5 md:gap-2 md:w-full text-left px-1.5 py-1 rounded text-xs hover:bg-surface-50 transition-colors whitespace-nowrap ${filtroProvincia === nombre ? "bg-surface-100 font-medium" : ""}`}
                    >
                      <span
                        className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full shrink-0"
                        style={{ background: getProvColor(nombre) }}
                      />
                      <span className="truncate">{nombre}</span>
                      <span className="text-[10px] text-surface-400">{count}</span>
                    </button>
                  ))
                ) : colorBy === "tecnico" ? (
                  tecnicosList.map(({ nombre, count, color }) => (
                    <button
                      key={nombre}
                      onClick={() => setFiltroEquipo(nombre === "Sin asignar" ? "" : nombre)}
                      className={`flex items-center gap-1.5 md:gap-2 md:w-full text-left px-1.5 py-1 rounded text-xs hover:bg-surface-50 transition-colors whitespace-nowrap ${filtroEquipo === nombre ? "bg-surface-100 font-medium" : ""}`}
                    >
                      <span
                        className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full shrink-0"
                        style={{ background: color }}
                      />
                      <span className="truncate">{nombre}</span>
                      <span className="text-[10px] text-surface-400">{count}</span>
                    </button>
                  ))
                ) : (
                  estados.map((e) => {
                    const count = filtered.filter(p => p.estado?.id === e.id).length;
                    return (
                      <button
                        key={e.id}
                        onClick={() => setFiltroEstado(e.id)}
                        className={`flex items-center gap-1.5 md:gap-2 md:w-full text-left px-1.5 py-1 rounded text-xs hover:bg-surface-50 transition-colors whitespace-nowrap ${filtroEstado === e.id ? "bg-surface-100 font-medium" : ""}`}
                      >
                        <span
                          className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full shrink-0"
                          style={{ background: e.color }}
                        />
                        <span className="truncate">{e.nombre}</span>
                        <span className="text-[10px] text-surface-400">{count}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
