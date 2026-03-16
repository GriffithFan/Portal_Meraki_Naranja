"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";

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
  estado: { id: string; nombre: string; color: string } | null;
}

export default function PrediosPage() {
  const [predios, setPredios] = useState<PredioMapa[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroEquipo, setFiltroEquipo] = useState("");
  const [filtroProvincia, setFiltroProvincia] = useState("");
  const [search, setSearch] = useState("");

  const [error, setError] = useState<string | null>(null);

  const fetchPredios = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filtroEstado) params.set("estadoId", filtroEstado);
      if (filtroEquipo) params.set("equipo", filtroEquipo);
      if (filtroProvincia) params.set("provincia", filtroProvincia);
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
  }, [filtroEstado, filtroEquipo, filtroProvincia]);

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
    const set = new Set<string>();
    predios.forEach((p) => { if (p.provincia) set.add(p.provincia); });
    return Array.from(set).sort();
  }, [predios]);

  const filtered = useMemo(() => {
    if (!search) return predios;
    const q = search.toLowerCase();
    return predios.filter(
      (p) =>
        p.nombre?.toLowerCase().includes(q) ||
        p.codigo?.toLowerCase().includes(q) ||
        p.direccion?.toLowerCase().includes(q) ||
        p.ciudad?.toLowerCase().includes(q)
    );
  }, [predios, search]);

  return (
    <div className="animate-fade-in-up h-full flex flex-col">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-surface-800 mb-1">Mapa de Predios</h1>
        <p className="text-xs text-surface-400">
          {loading ? "Cargando..." : `${filtered.length} predios con coordenadas GPS`}
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, código, dirección..."
          className="flex-1 min-w-[200px] px-3 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
        />
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="px-2 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
        >
          <option value="">Todos los estados</option>
          {estados.map((e) => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>
        <select
          value={filtroEquipo}
          onChange={(e) => setFiltroEquipo(e.target.value)}
          className="px-2 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
        >
          <option value="">Todos los equipos</option>
          {equipos.map((eq) => (
            <option key={eq} value={eq}>{eq}</option>
          ))}
        </select>
        <select
          value={filtroProvincia}
          onChange={(e) => setFiltroProvincia(e.target.value)}
          className="px-2 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
        >
          <option value="">Todas las provincias</option>
          {provincias.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        {(filtroEstado || filtroEquipo || filtroProvincia || search) && (
          <button
            onClick={() => { setFiltroEstado(""); setFiltroEquipo(""); setFiltroProvincia(""); setSearch(""); }}
            className="px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Mapa */}
      <div className="flex-1 min-h-[500px] bg-white rounded-lg border border-surface-200 overflow-hidden">
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
          <MapView predios={filtered} />
        )}
      </div>
    </div>
  );
}
