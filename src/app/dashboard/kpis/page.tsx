"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, AreaChart, Area, CartesianGrid,
} from "recharts";
import SectionSettings from "@/components/ui/SectionSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/contexts/ThemeContext";

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

const AMBITO_COLORS = ["#6366f1", "#22c55e", "#f97316", "#94a3b8"];

export default function KPIsPage() {
  const { theme } = useTheme();
  const dk = theme === "dark";
  const [data, setData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Secciones visibles (persistencia en localStorage)
  const KPI_SECTIONS_KEY = "pmn-kpi-sections";
  const defaultSections = { progreso: true, predios: true, operacion: true, recursos: true, graficos1: true, graficos2: true, actividad: true };
  const [sections, setSections] = useState(defaultSections);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KPI_SECTIONS_KEY);
      if (saved) setSections({ ...defaultSections, ...JSON.parse(saved) });
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSection(key: string) {
    setSections(prev => {
      const next = { ...prev, [key]: !prev[key as keyof typeof prev] };
      localStorage.setItem(KPI_SECTIONS_KEY, JSON.stringify(next));
      return next;
    });
  }

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
      <div className="space-y-6 p-1">
        <div className="h-7 w-56 bg-surface-200 rounded skeleton-shimmer" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-surface-200 h-28 skeleton-shimmer" style={{ animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          <div className="bg-white rounded-xl border border-surface-200 h-80 skeleton-shimmer" />
          <div className="bg-white rounded-xl border border-surface-200 h-80 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
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
  const totalEquipos = equipos.disponibles + equipos.asignados + equipos.rotos;
  const equipoPieData = [
    { name: "Disponibles", value: equipos.disponibles, color: "#22c55e" },
    { name: "Asignados", value: equipos.asignados, color: "#3b82f6" },
    { name: "Rotos/Perdidos", value: equipos.rotos, color: "#ef4444" },
  ].filter(d => d.value > 0);

  // Datos simulados para el mini gráfico de tendencia en progreso
  const progresoTrend = [
    { d: "L", v: Math.max(0, predios.progreso - 12) },
    { d: "M", v: Math.max(0, predios.progreso - 8) },
    { d: "X", v: Math.max(0, predios.progreso - 6) },
    { d: "J", v: Math.max(0, predios.progreso - 3) },
    { d: "V", v: Math.max(0, predios.progreso - 1) },
    { d: "S", v: predios.progreso },
    { d: "D", v: predios.progreso },
  ];

  const sectionVariants = {
    hidden: { opacity: 0, y: 18 },
    visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4, ease: "easeOut" as const } }),
  };

  return (
    <div className="space-y-5 sm:space-y-6 p-1">
      {/* ── Header ──────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-800">Dashboard Ejecutivo</h1>
          <p className="text-xs text-surface-400 mt-1">Métricas y KPIs del proyecto en tiempo real</p>
        </div>
        <div className="flex items-center gap-1">
          <SectionSettings seccion="kpis">
            {[
              { key: "progreso", label: "Progreso general" },
              { key: "predios", label: "KPIs Predios" },
              { key: "operacion", label: "KPIs Operación" },
              { key: "recursos", label: "KPIs Recursos" },
              { key: "graficos1", label: "Gráficos (estado + equipo)" },
              { key: "graficos2", label: "Gráficos (provincia + ámbito)" },
              { key: "actividad", label: "Resumen de actividad" },
            ].map(s => (
              <label key={s.key} className="flex items-center gap-2 text-xs text-surface-600 cursor-pointer hover:bg-surface-50 rounded px-1 py-0.5">
                <input
                  type="checkbox"
                  checked={sections[s.key as keyof typeof sections]}
                  onChange={() => toggleSection(s.key)}
                  className="rounded border-surface-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                />
                {s.label}
              </label>
            ))}
          </SectionSettings>
          <button
            onClick={fetchData}
            className="p-2 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-600 transition-colors"
            title="Actualizar datos"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
          </button>
        </div>
      </motion.div>

      {/* ── Progreso general + Tendencia ─────────────── */}
      <AnimatePresence>
      {sections.progreso && <motion.div custom={0} variants={sectionVariants} initial="hidden" animate="visible" exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }} className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Progreso del cronograma</h3>
              <p className="text-[10px] text-surface-400 mt-0.5">{predios.conformes} de {predios.total} predios conformes</p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-bold" style={{
                color: predios.progreso >= 80 ? "#22c55e" : predios.progreso >= 50 ? "#eab308" : "#6366f1",
              }}>{predios.progreso}%</span>
              <p className="text-[10px] text-surface-400">completado</p>
            </div>
          </div>
          <div className="w-full bg-surface-100 rounded-full h-4 mb-1 overflow-hidden">
            <div
              className="h-4 rounded-full transition-all duration-700 relative overflow-hidden"
              style={{
                width: `${predios.progreso}%`,
                background: predios.progreso >= 80
                  ? "linear-gradient(90deg, #22c55e, #16a34a)"
                  : predios.progreso >= 50
                  ? "linear-gradient(90deg, #eab308, #f59e0b)"
                  : "linear-gradient(90deg, #6366f1, #8b5cf6)",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
            </div>
          </div>
          <div className="flex justify-between text-[10px] text-surface-400 mt-1">
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>100%</span>
          </div>
          </CardContent>
        </Card>

        {/* Mini trend sparkline */}
        <Card className="flex flex-col">
          <CardContent className="p-5 flex-1 flex flex-col">
          <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Tendencia semanal</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={progresoTrend} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="progGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={dk ? "#334155" : "#f1f5f9"} />
                <XAxis dataKey="d" tick={{ fontSize: 10, fill: dk ? "#94a3b8" : "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: dk ? "#94a3b8" : "#94a3b8" }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Area type="monotone" dataKey="v" stroke="#6366f1" strokeWidth={2} fill="url(#progGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          </CardContent>
        </Card>
      </motion.div>}
      </AnimatePresence>

      {/* ── KPI Cards: Predios ───────────────────────── */}
      <AnimatePresence>
      {sections.predios && <motion.div custom={1} variants={sectionVariants} initial="hidden" animate="visible" exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}>
        <SectionTitle title="Predios" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger-children">
          <KPICard
            label="Total Predios" value={predios.total}
            icon="M2.25 21h19.5M3.75 3v18m16.5-18v18" color="primary"
          />
          <KPICard
            label="Con Red Meraki" value={predios.conRed}
            icon="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0"
            color="accent"
            subtitle={predios.total > 0 ? `${Math.round((predios.conRed / predios.total) * 100)}% del total` : undefined}
            progress={predios.total > 0 ? (predios.conRed / predios.total) * 100 : 0}
          />
          <KPICard
            label="Con GPS" value={predios.conGPS}
            icon="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
            color="green"
            subtitle={predios.total > 0 ? `${Math.round((predios.conGPS / predios.total) * 100)}% geolocalizados` : undefined}
            progress={predios.total > 0 ? (predios.conGPS / predios.total) * 100 : 0}
          />
          <KPICard
            label="Conformes" value={predios.conformes}
            icon="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            color="emerald"
            subtitle={predios.total > 0 ? `${predios.progreso}% del objetivo` : undefined}
            progress={predios.progreso}
          />
        </div>
      </motion.div>}
      </AnimatePresence>

      {/* ── KPI Cards: Operación ─────────────────────── */}
      <AnimatePresence>
      {sections.operacion && <motion.div custom={2} variants={sectionVariants} initial="hidden" animate="visible" exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}>
        <SectionTitle title="Operación" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger-children">
          <KPICard
            label="Tareas para Hoy" value={tareas.hoy}
            icon="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25"
            color="amber" highlight={tareas.hoy > 0}
          />
          <KPICard
            label="Completadas (semana)" value={tareas.completadasSemana}
            icon="M4.5 12.75l6 6 9-13.5" color="green"
          />
          <KPICard
            label="Completadas (mes)" value={tareas.completadasMes}
            icon="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" color="blue"
          />
          <KPICard
            label="Pendientes" value={tareas.pendientes}
            icon="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"
            color="red" highlight={tareas.pendientes > 10}
            subtitle={tareas.pendientes > 10 ? "⚠ Requiere atención" : undefined}
          />
        </div>
      </motion.div>}
      </AnimatePresence>

      {/* ── KPI Cards: Recursos ──────────────────────── */}
      <AnimatePresence>
      {sections.recursos && <motion.div custom={3} variants={sectionVariants} initial="hidden" animate="visible" exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}>
        <SectionTitle title="Recursos" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger-children">
          <KPICard
            label="Equipos Disponibles" value={equipos.disponibles}
            icon="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
            color="green"
            subtitle={totalEquipos > 0 ? `${Math.round((equipos.disponibles / totalEquipos) * 100)}% disponible` : undefined}
          />
          <KPICard
            label="Equipos Asignados" value={equipos.asignados}
            icon="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75"
            color="blue"
          />
          <KPICard
            label="Equipos Rotos/Perdidos" value={equipos.rotos}
            icon="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71"
            color="red" highlight={equipos.rotos > 0}
          />
          <KPICard
            label="Usuarios Activos" value={operacion.usuariosActivos}
            icon="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
            color="primary"
          />
        </div>
      </motion.div>}
      </AnimatePresence>

      {/* ── Gráficos fila 1 ────────────────────────── */}
      <AnimatePresence>
      {sections.graficos1 && <motion.div custom={4} variants={sectionVariants} initial="hidden" animate="visible" exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }} className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {/* Distribución por estado - Donut */}
        <ChartCard title="Distribución por Estado" subtitle={`${predios.byEstado.length} estados configurados`}>
          {predios.byEstado.length > 0 ? (
            <>
              {/* Desktop: donut con labels externas */}
              <div className="hidden sm:block">
                <ResponsiveContainer width="100%" height={340}>
                  <PieChart>
                    <Pie
                      data={predios.byEstado}
                      dataKey="count" nameKey="nombre"
                      cx="50%" cy="50%"
                      outerRadius={110} innerRadius={60}
                      paddingAngle={3}
                      minAngle={8}
                      label={({ nombre, count, percent }: any) => {
                        const pct = (percent * 100).toFixed(0);
                        return count > 0 ? `${nombre} (${count} · ${pct}%)` : "";
                      }}
                      labelLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
                      style={{ fontSize: "12.5px", fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", fontWeight: 500 }}
                    >
                      {predios.byEstado.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any, name: any) => [`${value} predios`, name]}
                      contentStyle={{ borderRadius: "8px", border: dk ? "1px solid #334155" : "1px solid #e2e8f0", fontSize: "13px", fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", backgroundColor: dk ? "#1e293b" : "#fff", color: dk ? "#e2e8f0" : "#1e293b" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Mobile: donut compacto + leyenda debajo */}
              <div className="sm:hidden">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={predios.byEstado}
                      dataKey="count" nameKey="nombre"
                      cx="50%" cy="50%"
                      outerRadius={75} innerRadius={40}
                      paddingAngle={2}
                      label={false}
                    >
                      {predios.byEstado.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any, name: any) => [`${value} predios`, name]}
                      contentStyle={{ borderRadius: "8px", border: dk ? "1px solid #334155" : "1px solid #e2e8f0", fontSize: "11px", backgroundColor: dk ? "#1e293b" : "#fff", color: dk ? "#e2e8f0" : "#1e293b" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2 px-1">
                  {predios.byEstado.map((e, i) => (
                    <div key={i} className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: e.color }} />
                      <span className="text-[11px] text-surface-600 truncate">{e.nombre}</span>
                      <span className="text-[10px] text-surface-400 shrink-0 ml-auto tabular-nums">{e.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : <EmptyState text="Sin datos de estado" />}
        </ChartCard>

        {/* Carga por equipo - Bar */}
        <ChartCard title="Carga por Equipo" subtitle={`${equipoData.length} equipos con predios asignados`}>
          {equipoData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={equipoData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={dk ? "#334155" : "#f1f5f9"} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: dk ? "#94a3b8" : "#94a3b8" }} axisLine={false} />
                <YAxis dataKey="nombre" type="category" tick={{ fontSize: 11, fill: dk ? "#cbd5e1" : "#64748b" }} width={60} axisLine={false} />
                <Tooltip
                  formatter={(value: any) => [`${value} predios`, "Asignados"]}
                  contentStyle={{ borderRadius: "8px", border: dk ? "1px solid #334155" : "1px solid #e2e8f0", fontSize: "12px", backgroundColor: dk ? "#1e293b" : "#fff", color: dk ? "#e2e8f0" : "#1e293b" }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={20}>
                  {equipoData.map((_, i) => (
                    <Cell key={i} fill={EQUIPO_COLORS[i % EQUIPO_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState text="Sin equipos asignados" />}
        </ChartCard>
      </motion.div>}
      </AnimatePresence>

      {/* ── Gráficos fila 2 ────────────────────────── */}
      <AnimatePresence>
      {sections.graficos2 && <motion.div custom={5} variants={sectionVariants} initial="hidden" animate="visible" exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }} className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Predios por Provincia - Bar */}
        <div className="lg:col-span-2">
          <ChartCard title="Predios por Provincia" subtitle="Distribución geográfica">
            {predios.byProvincia.filter(p => p.nombre !== "Sin provincia").length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={predios.byProvincia.filter(p => p.nombre !== "Sin provincia").slice(0, 12)}
                  margin={{ left: 10, right: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={dk ? "#334155" : "#f1f5f9"} />
                  <XAxis dataKey="nombre" tick={{ fontSize: 10, fill: dk ? "#cbd5e1" : "#64748b" }} angle={-30} textAnchor="end" height={60} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: dk ? "#94a3b8" : "#94a3b8" }} axisLine={false} />
                  <Tooltip
                    formatter={(value: any) => [`${value} predios`, "Total"]}
                    contentStyle={{ borderRadius: "8px", border: dk ? "1px solid #334155" : "1px solid #e2e8f0", fontSize: "12px", backgroundColor: dk ? "#1e293b" : "#fff", color: dk ? "#e2e8f0" : "#1e293b" }}
                  />
                  <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={30}>
                    {predios.byProvincia.filter(p => p.nombre !== "Sin provincia").slice(0, 12).map((_, i) => (
                      <Cell key={i} fill={EQUIPO_COLORS[i % EQUIPO_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState text="Sin datos de provincia" />}
          </ChartCard>
        </div>

        {/* Ámbito + Equipos stock - stacked */}
        <div className="space-y-5">
          {/* Ámbito Pie */}
          <ChartCard title="Ámbito" compact>
            {predios.byAmbito.filter(a => a.nombre !== "Sin definir").length > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie
                    data={predios.byAmbito.filter(a => a.nombre !== "Sin definir")}
                    dataKey="count" nameKey="nombre"
                    cx="50%" cy="50%"
                    outerRadius={55} innerRadius={30}
                    paddingAngle={3}
                  >
                    {predios.byAmbito.filter(a => a.nombre !== "Sin definir").map((_, i) => (
                      <Cell key={i} fill={AMBITO_COLORS[i % AMBITO_COLORS.length]} stroke="#fff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => [`${value}`, "Predios"]}
                    contentStyle={{ borderRadius: "8px", border: dk ? "1px solid #334155" : "1px solid #e2e8f0", fontSize: "11px", backgroundColor: dk ? "#1e293b" : "#fff", color: dk ? "#e2e8f0" : "#1e293b" }} />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyState text="Sin datos" />}
          </ChartCard>

          {/* Stock de equipos Pie */}
          <ChartCard title="Stock de Equipos" compact>
            {totalEquipos > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie
                    data={equipoPieData}
                    dataKey="value" nameKey="name"
                    cx="50%" cy="50%"
                    outerRadius={55} innerRadius={30}
                    paddingAngle={3}
                  >
                    {equipoPieData.map((d, i) => (
                      <Cell key={i} fill={d.color} stroke="#fff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => [`${value}`, "Equipos"]}
                    contentStyle={{ borderRadius: "8px", border: dk ? "1px solid #334155" : "1px solid #e2e8f0", fontSize: "11px", backgroundColor: dk ? "#1e293b" : "#fff", color: dk ? "#e2e8f0" : "#1e293b" }} />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyState text="Sin equipos" />}
          </ChartCard>
        </div>
      </motion.div>}
      </AnimatePresence>

      {/* ── Resumen actividad + Quick links ───────────── */}
      <AnimatePresence>
      {sections.actividad && <motion.div custom={6} variants={sectionVariants} initial="hidden" animate="visible" exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }} className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Activity summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Resumen de actividad</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ActivityStat label="Actividades esta semana" value={operacion.actividadSemana} icon="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" color="#6366f1" />
            <ActivityStat label="Notificaciones pendientes" value={operacion.notificacionesPendientes} icon="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" color="#f59e0b" highlight={operacion.notificacionesPendientes > 0} />
            <ActivityStat label="Usuarios activos" value={operacion.usuariosActivos} icon="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" color="#22c55e" />
          </div>
          </CardContent>
        </Card>

        {/* Quick links */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Acceso rápido</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="flex flex-col gap-2">
            <QuickLink href="/dashboard/predios" label="Mapa de predios" icon="M15 10.5a3 3 0 11-6 0" />
            <QuickLink href="/dashboard/tareas" label="Tareas" icon="M9 12.75L11.25 15 15 9.75" />
            <QuickLink href="/dashboard/facturacion" label="Facturación" icon="M2.25 18.75a60.07 60.07 0 0115.797 2.101" />
            <QuickLink href="/dashboard/topologia" label="Topología" icon="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003" />
            <QuickLink href="/dashboard/stock" label="Stock" icon="M20.25 7.5l-.625 10.632" />
            <QuickLink href="/dashboard/hospedajes" label="Hospedajes" icon="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12" />
          </div>
          </CardContent>
        </Card>
      </motion.div>}
      </AnimatePresence>
    </div>
  );
}

/* ── Componentes auxiliares mejorados ─────────────────── */

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3 flex items-center gap-2">
      <span className="w-1 h-4 bg-primary-500 rounded-full" />
      {title}
    </h2>
  );
}

function KPICard({
  label, value, icon, color, subtitle, highlight, progress,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
  subtitle?: string;
  highlight?: boolean;
  progress?: number;
}) {
  const colorMap: Record<string, { bg: string; text: string; accent: string }> = {
    primary:  { bg: "bg-primary-50", text: "text-primary-600", accent: "#6366f1" },
    accent:   { bg: "bg-accent-50", text: "text-accent-600", accent: "#8b5cf6" },
    green:    { bg: "bg-emerald-50", text: "text-emerald-600", accent: "#22c55e" },
    emerald:  { bg: "bg-emerald-50", text: "text-emerald-600", accent: "#22c55e" },
    blue:     { bg: "bg-blue-50", text: "text-blue-600", accent: "#3b82f6" },
    red:      { bg: "bg-red-50", text: "text-red-600", accent: "#ef4444" },
    amber:    { bg: "bg-amber-50", text: "text-amber-600", accent: "#f59e0b" },
  };
  const c = colorMap[color] || colorMap.primary;
  return (
    <Card className={`card-hover transition-shadow hover:shadow-md ${highlight ? "border-amber-300 ring-1 ring-amber-200 bg-amber-50/20" : ""}`}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${c.bg}`}>
            <svg className={`w-4 h-4 ${c.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
          </div>
          {highlight && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          )}
        </div>
        <p className="text-xl sm:text-2xl font-bold text-surface-800 tabular-nums animate-count-up">{value.toLocaleString()}</p>
        <p className="text-[10px] sm:text-[11px] text-surface-500 mt-0.5 leading-tight">{label}</p>
        {subtitle && <p className="text-[10px] text-surface-400 mt-1">{subtitle}</p>}
        {progress !== undefined && (
          <div className="w-full bg-surface-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: c.accent }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, subtitle, children, compact }: { title: string; subtitle?: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <Card>
      <CardHeader className={compact ? "pb-0" : ""}>
        <CardTitle className="text-xs font-semibold text-surface-500 uppercase tracking-wider">{title}</CardTitle>
        {subtitle && <p className="text-[10px] text-surface-400">{subtitle}</p>}
      </CardHeader>
      <CardContent className={compact ? "px-4 pb-4" : ""}>
        {children}
      </CardContent>
    </Card>
  );
}

function ActivityStat({ label, value, icon, color, highlight }: {
  label: string; value: number; icon: string; color: string; highlight?: boolean;
}) {
  return (
    <div className="text-center p-3 rounded-lg bg-surface-50/50 dark:bg-surface-700/50">
      <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center"
        style={{ backgroundColor: `${color}15` }}>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </div>
      <p className={`text-xl font-bold tabular-nums ${highlight ? "text-amber-600" : "text-surface-800 dark:text-surface-100"}`}>
        {value.toLocaleString()}
      </p>
      <p className="text-[10px] text-surface-400 leading-tight mt-0.5">{label}</p>
    </div>
  );
}

function QuickLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-surface-50 border border-transparent hover:border-surface-200 transition-all group hover:translate-x-0.5"
    >
      <svg className="w-4 h-4 text-surface-400 group-hover:text-primary-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      <span className="text-xs text-surface-600 group-hover:text-surface-800 transition-colors flex-1">{label}</span>
      <svg className="w-3 h-3 text-surface-300 group-hover:text-surface-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </Link>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-[200px] text-sm text-surface-400">
      <div className="text-center">
        <svg className="w-8 h-8 mx-auto mb-2 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
        <p>{text}</p>
      </div>
    </div>
  );
}
