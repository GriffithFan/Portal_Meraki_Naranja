"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface KPIData {
  predios: {
    total: number;
    conRed: number;
    conGPS: number;
    conformes: number;
    progreso: number;
    byEstado: { nombre: string; color: string; count: number }[];
    byEquipo: { nombre: string; count: number }[];
    byProvincia: { nombre: string; count: number }[];
    byAmbito: { nombre: string; count: number }[];
  };
  tareas: {
    pendientes: number;
    hoy: number;
    completadasSemana: number;
    completadasMes: number;
  };
  equipos: {
    disponibles: number;
    asignados: number;
    rotos: number;
  };
  operacion: {
    usuariosActivos: number;
    actividadSemana: number;
    notificacionesPendientes: number;
  };
}

const EQUIPO_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
];

export default function KPIsPage() {
  const [data, setData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/kpis", { credentials: "include" });
      if (res.ok) {
        setData(await res.json());
      } else if (res.status === 403) {
        setError("No tenés permisos para ver los KPIs. Se requiere rol Moderador o Admin.");
      } else {
        setError("Error al cargar los KPIs");
      }
    } catch {
      setError("Error de conexión al cargar los KPIs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="animate-fade-in-up space-y-6">
        <div className="h-7 w-56 bg-surface-200 rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-surface-200 h-24 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-lg border border-surface-200 h-80 animate-pulse" />
          <div className="bg-white rounded-lg border border-surface-200 h-80 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-sm text-surface-400">
        <svg className="w-12 h-12 mb-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
        </svg>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-surface-400">
        No se pudieron cargar los KPIs
      </div>
    );
  }

  const { predios, tareas, equipos, operacion } = data;
  const equipoData = predios.byEquipo.filter((e) => e.nombre !== "Sin asignar").slice(0, 10);

  return (
    <div className="animate-fade-in-up">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-surface-800 mb-1">Dashboard Ejecutivo</h1>
        <p className="text-xs text-surface-400">KPIs y métricas clave del proyecto</p>
      </div>

      {/* ── Progreso general ─────────────────────────── */}
      <div className="bg-white rounded-lg border border-surface-200 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider">Progreso general del cronograma</h3>
          <span className="text-2xl font-bold text-primary-600">{predios.progreso}%</span>
        </div>
        <div className="w-full bg-surface-100 rounded-full h-3">
          <div
            className="h-3 rounded-full transition-all duration-500"
            style={{
              width: `${predios.progreso}%`,
              background: predios.progreso >= 80 ? "#22c55e" : predios.progreso >= 50 ? "#eab308" : "#6366f1",
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-[10px] text-surface-400">
          <span>{predios.conformes} predios conformes</span>
          <span>{predios.total} total</span>
        </div>
      </div>

      {/* ── KPI Cards row 1: Predios ─────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard label="Total Predios" value={predios.total} icon="M2.25 21h19.5M3.75 3v18m16.5-18v18" color="primary" />
        <KPICard label="Con Red Meraki" value={predios.conRed} icon="M12 21a9.004 9.004 0 008.716-6.747" color="accent"
          subtitle={predios.total > 0 ? `${Math.round((predios.conRed / predios.total) * 100)}%` : undefined} />
        <KPICard label="Con GPS" value={predios.conGPS} icon="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" color="green"
          subtitle={predios.total > 0 ? `${Math.round((predios.conGPS / predios.total) * 100)}%` : undefined} />
        <KPICard label="Conformes" value={predios.conformes} icon="M9 12.75L11.25 15 15 9.75" color="emerald" />
      </div>

      {/* ── KPI Cards row 2: Operación ───────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard label="Tareas Hoy" value={tareas.hoy} icon="M6.75 3v2.25M17.25 3v2.25" color="amber" highlight={tareas.hoy > 0} />
        <KPICard label="Completadas (Semana)" value={tareas.completadasSemana} icon="M4.5 12.75l6 6 9-13.5" color="green" />
        <KPICard label="Completadas (Mes)" value={tareas.completadasMes} icon="M12 6v6h4.5m4.5 0a9 9 0 11-18 0" color="blue" />
        <KPICard label="Pendientes" value={tareas.pendientes} icon="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71" color="red" highlight={tareas.pendientes > 10} />
      </div>

      {/* ── KPI Cards row 3: Recursos ────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KPICard label="Equipos Disponibles" value={equipos.disponibles} icon="M20.25 7.5l-.625 10.632" color="green" />
        <KPICard label="Equipos Asignados" value={equipos.asignados} icon="M20.25 7.5l-.625 10.632" color="blue" />
        <KPICard label="Equipos Rotos/Perdidos" value={equipos.rotos} icon="M12 9v3.75m-9.303 3.376" color="red" highlight={equipos.rotos > 0} />
        <KPICard label="Usuarios Activos" value={operacion.usuariosActivos} icon="M15 19.128a9.38 9.38 0 002.625.372" color="primary" />
      </div>

      {/* ── Gráficos ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        {/* Distribución por estado - Pie */}
        <div className="bg-white rounded-lg border border-surface-200 p-5">
          <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-4">
            Distribución por Estado
          </h3>
          {predios.byEstado.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={predios.byEstado}
                  dataKey="count"
                  nameKey="nombre"
                  cx="50%" cy="50%"
                  outerRadius={100}
                  innerRadius={50}
                  paddingAngle={2}
                  label={(props: any) => `${props.nombre} (${props.count})`}
                  labelLine={false}
                >
                  {predios.byEstado.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => [value, "Predios"]} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="Sin datos de estado" />
          )}
        </div>

        {/* Distribución por equipo - Bar */}
        <div className="bg-white rounded-lg border border-surface-200 p-5">
          <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-4">
            Carga por Equipo
          </h3>
          {equipoData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={equipoData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="nombre" type="category" tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={(value: any) => [value, "Predios"]} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {equipoData.map((_, i) => (
                    <Cell key={i} fill={EQUIPO_COLORS[i % EQUIPO_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="Sin equipos asignados" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        {/* Distribución por provincia - Bar horizontal */}
        <div className="bg-white rounded-lg border border-surface-200 p-5">
          <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-4">
            Predios por Provincia
          </h3>
          {predios.byProvincia.filter((p) => p.nombre !== "Sin provincia").length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={predios.byProvincia.filter((p) => p.nombre !== "Sin provincia").slice(0, 12)}
                layout="vertical"
                margin={{ left: 10, right: 20 }}
              >
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="nombre" type="category" tick={{ fontSize: 11 }} width={80} />
                <Tooltip formatter={(value: any) => [value, "Predios"]} />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="Sin datos de provincia" />
          )}
        </div>

        {/* Distribución por ámbito - Pie */}
        <div className="bg-white rounded-lg border border-surface-200 p-5">
          <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-4">
            Ámbito Urbano vs Rural
          </h3>
          {predios.byAmbito.filter((a) => a.nombre !== "Sin definir").length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={predios.byAmbito.filter((a) => a.nombre !== "Sin definir")}
                  dataKey="count"
                  nameKey="nombre"
                  cx="50%" cy="50%"
                  outerRadius={100}
                  innerRadius={50}
                  paddingAngle={2}
                  label={(props: any) => `${props.nombre} (${props.count})`}
                >
                  <Cell fill="#6366f1" />
                  <Cell fill="#22c55e" />
                  <Cell fill="#f97316" />
                </Pie>
                <Tooltip formatter={(value: any) => [value, "Predios"]} />
                <Legend verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="Sin datos de ámbito" />
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="bg-white rounded-lg border border-surface-200 p-5">
        <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-3">
          Acceso rápido
        </h3>
        <div className="flex flex-wrap gap-2">
          <QuickLink href="/dashboard/predios" label="Mapa de predios" />
          <QuickLink href="/dashboard/tareas" label="Tareas" />
          <QuickLink href="/dashboard/facturacion" label="Facturación" />
          <QuickLink href="/dashboard/topologia" label="Topología" />
          <QuickLink href="/dashboard/stock" label="Stock" />
        </div>
      </div>
    </div>
  );
}

/* ── Componentes auxiliares ───────────────────────────── */

function KPICard({
  label, value, icon, color, subtitle, highlight,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
  subtitle?: string;
  highlight?: boolean;
}) {
  const colorMap: Record<string, string> = {
    primary: "bg-primary-50 text-primary-600",
    accent: "bg-accent-50 text-accent-600",
    green: "bg-emerald-50 text-emerald-600",
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className={`bg-white rounded-lg border p-4 ${highlight ? "border-amber-300 bg-amber-50/30" : "border-surface-200"}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${colorMap[color] || colorMap.primary}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
        <span className="text-[10px] text-surface-500 leading-tight">{label}</span>
      </div>
      <p className="text-xl font-bold text-surface-800">{value.toLocaleString()}</p>
      {subtitle && <p className="text-[10px] text-surface-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 bg-surface-50 border border-surface-200 rounded-md text-xs text-surface-600 hover:bg-surface-100 hover:border-surface-300 transition-colors"
    >
      {label} →
    </Link>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-[280px] text-sm text-surface-400">
      {text}
    </div>
  );
}
