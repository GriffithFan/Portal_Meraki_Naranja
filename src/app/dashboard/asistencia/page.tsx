"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useSession";
import { usePermisos } from "@/hooks/usePermisos";
import { IconClock } from "@/components/ui/Icons";
import clsx from "clsx";

type Estado = "EN_CAMPO" | "FINALIZADO" | "SIN_INICIAR";

interface FilaAsistencia {
  userId: string;
  nombre: string;
  email?: string | null;
  estado: Estado;
  inicio: string | null;
  ultimaSalida: string | null;
  minutosTrabajados: number;
  jornadas: number;
}

interface Resumen {
  enCampo: number;
  finalizado: number;
  sinIniciar: number;
  total: number;
}

const ESTADO_META: Record<Estado, { label: string; badge: string; dot: string; orden: number }> = {
  EN_CAMPO:    { label: "En campo",    badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", orden: 0 },
  FINALIZADO:  { label: "Finalizó",    badge: "bg-blue-50 text-blue-600 border-blue-200",          dot: "bg-blue-400",    orden: 1 },
  SIN_INICIAR: { label: "Sin iniciar", badge: "bg-surface-100 text-surface-500 border-surface-200", dot: "bg-surface-300", orden: 2 },
};

function hoyAR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}

function fmtHora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtDuracion(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export default function AsistenciaPage() {
  const { isModOrAdmin } = useSession();
  const { puedeVer, loading: permisosLoading } = usePermisos();
  const acceso = isModOrAdmin && puedeVer("asistencia");

  const [fecha, setFecha] = useState(() => hoyAR());
  const [filas, setFilas] = useState<FilaAsistencia[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);

  const esHoy = fecha === hoyAR();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/jornadas?fecha=${fecha}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFilas(data.todos || []);
      setResumen(data.resumen || null);
    } catch {
      // id fijo: si el auto-refresco (cada 60s) falla repetido, no se apilan toasts.
      toast.error("No se pudo cargar la asistencia", { id: "asistencia-load-error" });
    } finally {
      setLoading(false);
    }
  }, [fecha]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);

  // Auto-refresco mientras se mira el día actual
  useEffect(() => {
    if (!esHoy) return;
    const t = setInterval(fetchData, 60000);
    return () => clearInterval(t);
  }, [esHoy, fetchData]);

  const filasOrdenadas = [...filas].sort((a, b) => {
    const d = ESTADO_META[a.estado].orden - ESTADO_META[b.estado].orden;
    return d !== 0 ? d : a.nombre.localeCompare(b.nombre);
  });

  // Nombres repetidos: para esos mostramos el email y poder distinguir cuentas.
  const nombreCount = new Map<string, number>();
  for (const f of filas) nombreCount.set(f.nombre.trim().toLowerCase(), (nombreCount.get(f.nombre.trim().toLowerCase()) || 0) + 1);
  const esNombreDuplicado = (nombre: string) => (nombreCount.get(nombre.trim().toLowerCase()) || 0) > 1;

  if (!permisosLoading && !acceso) {
    return (
      <div className="animate-fade-in-up flex items-center justify-center py-20">
        <p className="text-sm text-surface-400">Solo administradores y moderadores pueden ver la asistencia.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 dark:text-surface-100">Asistencia</h1>
          <p className="text-xs text-surface-400 mt-0.5">Quiénes están trabajando en campo {esHoy ? "ahora" : `el ${fecha}`}.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fecha}
            max={hoyAR()}
            onChange={(e) => setFecha(e.target.value || hoyAR())}
            className="px-2.5 py-1.5 border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md text-xs focus:outline-none focus:border-surface-400"
          />
          {!esHoy && (
            <button onClick={() => setFecha(hoyAR())} className="px-2 py-1.5 text-xs text-primary-600 hover:bg-primary-50 dark:hover:bg-surface-700 rounded-md">Hoy</button>
          )}
        </div>
      </div>

      {/* Resumen */}
      {resumen && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          {([
            { label: "En campo", value: resumen.enCampo, cls: "text-emerald-600", dot: "bg-emerald-500" },
            { label: "Finalizaron", value: resumen.finalizado, cls: "text-blue-600", dot: "bg-blue-400" },
            { label: "Sin iniciar", value: resumen.sinIniciar, cls: "text-surface-500", dot: "bg-surface-300" },
            { label: "Total técnicos", value: resumen.total, cls: "text-surface-700 dark:text-surface-200", dot: "bg-surface-400" },
          ]).map((c) => (
            <div key={c.label} className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-surface-400 font-medium mb-1">
                <span className={clsx("w-1.5 h-1.5 rounded-full", c.dot)} />
                {c.label}
              </div>
              <div className={clsx("text-2xl font-bold tabular-nums", c.cls)}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" />
        </div>
      ) : filasOrdenadas.length === 0 ? (
        <div className="text-center py-12 text-surface-400">
          <p className="text-sm">No hay técnicos activos registrados.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 overflow-hidden divide-y divide-surface-100 dark:divide-surface-700/50">
          {filasOrdenadas.map((f) => {
            const meta = ESTADO_META[f.estado];
            return (
              <div key={f.userId} className="flex items-center gap-3 px-4 py-3">
                <div className={clsx("w-9 h-9 rounded-full flex items-center justify-center shrink-0", f.estado === "EN_CAMPO" ? "bg-emerald-100 text-emerald-600" : "bg-surface-100 text-surface-400")}>
                  <IconClock className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-surface-800 dark:text-surface-100 truncate">
                    {f.nombre}
                    {esNombreDuplicado(f.nombre) && f.email && (
                      <span className="ml-1.5 text-[10px] font-normal text-amber-600 dark:text-amber-400">· {f.email}</span>
                    )}
                  </p>
                  <p className="text-[11px] text-surface-400">
                    {f.estado === "EN_CAMPO" && `Ingresó ${fmtHora(f.inicio)}`}
                    {f.estado === "FINALIZADO" && `${fmtHora(f.inicio)} – ${fmtHora(f.ultimaSalida)}${f.jornadas > 1 ? ` · ${f.jornadas} jornadas` : ""}`}
                    {f.estado === "SIN_INICIAR" && "Todavía no marcó ingreso"}
                  </p>
                </div>
                {f.minutosTrabajados > 0 && (
                  <span className="text-xs font-medium text-surface-500 tabular-nums shrink-0">{fmtDuracion(f.minutosTrabajados)}</span>
                )}
                <span className={clsx("px-2 py-0.5 rounded-md text-[10px] font-semibold border inline-flex items-center gap-1 shrink-0", meta.badge)}>
                  <span className={clsx("w-1.5 h-1.5 rounded-full", meta.dot, f.estado === "EN_CAMPO" && "animate-pulse")} />
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
