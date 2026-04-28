"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function OperacionPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/operacion/estado", { credentials: "include" });
      if (!res.ok) throw new Error(res.status === 403 ? "Sin permisos para ver este panel" : "No se pudo cargar el estado operativo");
      setData(await res.json());
    } catch (err: any) {
      setError(err.message || "No se pudo cargar el estado operativo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="animate-fade-in-up space-y-5">
        <div className="h-7 w-56 bg-surface-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, index) => <div key={index} className="h-28 bg-white border border-surface-200 rounded-lg animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[360px] flex flex-col items-center justify-center text-surface-400">
        <p className="text-sm text-red-500">{error || "Sin datos"}</p>
        <button onClick={fetchData} className="mt-3 text-xs text-primary-600 hover:underline">Reintentar</button>
      </div>
    );
  }

  const issues = [
    { label: "Predios sin estado", value: data.predios.sinEstado, href: "/dashboard/tareas" },
    { label: "Predios sin equipo", value: data.predios.sinEquipo, href: "/dashboard/tareas" },
    { label: "Predios sin GPS", value: data.predios.sinGPS, href: "/dashboard/predios" },
    { label: "Predios sin espacio", value: data.predios.sinEspacio, href: "/dashboard/tareas" },
  ];

  return (
    <div className="animate-fade-in-up space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800">Estado operativo</h1>
          <p className="text-xs text-surface-400">Lectura rapida de salud, datos incompletos y actividad reciente</p>
        </div>
        <button onClick={fetchData} className="px-3 py-1.5 text-xs rounded-md border border-surface-200 text-surface-600 hover:bg-surface-50">Actualizar</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat title="Predios" value={data.predios.total} detail={`${data.predios.actualizadosHoy} actualizados hoy`} tone="primary" />
        <Stat title="Stock" value={data.stock.total} detail={`${data.stock.estados.length} estados`} tone="green" />
        <Stat title="Chats activos" value={data.comunicacion.chatsAbiertos + data.comunicacion.chatsEnCurso} detail={`${data.comunicacion.chatsAbiertos} abiertos, ${data.comunicacion.chatsEnCurso} en curso`} tone="blue" />
        <Stat title="Actividad semanal" value={data.operacion.actividadSemana} detail={`${data.operacion.usuariosActivos} usuarios activos`} tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="bg-white border border-surface-200 rounded-lg p-4">
          <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Alertas de consistencia</h2>
          <div className="space-y-2">
            {issues.map((item) => (
              <Link key={item.label} href={item.href} className="flex items-center justify-between rounded-md border border-surface-100 px-3 py-2 hover:bg-surface-50">
                <span className="text-sm text-surface-700">{item.label}</span>
                <span className={`text-sm font-semibold ${item.value > 0 ? "text-amber-600" : "text-emerald-600"}`}>{item.value}</span>
              </Link>
            ))}
            {data.predios.duplicadosCue.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs font-medium text-amber-700 mb-1">CUE duplicados detectados</p>
                <div className="flex flex-wrap gap-1">
                  {data.predios.duplicadosCue.map((item: any) => (
                    <span key={item.cue} className="text-[11px] bg-white border border-amber-200 rounded px-2 py-0.5 text-amber-700">{item.cue}: {item.count}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="bg-white border border-surface-200 rounded-lg p-4">
          <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Backups</h2>
          {data.backups.configured ? (
            <div className="rounded-md border border-surface-100 p-3">
              <p className="text-sm text-surface-700">Backups encontrados: <span className="font-semibold">{data.backups.count}</span></p>
              {data.backups.latest ? (
                <p className="text-xs text-surface-400 mt-1">Ultimo: {data.backups.latest.name} · {formatDate(data.backups.latest.modifiedAt)}</p>
              ) : (
                <p className="text-xs text-amber-600 mt-1">Carpeta encontrada pero sin backups generados.</p>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-700">No hay carpeta de backups local detectada.</p>
              <p className="text-xs text-amber-600 mt-1">Usar scripts/backup-production.sh en el VPS para generar el primer backup manual.</p>
            </div>
          )}

          <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mt-4 mb-2">Stock por estado</h3>
          <div className="space-y-1.5">
            {data.stock.estados.slice(0, 8).map((item: any) => (
              <div key={item.estado} className="flex items-center justify-between text-sm">
                <span className="text-surface-600">{item.estado}</span>
                <span className="font-semibold text-surface-800">{item.cantidad}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="bg-white border border-surface-200 rounded-lg p-4">
        <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Actividad reciente</h2>
        <div className="divide-y divide-surface-100">
          {data.actividadReciente.map((item: any) => (
            <div key={item.id} className="py-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-surface-800">{item.descripcion || `${item.accion} en ${item.entidad}`}</p>
                <p className="text-[11px] text-surface-400">{item.usuario?.nombre} · {item.entidad}</p>
              </div>
              <span className="text-[11px] text-surface-400 shrink-0">{formatDate(item.createdAt)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ title, value, detail, tone }: { title: string; value: number; detail: string; tone: "primary" | "green" | "blue" | "amber" }) {
  const tones = {
    primary: "text-primary-600 bg-primary-50",
    green: "text-emerald-600 bg-emerald-50",
    blue: "text-blue-600 bg-blue-50",
    amber: "text-amber-600 bg-amber-50",
  };
  return (
    <div className="bg-white border border-surface-200 rounded-lg p-4">
      <p className="text-xs text-surface-400 mb-2">{title}</p>
      <div className={`inline-flex rounded-md px-2 py-1 ${tones[tone]}`}>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
      </div>
      <p className="text-xs text-surface-500 mt-2">{detail}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
