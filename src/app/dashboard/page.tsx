"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface OverviewData {
  rol: string;
  nombre: string;
  meraki: {
    totalDevices: number;
    statusCounts: { online: number; offline: number; alerting: number; dormant: number };
    switches: { total: number; online: number };
    aps: { total: number; online: number };
    appliances: { total: number; online: number };
    networkCount: number;
  } | null;
  prediosTotal: number;
  prediosConRed: number;
  tareasHoy: number;
  tareasPendientes: number;
  actividadReciente: {
    id: string;
    accion: string;
    descripcion: string | null;
    entidad: string;
    createdAt: string;
    usuario: { nombre: string; rol: string };
  }[];
  notificacionesSinLeer: number;
  // Admin/Mod only
  usuariosActivos?: number;
  equiposStock?: number;
  equiposAsignados?: number;
  // Técnico only
  misTareasPendientes?: number;
}

export default function DashboardPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/overview", { credentials: "include" });
      if (!res.ok) throw new Error("Error cargando datos");
      const json = await res.json();
      setData(json);
    } catch {
      setError("No se pudo cargar el resumen");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  if (loading) {
    return (
      <div className="animate-fade-in-up">
        <div className="h-7 w-48 bg-surface-200 rounded animate-pulse mb-1" />
        <div className="h-4 w-64 bg-surface-100 rounded animate-pulse mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-surface-200 p-5 h-[106px] animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-lg border border-surface-200 p-6 h-[300px] animate-pulse" />
          <div className="bg-white rounded-lg border border-surface-200 p-6 h-[300px] animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="animate-fade-in-up flex flex-col items-center justify-center min-h-[400px] text-surface-400">
        <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <p className="text-sm">{error}</p>
        <button onClick={() => { setLoading(true); setError(null); fetchOverview(); }}
          className="mt-3 text-xs text-primary-600 hover:underline">
          Reintentar
        </button>
      </div>
    );
  }

  const isAdminOrMod = data.rol === "ADMIN" || data.rol === "MODERADOR";
  const m = data.meraki;
  const greeting = getGreeting();

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-surface-800 mb-0.5">
          {greeting}, {data.nombre.split(" ")[0]}
        </h1>
        <p className="text-xs text-surface-400">
          Resumen general del sistema · <span className="capitalize">{data.rol.toLowerCase()}</span>
        </p>
      </div>

      {/* ── Tarjetas principales ─────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard
          title="Predios"
          value={String(data.prediosTotal)}
          subtitle={`${data.prediosConRed} con red Meraki`}
          icon="M2.25 21h19.5M3.75 3v18m16.5-18v18M5.25 3h13.5"
          color="primary"
          href="/dashboard/predios"
        />
        <StatCard
          title="Switches"
          value={m ? `${m.switches.online}/${m.switches.total}` : "—"}
          subtitle={m ? `${m.switches.total - m.switches.online} offline` : "Sin datos Meraki"}
          icon="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6"
          color="green"
          href="/dashboard/switches"
        />
        <StatCard
          title="Access Points"
          value={m ? `${m.aps.online}/${m.aps.total}` : "—"}
          subtitle={m ? `${m.aps.total - m.aps.online} offline` : "Sin datos Meraki"}
          icon="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0"
          color="accent"
          href="/dashboard/aps"
        />
        <StatCard
          title="Alertas"
          value={m ? String(m.statusCounts.alerting) : "—"}
          subtitle={m ? `${m.statusCounts.offline} dispositivos offline` : "Sin datos Meraki"}
          icon="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"
          color={m && m.statusCounts.alerting > 0 ? "red" : "muted"}
          href="/dashboard/topologia"
        />
      </div>

      {/* ── Grilla de info contextual ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        {/* Estado de dispositivos (donut visual) */}
        {m && (
          <div className="bg-white rounded-lg border border-surface-200 p-5">
            <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-4">
              Estado de dispositivos
            </h3>
            <div className="space-y-3">
              <DeviceBar label="Online" count={m.statusCounts.online} total={m.totalDevices} color="bg-emerald-500" />
              <DeviceBar label="Offline" count={m.statusCounts.offline} total={m.totalDevices} color="bg-red-400" />
              <DeviceBar label="En alerta" count={m.statusCounts.alerting} total={m.totalDevices} color="bg-amber-400" />
              <DeviceBar label="Dormant" count={m.statusCounts.dormant} total={m.totalDevices} color="bg-surface-300" />
            </div>
            <div className="mt-4 pt-3 border-t border-surface-100 flex items-center justify-between text-xs text-surface-400">
              <span>{m.totalDevices} dispositivos · {m.networkCount} redes</span>
              <Link href="/dashboard/topologia" className="text-primary-600 hover:underline">Ver todo</Link>
            </div>
          </div>
        )}

        {/* Tareas y gestión */}
        <div className="bg-white rounded-lg border border-surface-200 p-5">
          <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-4">
            Tareas
          </h3>
          <div className="space-y-3">
            <InfoRow label="Tareas para hoy" value={data.tareasHoy} highlight={data.tareasHoy > 0} />
            <InfoRow
              label={isAdminOrMod ? "Pendientes (total)" : "Mis pendientes"}
              value={isAdminOrMod ? data.tareasPendientes : (data.misTareasPendientes ?? data.tareasPendientes)}
            />
            <InfoRow label="Notificaciones sin leer" value={data.notificacionesSinLeer} highlight={data.notificacionesSinLeer > 0} />
          </div>
          <div className="mt-4 pt-3 border-t border-surface-100">
            <Link href="/dashboard/tareas" className="text-xs text-primary-600 hover:underline">
              Ir a tareas →
            </Link>
          </div>
        </div>

        {/* Panel admin: usuarios y stock / Panel técnico: appliance */}
        {isAdminOrMod ? (
          <div className="bg-white rounded-lg border border-surface-200 p-5">
            <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-4">
              Administración
            </h3>
            <div className="space-y-3">
              <InfoRow label="Usuarios activos" value={data.usuariosActivos ?? 0} />
              <InfoRow label="Equipos disponibles" value={data.equiposStock ?? 0} />
              <InfoRow label="Equipos asignados" value={data.equiposAsignados ?? 0} />
              {m && <InfoRow label="Appliances" value={`${m.appliances.online}/${m.appliances.total}`} />}
            </div>
            <div className="mt-4 pt-3 border-t border-surface-100 flex gap-3">
              <Link href="/dashboard/usuarios" className="text-xs text-primary-600 hover:underline">Usuarios</Link>
              <Link href="/dashboard/stock" className="text-xs text-primary-600 hover:underline">Stock</Link>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-surface-200 p-5">
            <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-4">
              Appliance
            </h3>
            <div className="space-y-3">
              {m ? (
                <>
                  <InfoRow label="Online" value={m.appliances.online} />
                  <InfoRow label="Total" value={m.appliances.total} />
                  <InfoRow label="Redes monitoreadas" value={m.networkCount} />
                </>
              ) : (
                <p className="text-xs text-surface-400">Sin datos Meraki</p>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-surface-100">
              <Link href="/dashboard/appliance" className="text-xs text-primary-600 hover:underline">
                Ver appliance →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ── Actividad reciente ───────────────────────────── */}
      <div className="bg-white rounded-lg border border-surface-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider">
            Actividad reciente
          </h3>
          <Link href="/dashboard/actividad" className="text-xs text-primary-600 hover:underline">
            Ver toda
          </Link>
        </div>
        {data.actividadReciente.length === 0 ? (
          <p className="text-sm text-surface-400 py-4 text-center">Sin actividad registrada</p>
        ) : (
          <div className="divide-y divide-surface-100">
            {data.actividadReciente.map((a) => (
              <div key={a.id} className="py-2.5 flex items-start gap-3 first:pt-0 last:pb-0">
                <div className="w-7 h-7 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center text-[10px] font-medium shrink-0 mt-0.5">
                  {a.usuario.nombre.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-surface-700 truncate">
                    <span className="font-medium">{a.usuario.nombre}</span>
                    {" "}
                    <span className="text-surface-500">{a.accion}</span>
                    {a.descripcion && (
                      <span className="text-surface-400"> · {a.descripcion}</span>
                    )}
                  </p>
                  <p className="text-[10px] text-surface-400 mt-0.5">
                    {formatTimeAgo(a.createdAt)} · {a.entidad}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Componentes auxiliares ───────────────────────────── */

function StatCard({
  title,
  value,
  subtitle,
  icon,
  color,
  href,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: string;
  color: "primary" | "accent" | "green" | "red" | "muted";
  href?: string;
}) {
  const colorMap = {
    primary: "bg-primary-50 text-primary-600",
    accent: "bg-accent-50 text-accent-600",
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
    muted: "bg-surface-100 text-surface-500",
  };

  const card = (
    <div className="bg-white rounded-lg border border-surface-200 p-5 hover:border-surface-300 transition-colors group">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-8 h-8 rounded-md flex items-center justify-center ${colorMap[color]}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
        <span className="text-xs text-surface-500">{title}</span>
      </div>
      <p className="text-2xl font-bold text-surface-800">{value}</p>
      {subtitle && <p className="text-[10px] text-surface-400 mt-1">{subtitle}</p>}
    </div>
  );

  if (href) {
    return <Link href={href}>{card}</Link>;
  }
  return card;
}

function DeviceBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-surface-600">{label}</span>
        <span className="text-surface-500 font-medium">{count}</span>
      </div>
      <div className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-surface-500">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? "text-accent-600" : "text-surface-800"}`}>
        {value}
      </span>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}
