"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { useSession } from "@/hooks/useSession";
import Link from "next/link";
import TareaDetalleModal from "@/components/TareaDetalleModal";
import StatusIcon from "@/components/StatusIcon";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Iconos compactos ──────────────────────────────────
const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);

export default function EspacioTareasPage() {
  const params = useParams();
  const espacioId = params.id as string;
  const { isModOrAdmin } = useSession();
  const [selectedTareaId, setSelectedTareaId] = useState<string | null>(null);

  const [espacio, setEspacio] = useState<any>(null);
  const [tareas, setTareas] = useState<any[]>([]);
  const [estados, setEstados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [sortConfig] = useState<{ field: string; dir: "asc" | "desc" } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [tareasRes, estadosRes, espacioRes] = await Promise.all([
      fetch(`/api/tareas?espacioId=${espacioId}&limit=2000`, { credentials: "include" }),
      fetch("/api/estados", { credentials: "include" }),
      fetch(`/api/espacios/${espacioId}`, { credentials: "include" }),
    ]);

    if (tareasRes.ok) {
      const d = await tareasRes.json();
      setTareas(d.predios || []);
    }
    if (estadosRes.ok) {
      const d = await estadosRes.json();
      const est = d.estados || [];
      setEstados(est);
      setExpandedSections(new Set([...est.map((e: any) => e.id), "sin-estado"]));
    }
    if (espacioRes.ok) {
      const d = await espacioRes.json();
      setEspacio(d.espacio);
    }

    setLoading(false);
  }, [espacioId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Agrupar tareas por estado
  const groupedTareas = useMemo(() => {
    const groups: Record<string, any[]> = {};
    const orderedEstados = [...estados].sort((a, b) => a.orden - b.orden);
    for (const estado of orderedEstados) groups[estado.id] = [];
    groups["sin-estado"] = [];

    let filtered = tareas;
    if (search) {
      const s = search.toLowerCase();
      filtered = tareas.filter((t) =>
        t.nombre?.toLowerCase().includes(s) ||
        t.incidencias?.toLowerCase().includes(s) ||
        t.cue?.toLowerCase().includes(s) ||
        t.provincia?.toLowerCase().includes(s) ||
        t.equipoAsignado?.toLowerCase().includes(s)
      );
    }

    if (sortConfig) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortConfig.field] ?? "";
        const bVal = b[sortConfig.field] ?? "";
        const cmp = String(aVal).localeCompare(String(bVal), "es", { numeric: true });
        return sortConfig.dir === "asc" ? cmp : -cmp;
      });
    }

    for (const t of filtered) {
      const eid = t.estadoId || "sin-estado";
      if (groups[eid]) groups[eid].push(t);
      else groups["sin-estado"].push(t);
    }
    return groups;
  }, [tareas, estados, search, sortConfig]);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="animate-fade-in-up space-y-4">
        <div className="h-7 w-52 bg-surface-200 rounded animate-pulse" />
        <div className="h-10 bg-surface-100 rounded animate-pulse" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-white border border-surface-200 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!espacio) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-surface-400 text-sm">
        Espacio no encontrado
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: espacio.color + "20" }}>
            <svg className="w-3 h-3" fill="none" stroke={espacio.color} strokeWidth={1.7} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </div>
          <h1 className="text-lg sm:text-xl font-semibold text-surface-800">{espacio.nombre}</h1>
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full sm:w-48 text-xs border border-surface-200 rounded-md pl-8 pr-3 py-1.5 focus:outline-none focus:border-primary-400"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 mb-5 border-b border-surface-200">
        <Link
          href={`/dashboard/tareas/espacio/${espacio.id}`}
          className="text-xs text-surface-400 hover:text-surface-600 pb-2 px-1 transition-colors"
        >
          Resumen
        </Link>
        <span className="text-xs font-medium text-primary-600 border-b-2 border-primary-600 pb-2 px-1">
          Tareas ({tareas.length})
        </span>
      </div>

      {/* Tareas agrupadas por estado */}
      <div className="space-y-1">
        {Object.entries(groupedTareas).map(([estadoId, items]) => {
          const estado = estados.find((e) => e.id === estadoId);
          const label = estado?.nombre || "Sin estado";
          const color = estado?.color || "#94a3b8";
          const isExpanded = expandedSections.has(estadoId);

          return (
            <div key={estadoId}>
              {/* Group header */}
              <button
                onClick={() => toggleSection(estadoId)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-50 transition-colors"
              >
                <ChevronIcon expanded={isExpanded} />
                <StatusIcon clave={estado?.clave} color={color} size={16} />
                <span className="text-xs font-medium text-surface-700">{label}</span>
                <span className="text-[10px] text-surface-400 ml-1">{items.length}</span>
              </button>

              {/* Items */}
              {isExpanded && items.length > 0 && (
                <div className="md:ml-6 md:border-l-2 md:pl-3 mb-2" style={{ borderColor: color + "40" }}>
                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-surface-100">
                    {items.map((t: any) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTareaId(t.id)}
                        className="w-full text-left px-3 py-3.5 hover:bg-surface-50 active:bg-surface-100 transition-colors"
                      >
                        <p className="text-sm font-medium text-surface-800 truncate">{t.nombre}</p>
                        {t.incidencias && (
                          <p className="text-xs text-surface-400 truncate mt-0.5">{t.incidencias}</p>
                        )}
                        <div className="flex items-center gap-2.5 mt-1.5 text-xs text-surface-500 flex-wrap">
                          {t.equipoAsignado && (
                            <span className="px-1.5 py-0.5 bg-primary-50 text-primary-700 rounded text-[11px] font-medium">{t.equipoAsignado}</span>
                          )}
                          {t.provincia && <span>{t.provincia}</span>}
                          {t.ambito && <span className="text-surface-400">{t.ambito}</span>}
                          {t.fechaDesde && (
                            <span className="tabular-nums text-surface-400">
                              {new Date(t.fechaDesde).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  {/* Desktop table */}
                  <table className="w-full text-xs hidden md:table">
                    <thead>
                      <tr className="text-[10px] text-surface-400 uppercase">
                        <th className="text-left py-1 px-2 font-medium">Predio</th>
                        <th className="text-left py-1 px-2 font-medium">Incidencia</th>
                        <th className="text-left py-1 px-2 font-medium">Equipo</th>
                        <th className="text-left py-1 px-2 font-medium">Provincia</th>
                        <th className="text-left py-1 px-2 font-medium">Ámbito</th>
                        <th className="text-left py-1 px-2 font-medium">DESDE</th>
                        <th className="text-left py-1 px-2 font-medium">HASTA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((t: any) => (
                        <tr
                          key={t.id}
                          onClick={() => setSelectedTareaId(t.id)}
                          className="border-t border-surface-100 hover:bg-surface-50 cursor-pointer transition-colors"
                        >
                          <td className="py-1.5 px-2 text-surface-700 font-medium truncate max-w-[180px]">
                            {t.nombre}
                          </td>
                          <td className="py-1.5 px-2 text-surface-500 truncate max-w-[120px]">
                            {t.incidencias || "—"}
                          </td>
                          <td className="py-1.5 px-2">
                            {t.equipoAsignado ? (
                              <span className="inline-block bg-primary-50 text-primary-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                {t.equipoAsignado}
                              </span>
                            ) : (
                              <span className="text-surface-300">—</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-surface-500 truncate max-w-[100px]">
                            {t.provincia || "—"}
                          </td>
                          <td className="py-1.5 px-2 text-surface-500">
                            {t.ambito || "—"}
                          </td>
                          <td className="py-1.5 px-2 text-surface-400 tabular-nums">
                            {t.fechaDesde ? new Date(t.fechaDesde).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) : "—"}
                          </td>
                          <td className="py-1.5 px-2 text-surface-400 tabular-nums">
                            {t.fechaHasta ? new Date(t.fechaHasta).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {isExpanded && items.length === 0 && (
                <p className="ml-10 text-[10px] text-surface-300 py-1 mb-1">Sin tareas</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal detalle */}
      {selectedTareaId && (
        <TareaDetalleModal
          tareaId={selectedTareaId}
          estados={estados}
          isModOrAdmin={isModOrAdmin}
          onClose={() => setSelectedTareaId(null)}
          onUpdated={fetchData}
        />
      )}
    </div>
  );
}
