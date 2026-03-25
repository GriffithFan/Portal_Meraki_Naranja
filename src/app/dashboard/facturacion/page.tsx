"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/hooks/useSession";
import { toast } from "sonner";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ReporteResumenItem {
  tecnicoId: string;
  tecnicoNombre: string;
  cantidad: number;
  tareas: { id: string; nombre: string; codigo: string | null; provincia: string | null }[];
}

interface Reporte {
  id: string;
  semana: string;
  fechaDesde: string;
  fechaHasta: string;
  totalTareas: number;
  resumen: ReporteResumenItem[];
  csvNombre: string | null;
  generadoEn: string;
  generadoPor: { id: string; nombre: string };
  createdAt: string;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function FacturacionPage() {
  const { isAdmin } = useSession();
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchReportes = async () => {
    setLoading(true);
    const res = await fetch("/api/facturacion", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setReportes(data.reportes || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchReportes(); }, []);

  const generarReporte = async () => {
    setGenerating(true);
    const res = await fetch("/api/facturacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success(`Reporte generado: ${data.totalTareas} tareas CONFORME`);
      fetchReportes();
    } else {
      toast.error(data.error || "Error al generar");
    }
    setGenerating(false);
  };

  const descargarCSV = (id: string) => {
    window.open(`/api/facturacion/${id}`, "_blank");
  };

  const eliminar = async (id: string) => {
    toast("¿Eliminar este reporte permanentemente?", {
      action: {
        label: "Eliminar",
        onClick: async () => {
          const res = await fetch(`/api/facturacion/${id}`, { method: "DELETE", credentials: "include" });
          if (res.ok) {
            setReportes((prev) => prev.filter((r) => r.id !== id));
            toast.success("Reporte eliminado");
          }
        },
      },
    });
  };

  if (!isAdmin) {
    return (
      <div className="animate-fade-in-up flex items-center justify-center py-20">
        <p className="text-sm text-surface-400">Acceso restringido a administradores.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 tracking-tight">Facturación</h1>
          <p className="text-surface-400 text-xs mt-0.5">
            Reportes semanales de tareas CONFORME por técnico
          </p>
        </div>
        <button
          onClick={generarReporte}
          disabled={generating}
          className="px-4 py-2 text-xs font-medium rounded-md bg-surface-800 text-white hover:bg-surface-700 transition-colors whitespace-nowrap disabled:opacity-50"
        >
          {generating ? "Generando..." : "Generar reporte semanal"}
        </button>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs text-blue-700">
        <p className="font-medium mb-1">Proceso automático</p>
        <p className="text-blue-600">
          El sistema genera reportes automáticamente cada viernes a las 14:00.
          Los reportes agrupan las tareas pasadas a estado CONFORME durante la semana (lunes a viernes), separadas por técnico asignado.
        </p>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-lg border border-surface-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
            <span className="ml-3 text-xs text-surface-400">Cargando reportes...</span>
          </div>
        ) : reportes.length === 0 ? (
          <p className="text-sm text-surface-400 text-center py-12">
            No hay reportes de facturación aún. Genera uno manualmente o espera al viernes a las 14:00.
          </p>
        ) : (
          <div className="divide-y divide-surface-100">
            {reportes.map((r) => (
              <div key={r.id} className="group">
                {/* Fila principal */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-50 transition-colors"
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                >
                  {/* Expand icon */}
                  <svg
                    className={`w-4 h-4 text-surface-400 transition-transform ${expandedId === r.id ? "rotate-90" : ""}`}
                    fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>

                  {/* Semana */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-surface-800">Semana {r.semana}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        r.generadoEn === "AUTO"
                          ? "bg-blue-50 text-blue-600 border border-blue-200"
                          : "bg-amber-50 text-amber-600 border border-amber-200"
                      }`}>
                        {r.generadoEn === "AUTO" ? "Automático" : "Manual"}
                      </span>
                    </div>
                    <p className="text-[11px] text-surface-400 mt-0.5">
                      {formatDate(r.fechaDesde)} — {formatDate(r.fechaHasta)}
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-4 text-xs">
                    <div className="text-center">
                      <p className="text-lg font-bold text-emerald-600">{r.totalTareas}</p>
                      <p className="text-[10px] text-surface-400">tareas</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-surface-700">{r.resumen.length}</p>
                      <p className="text-[10px] text-surface-400">técnicos</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {r.csvNombre && (
                      <button
                        onClick={() => descargarCSV(r.id)}
                        className="px-2.5 py-1 text-[11px] font-medium text-primary-600 hover:bg-primary-50 rounded transition-colors"
                        title="Descargar CSV"
                      >
                        CSV
                      </button>
                    )}
                    <button
                      onClick={() => eliminar(r.id)}
                      className="px-2 py-1 text-[11px] text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Eliminar reporte"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>

                {/* Detalle expandido */}
                {expandedId === r.id && (
                  <div className="px-4 pb-4 bg-surface-50/50 border-t border-surface-100 animate-fade-in-up">
                    <p className="text-[10px] text-surface-400 mb-2 pt-2">
                      Generado: {formatDateTime(r.createdAt)} por {r.generadoPor.nombre}
                    </p>

                    {/* Mobile stats */}
                    <div className="flex sm:hidden items-center gap-4 mb-3">
                      <span className="text-xs text-surface-600">
                        <span className="font-semibold text-emerald-600">{r.totalTareas}</span> tareas
                      </span>
                      <span className="text-xs text-surface-600">
                        <span className="font-semibold">{r.resumen.length}</span> técnicos
                      </span>
                    </div>

                    {/* Tabla resumen por técnico */}
                    {r.resumen.length > 0 ? (
                      <div className="space-y-2">
                        {r.resumen.map((grupo) => (
                          <div key={grupo.tecnicoId} className="bg-white rounded-md border border-surface-200 p-2.5">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-medium text-surface-800">{grupo.tecnicoNombre}</span>
                              <span className="text-[11px] font-semibold text-emerald-600">{grupo.cantidad} tarea{grupo.cantidad !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="space-y-0.5">
                              {grupo.tareas.map((t) => (
                                <div key={t.id} className="flex items-center gap-2 text-[11px] text-surface-500">
                                  <span className="text-surface-400 font-mono">{t.codigo || "—"}</span>
                                  <span className="truncate">{t.nombre}</span>
                                  {t.provincia && <span className="text-surface-300 hidden sm:inline">{t.provincia}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-surface-400">Sin tareas CONFORME en este período.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
