"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/hooks/useSession";
import { ListSkeleton } from "@/components/ui/Skeletons";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ACCION_COLORS: Record<string, string> = {
  CREAR: "bg-green-500",
  ACTUALIZAR: "bg-blue-500",
  ELIMINAR: "bg-red-500",
  CAMBIO_ESTADO: "bg-yellow-500",
};

const PAGE_SIZE = 50;

export default function ActividadPage() {
  const { isModOrAdmin } = useSession();
  const [actividades, setActividades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filtroEntidad, setFiltroEntidad] = useState("");

  const fetchActividad = useCallback(async (offset = 0, append = false) => {
    if (!append) setLoading(true); else setLoadingMore(true);
    const params = new URLSearchParams();
    if (filtroEntidad) params.set("entidad", filtroEntidad);
    params.set("limite", String(PAGE_SIZE));
    params.set("offset", String(offset));
    const res = await fetch(`/api/actividad?${params}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      const nuevas = data.actividades || [];
      setActividades((prev) => append ? [...prev, ...nuevas] : nuevas);
      setHasMore(nuevas.length >= PAGE_SIZE);
    }
    if (!append) setLoading(false); else setLoadingMore(false);
  }, [filtroEntidad]);

  useEffect(() => { fetchActividad(); }, [fetchActividad]);

  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-surface-800">Actividad</h1>
          <p className="text-xs text-surface-400">
            {isModOrAdmin ? "Registro de todos los cambios del equipo" : "Tu registro de actividad"}
          </p>
        </div>
        <select
          value={filtroEntidad}
          onChange={(e) => setFiltroEntidad(e.target.value)}
          className="px-3 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
        >
          <option value="">Todas las entidades</option>
          <option value="PREDIO">Tareas</option>
          <option value="EQUIPO">Stock</option>
          <option value="ACTA">Actas</option>
          <option value="TAREA">Calendario</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border border-surface-200">
        {loading ? (
          <ListSkeleton items={8} />
        ) : actividades.length === 0 ? (
          <div className="text-center py-16 text-surface-400">
            <svg className="w-10 h-10 mx-auto mb-3 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
            <p className="text-sm font-medium">Sin actividad registrada</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100">
            {actividades.map((a) => (
              <div key={a.id} className="flex items-start gap-3 px-5 py-4 hover:bg-surface-50 transition-colors">
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${ACCION_COLORS[a.accion] || "bg-surface-300"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-surface-800">{a.descripcion || `${a.accion} en ${a.entidad}`}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-surface-400">
                    <span className="font-medium text-surface-600">{a.usuario?.nombre}</span>
                    <span className="px-1.5 py-0.5 bg-surface-100 rounded text-surface-500">{a.entidad}</span>
                    <span>{new Date(a.createdAt).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              </div>
            ))}
            {hasMore && (
              <div className="text-center py-4">
                <button
                  onClick={() => fetchActividad(actividades.length, true)}
                  disabled={loadingMore}
                  className="px-4 py-1.5 text-xs font-medium text-primary-600 hover:bg-surface-50 rounded-md border border-surface-200 disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? "Cargando..." : "Cargar más"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
