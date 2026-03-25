"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "@/hooks/useSession";
import SectionSettings from "@/components/ui/SectionSettings";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface TareaCalendario {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  fechaFin: string | null;
  horaInicio: string | null;
  horaFin: string | null;
  tipo: string;
  categoria: string;
  prioridad: string;
  completada: boolean;
  todoElDia: boolean;
  ubicacion: string | null;
  notas: string | null;
  notificarPush: boolean;
  esAsignada: boolean;
  color: string;
  creador: { id: string; nombre: string } | null;
  asignado: { id: string; nombre: string } | null;
  predio: { id: string; nombre: string } | null;
}

/* ── SVG icon helper ── */
const svgIcon = (d: string, cls = "w-3.5 h-3.5 inline-block") => (
  <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const ICON = {
  clipboard: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z",
  wrench: "M21.75 6.75a4.5 4.5 0 01-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 11-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 016.336-4.486l-3.276 3.276a3.004 3.004 0 002.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852z",
  cog: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  users: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
  mapPin: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z",
  shield: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
  bell: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0",
  tag: "M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3zM6 6h.008v.008H6V6z",
  clock: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
  lock: "M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z",
  pencil: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125",
  trash: "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0",
  calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  check: "M4.5 12.75l6 6 9-13.5",
};

const CATEGORIAS: Record<string, { label: string; icon: string; color: string }> = {
  GENERAL: { label: "General", icon: ICON.clipboard, color: "#6b7280" },
  INSTALACION: { label: "Instalación", icon: ICON.wrench, color: "#3b82f6" },
  MANTENIMIENTO: { label: "Mantenimiento", icon: ICON.cog, color: "#f59e0b" },
  REUNION: { label: "Reunión", icon: ICON.users, color: "#8b5cf6" },
  VISITA: { label: "Visita", icon: ICON.mapPin, color: "#10b981" },
  GUARDIA: { label: "Guardia", icon: ICON.shield, color: "#ef4444" },
  RECORDATORIO: { label: "Recordatorio", icon: ICON.bell, color: "#ec4899" },
  OTRO: { label: "Otro", icon: ICON.tag, color: "#64748b" },
};

const PRIORIDAD_COLOR: Record<string, string> = {
  ALTA: "bg-red-500",
  MEDIA: "bg-amber-500",
  BAJA: "bg-blue-400",
};

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function getMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  let startDay = first.getDay() - 1;
  if (startDay < 0) startDay = 6;
  const days: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function getWeekDates(date: Date): Date[] {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  const week: Date[] = [];
  for (let i = 0; i < 7; i++) {
    week.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return week;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Parsea una fecha ISO del servidor como fecha local (evita desfase de timezone) */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Formatea una fecha local como string YYYY-MM-DD sin pasar por UTC */
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateShort(d: Date) {
  return format(d, "EEE d", { locale: es });
}

const EMPTY_FORM = {
  titulo: "", descripcion: "", fecha: "", fechaFin: "", horaInicio: "", horaFin: "",
  categoria: "GENERAL", prioridad: "MEDIA", asignadoId: "", predioId: "",
  todoElDia: false, ubicacion: "", notas: "", notificarPush: true,
};

export default function CalendarioPage() {
  const { session, isModOrAdmin } = useSession();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [tasks, setTasks] = useState<TareaCalendario[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date>(today);
  const [view, setView] = useState<"mes" | "semana">("mes");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [users, setUsers] = useState<any[]>([]);
  const [filterCat, setFilterCat] = useState<string>("");

  const load = useCallback(() => {
    let desde: string, hasta: string;
    if (view === "mes") {
      desde = `${year}-${String(month + 1).padStart(2, "0")}-01T00:00:00.000Z`;
      const lastDate = new Date(year, month + 1, 0).getDate();
      hasta = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}T23:59:59.999Z`;
    } else {
      const week = getWeekDates(selectedDay);
      desde = toLocalDateStr(week[0]) + "T00:00:00.000Z";
      hasta = toLocalDateStr(week[6]) + "T23:59:59.999Z";
    }
    const catParam = filterCat ? `&categoria=${filterCat}` : "";
    fetch(`/api/calendario?desde=${desde}&hasta=${hasta}${catParam}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setTasks(Array.isArray(data) ? data : []));
  }, [year, month, view, selectedDay, filterCat]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isModOrAdmin) {
      fetch("/api/usuarios", { credentials: "include" })
        .then((r) => r.json())
        .then((data) => setUsers(Array.isArray(data) ? data : []));
    }
  }, [isModOrAdmin]);

  function prev() {
    if (view === "semana") {
      const d = new Date(selectedDay);
      d.setDate(d.getDate() - 7);
      setSelectedDay(d);
      setMonth(d.getMonth());
      setYear(d.getFullYear());
    } else {
      if (month === 0) { setMonth(11); setYear((y) => y - 1); }
      else setMonth((m) => m - 1);
    }
  }
  function next() {
    if (view === "semana") {
      const d = new Date(selectedDay);
      d.setDate(d.getDate() + 7);
      setSelectedDay(d);
      setMonth(d.getMonth());
      setYear(d.getFullYear());
    } else {
      if (month === 11) { setMonth(0); setYear((y) => y + 1); }
      else setMonth((m) => m + 1);
    }
  }
  function goToday() {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth());
    setSelectedDay(t);
  }

  function tasksForDate(d: Date) {
    return tasks.filter((t) => {
      const start = parseLocalDate(t.fecha);
      if (t.fechaFin) {
        const end = parseLocalDate(t.fechaFin);
        return d >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
               d <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
      }
      return isSameDay(start, d);
    });
  }

  const dayTasks = useMemo(() => {
    const list = tasksForDate(selectedDay);
    return list.sort((a, b) => {
      if (a.todoElDia && !b.todoElDia) return -1;
      if (!a.todoElDia && b.todoElDia) return 1;
      return (a.horaInicio || "99:99").localeCompare(b.horaInicio || "99:99");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, selectedDay]);

  const todayTasks = useMemo(() => {
    return tasksForDate(today).filter(t => !t.completada);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  function openCreate(date?: Date) {
    const d = date || selectedDay;
    setEditingId(null);
    setForm({ ...EMPTY_FORM, fecha: toLocalDateStr(d) });
    setShowModal(true);
  }

  function openEdit(t: TareaCalendario) {
    setEditingId(t.id);
    setForm({
      titulo: t.titulo,
      descripcion: t.descripcion || "",
      fecha: t.fecha.split("T")[0],
      fechaFin: t.fechaFin ? t.fechaFin.split("T")[0] : "",
      horaInicio: t.horaInicio || "",
      horaFin: t.horaFin || "",
      categoria: t.categoria || "GENERAL",
      prioridad: t.prioridad,
      asignadoId: t.asignado?.id || "",
      predioId: t.predio?.id || "",
      todoElDia: t.todoElDia,
      ubicacion: t.ubicacion || "",
      notas: t.notas || "",
      notificarPush: t.notificarPush,
    });
    setShowModal(true);
  }

  async function handleSave() {
    const body: any = {
      titulo: form.titulo,
      fecha: form.fecha,
      prioridad: form.prioridad,
      categoria: form.categoria,
      todoElDia: form.todoElDia,
      notificarPush: form.notificarPush,
    };
    if (form.horaInicio) body.horaInicio = form.horaInicio;
    if (form.horaFin) body.horaFin = form.horaFin;
    if (form.descripcion) body.descripcion = form.descripcion;
    if (form.fechaFin) body.fechaFin = form.fechaFin;
    if (form.ubicacion) body.ubicacion = form.ubicacion;
    if (form.notas) body.notas = form.notas;
    if (form.asignadoId) body.asignadoId = form.asignadoId;
    if (form.predioId) body.predioId = form.predioId;

    const url = editingId ? `/api/calendario/${editingId}` : "/api/calendario";
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (res.ok) { setShowModal(false); load(); }
  }

  async function toggleComplete(id: string, completada: boolean) {
    await fetch(`/api/calendario/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ completada: !completada }),
    });
    load();
  }

  async function handleDelete(id: string) {
    toast("¿Eliminar este evento?", {
      action: {
        label: "Eliminar",
        onClick: async () => {
          await fetch(`/api/calendario/${id}`, { method: "DELETE", credentials: "include" });
          toast.success("Evento eliminado");
          load();
        },
      },
    });
  }

  const weekDates = useMemo(() => getWeekDates(selectedDay), [selectedDay]);
  const grid = getMonthGrid(year, month);
  const monthName = format(new Date(year, month), "MMMM yyyy", { locale: es });
  const selectedDayStr = format(selectedDay, "EEEE d 'de' MMMM", { locale: es });

  const catInfo = (cat: string) => CATEGORIAS[cat] || CATEGORIAS.GENERAL;

  // ─── Render ────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 tracking-tight">Calendario</h1>
          <p className="text-xs text-surface-400 mt-0.5">
            {todayTasks.length > 0
              ? `Hoy: ${todayTasks.length} pendiente${todayTasks.length > 1 ? "s" : ""} — ${todayTasks.map(t => t.titulo).slice(0, 2).join(", ")}${todayTasks.length > 2 ? ` +${todayTasks.length - 2}` : ""}`
              : "Sin pendientes hoy"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <SectionSettings seccion="calendario">
            <p className="text-[10px] text-surface-400 italic">Próximamente: preferencias de vista y categorías</p>
          </SectionSettings>
          <button onClick={() => openCreate()} className="px-4 py-2 sm:px-3 sm:py-1.5 bg-surface-800 text-white rounded-lg sm:rounded-md text-sm sm:text-xs font-medium hover:bg-surface-700 active:scale-[0.97] transition-all">
            + Nuevo evento
          </button>
        </div>
      </div>

      {/* Controles */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-4">
        <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-0.5">
          <button onClick={() => setView("mes")} className={`px-3 py-1 text-xs rounded-md transition-colors ${view === "mes" ? "bg-white shadow-sm text-surface-800 font-medium" : "text-surface-500 hover:text-surface-700"}`}>Mes</button>
          <button onClick={() => setView("semana")} className={`px-3 py-1 text-xs rounded-md transition-colors ${view === "semana" ? "bg-white shadow-sm text-surface-800 font-medium" : "text-surface-500 hover:text-surface-700"}`}>Semana</button>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={prev} className="px-2 py-1 text-xs border border-surface-200 rounded-md hover:bg-surface-50">←</button>
          <button onClick={goToday} className="px-2.5 py-1 text-xs border border-surface-200 rounded-md hover:bg-surface-50 font-medium">Hoy</button>
          <button onClick={next} className="px-2 py-1 text-xs border border-surface-200 rounded-md hover:bg-surface-50">→</button>
          <span className="text-sm font-semibold text-surface-700 capitalize ml-1">{view === "mes" ? monthName : `${formatDateShort(weekDates[0])} – ${formatDateShort(weekDates[6])}, ${weekDates[0].getFullYear()}`}</span>
        </div>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="w-full sm:w-auto sm:ml-auto px-3 py-2 sm:px-2 sm:py-1 text-sm sm:text-xs border border-surface-200 rounded-lg sm:rounded-md bg-white focus:outline-none">
          <option value="">Todas las categorías</option>
          {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Calendar grid */}
        <div className="flex-1">
          <div className="bg-white rounded-lg border border-surface-200 overflow-hidden">
            {view === "mes" ? (
              /* ── Vista Mes ── */
              <div className="grid grid-cols-7 gap-px bg-surface-200">
                {DAYS.map((d) => (
                  <div key={d} className="bg-surface-50 py-1.5 text-center text-[10px] font-medium text-surface-400 uppercase tracking-wider">{d}</div>
                ))}
                {grid.map((day, i) => {
                  const date = day ? new Date(year, month, day) : null;
                  const dt = date ? tasksForDate(date) : [];
                  const isToday = date ? isSameDay(date, today) : false;
                  const isSelected = date ? isSameDay(date, selectedDay) : false;
                  return (
                    <div
                      key={i}
                      onClick={() => date && setSelectedDay(date)}
                      className={`bg-white min-h-[56px] sm:min-h-[76px] p-1 sm:p-1.5 cursor-pointer transition-all
                        ${!day ? "bg-surface-50/50" : ""} ${isSelected ? "ring-2 ring-surface-800 ring-inset" : ""} ${isToday ? "bg-amber-50/50" : "hover:bg-surface-50"}`}
                    >
                      {day && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] sm:text-xs ${isToday ? "bg-surface-800 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold" : "text-surface-500 font-medium"}`}>{day}</span>
                            {dt.length > 0 && <span className="text-[9px] text-surface-400 hidden sm:inline">{dt.length}</span>}
                          </div>
                          <div className="mt-0.5 space-y-0.5 hidden sm:block">
                            {dt.slice(0, 2).map((t) => (
                              <div key={t.id} className="flex items-center gap-1 text-[10px] truncate" style={{ color: catInfo(t.categoria).color }}>
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: catInfo(t.categoria).color, opacity: t.completada ? 0.3 : 1 }} />
                                <span className={`truncate ${t.completada ? "line-through opacity-40" : ""}`}>{t.horaInicio ? `${t.horaInicio} ` : ""}{t.titulo}</span>
                              </div>
                            ))}
                            {dt.length > 2 && <span className="text-[9px] text-surface-400 pl-2.5">+{dt.length - 2} más</span>}
                          </div>
                          <div className="flex flex-wrap gap-0.5 mt-0.5 sm:hidden">
                            {dt.slice(0, 4).map((t) => (
                              <span key={t.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catInfo(t.categoria).color, opacity: t.completada ? 0.3 : 1 }} />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── Vista Semana ── */
              <div className="overflow-x-auto -mx-1 px-1">
                <div className="grid grid-cols-7 gap-px bg-surface-200 min-w-[560px]">
                  {weekDates.map((d, i) => {
                    const isToday2 = isSameDay(d, today);
                    const isSelected2 = isSameDay(d, selectedDay);
                    return (
                      <div key={i} onClick={() => setSelectedDay(d)}
                        className={`bg-white text-center py-2 cursor-pointer transition-colors ${isSelected2 ? "bg-surface-100" : "hover:bg-surface-50"}`}>
                        <div className="text-[10px] text-surface-400 uppercase">{DAYS[i]}</div>
                        <div className={`text-sm font-semibold mt-0.5 ${isToday2 ? "bg-surface-800 text-white rounded-full w-7 h-7 flex items-center justify-center mx-auto" : "text-surface-700"}`}>
                          {d.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-7 gap-px bg-surface-200 min-w-[560px]">
                  {weekDates.map((d, i) => {
                    const dt = tasksForDate(d);
                    return (
                      <div key={i} className="bg-white min-h-[140px] sm:min-h-[200px] p-1 sm:p-1.5 space-y-1">
                        {dt.map((t) => (
                          <div key={t.id} onClick={() => { setSelectedDay(d); openEdit(t); }}
                            className={`p-1.5 rounded text-[10px] cursor-pointer border-l-2 transition-colors hover:shadow-sm ${t.completada ? "opacity-40" : ""}`}
                            style={{ borderColor: catInfo(t.categoria).color, backgroundColor: catInfo(t.categoria).color + "08" }}>
                            <div className="font-medium truncate text-surface-700 flex items-center gap-1">{svgIcon(catInfo(t.categoria).icon, "w-3 h-3 flex-shrink-0")} <span className="truncate">{t.titulo}</span></div>
                            {t.horaInicio && <div className="text-surface-400">{t.horaInicio}{t.horaFin ? ` – ${t.horaFin}` : ""}</div>}
                            {t.todoElDia && <div className="text-surface-400">Todo el día</div>}
                          </div>
                        ))}
                        {dt.length === 0 && (
                          <button onClick={() => { setSelectedDay(d); openCreate(d); }} className="w-full h-full min-h-[80px] flex items-center justify-center text-surface-300 hover:text-surface-500 text-lg">+</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {/* Leyenda categorías */}
          <div className="flex flex-wrap gap-2 mt-2">
            {Object.entries(CATEGORIAS).map(([k, v]) => {
              const count = tasks.filter(t => t.categoria === k).length;
              if (count === 0) return null;
              return (
                <button key={k} onClick={() => setFilterCat(filterCat === k ? "" : k)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border transition-colors ${filterCat === k ? "border-surface-400 bg-surface-100" : "border-surface-200 hover:bg-surface-50"}`}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color }} />
                  {v.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Panel lateral - Agenda del día */}
        <div className="lg:w-80 flex-shrink-0">
          <div className="bg-white rounded-lg border border-surface-200 p-3 sm:p-4 sticky top-20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-surface-800 text-sm capitalize">{selectedDayStr}</h3>
                <p className="text-[10px] text-surface-400">{dayTasks.length} evento{dayTasks.length !== 1 ? "s" : ""}</p>
              </div>
              <button onClick={() => openCreate(selectedDay)} className="text-sm sm:text-xs text-surface-500 hover:text-surface-800 border border-surface-200 rounded-lg sm:rounded-md px-3 py-1.5 sm:px-2 sm:py-1 hover:bg-surface-50 active:scale-[0.97] transition-all">+ Agregar</button>
            </div>

            {dayTasks.length === 0 ? (
              <div className="py-8 text-center">
                <div className="mb-1 text-surface-300 flex justify-center">{svgIcon(ICON.calendar, "w-8 h-8")}</div>
                <p className="text-xs text-surface-400">Sin eventos este día</p>
                <button onClick={() => openCreate(selectedDay)} className="text-xs text-surface-500 hover:text-surface-700 mt-2">Crear uno</button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto stagger-children">
                {dayTasks.map((t) => {
                  const cat = catInfo(t.categoria);
                  const esPropia = t.creador?.id === session?.userId;
                  const puedeEditar = isModOrAdmin || (esPropia && !t.esAsignada);
                  const puedeBorrar = isModOrAdmin || (esPropia && !t.esAsignada);

                  return (
                    <div key={t.id} className={`p-3 rounded-lg border-l-3 transition-all row-animate ${t.completada ? "opacity-50 bg-surface-50" : "bg-white border border-surface-100 hover:shadow-sm"}`}
                      style={{ borderLeftColor: cat.color, borderLeftWidth: "3px" }}>
                      <div className="flex items-start gap-2">
                        <button onClick={() => toggleComplete(t.id, t.completada)}
                          className={`w-4.5 h-4.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center text-[9px] mt-0.5
                            ${t.completada ? "bg-green-500 border-green-500 text-white" : "border-surface-300 hover:border-surface-500"}`}>
                          {t.completada && svgIcon(ICON.check, "w-2.5 h-2.5")}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs flex-shrink-0">{svgIcon(cat.icon, "w-3.5 h-3.5")}</span>
                            <p className={`text-sm font-medium truncate ${t.completada ? "line-through text-surface-400" : "text-surface-800"}`}>{t.titulo}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px] text-surface-500">
                            {t.todoElDia ? (
                              <span>Todo el día</span>
                            ) : t.horaInicio ? (
                              <span className="flex items-center gap-0.5">{svgIcon(ICON.clock, "w-2.5 h-2.5")}{t.horaInicio}{t.horaFin ? ` – ${t.horaFin}` : ""}</span>
                            ) : null}
                            {t.ubicacion && <span className="flex items-center gap-0.5">{svgIcon(ICON.mapPin, "w-2.5 h-2.5")}{t.ubicacion}</span>}
                            {t.asignado && <span>→ {t.asignado.nombre}</span>}
                            {t.predio && <span className="flex items-center gap-0.5">{svgIcon(ICON.clipboard, "w-2.5 h-2.5")}{t.predio.nombre}</span>}
                          </div>
                          {t.descripcion && <p className="text-[10px] text-surface-400 mt-1 line-clamp-2">{t.descripcion}</p>}
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <Badge className={`text-[9px] text-white ${PRIORIDAD_COLOR[t.prioridad]}`}>{t.prioridad}</Badge>
                            <Badge className="text-[9px] text-white" style={{ backgroundColor: cat.color }}>{cat.label}</Badge>
                            {t.esAsignada && !isModOrAdmin && <span className="text-[10px]" title="Asignada">{svgIcon(ICON.lock, "w-3 h-3")}</span>}
                            {t.notificarPush && <span className="text-[10px]" title="Push activado">{svgIcon(ICON.bell, "w-3 h-3")}</span>}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          {puedeEditar && (
                            <button onClick={() => openEdit(t)} className="text-surface-400 hover:text-surface-700" title="Editar">{svgIcon(ICON.pencil, "w-3.5 h-3.5")}</button>
                          )}
                          {puedeBorrar && (
                            <button onClick={() => handleDelete(t.id)} className="text-red-400 hover:text-red-600" title="Eliminar">{svgIcon(ICON.trash, "w-3.5 h-3.5")}</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal crear/editar */}
      <AnimatePresence>
      {showModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <motion.div initial={{ opacity: 0, y: 40, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.97 }} transition={{ type: "spring", damping: 25, stiffness: 350 }} className="bg-white rounded-t-2xl sm:rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-5 border-b border-surface-100">
              <h2 className="text-base font-semibold text-surface-800">{editingId ? "Editar evento" : "Nuevo evento"}</h2>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-1">Título *</label>
                <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ej: Instalación en Rosario"
                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-surface-400" />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-1">Categoría</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {Object.entries(CATEGORIAS).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => setForm({ ...form, categoria: k })}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] border transition-all
                        ${form.categoria === k ? "border-surface-400 bg-surface-100 font-medium" : "border-surface-200 hover:bg-surface-50"}`}>
                      {svgIcon(v.icon, "w-3 h-3")} {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 py-1">
                <input type="checkbox" id="todoElDia" checked={form.todoElDia} onChange={(e) => setForm({ ...form, todoElDia: e.target.checked, horaInicio: "", horaFin: "" })}
                  className="w-4 h-4 rounded border-surface-300" />
                <label htmlFor="todoElDia" className="text-xs text-surface-600">Todo el día</label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-1">Fecha inicio *</label>
                  <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-surface-400" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-1">Fecha fin</label>
                  <input type="date" value={form.fechaFin} onChange={(e) => setForm({ ...form, fechaFin: e.target.value })} min={form.fecha}
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-surface-400" />
                </div>
              </div>

              {!form.todoElDia && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-1">Hora inicio</label>
                    <input type="time" value={form.horaInicio} onChange={(e) => setForm({ ...form, horaInicio: e.target.value })}
                      className="w-full px-3 py-2 border border-surface-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-surface-400" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-1">Hora fin</label>
                    <input type="time" value={form.horaFin} onChange={(e) => setForm({ ...form, horaFin: e.target.value })}
                      className="w-full px-3 py-2 border border-surface-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-surface-400" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-1">Descripción</label>
                <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={2} placeholder="Detalles del evento..."
                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-surface-400" />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-1">Ubicación</label>
                <input value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} placeholder="Ej: Av. Pellegrini 1500, Rosario"
                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-surface-400" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-1">Prioridad</label>
                  <select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-surface-400">
                    <option value="BAJA">● Baja</option>
                    <option value="MEDIA">● Media</option>
                    <option value="ALTA">● Alta</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-1">Asignar a</label>
                  {isModOrAdmin ? (
                    <select value={form.asignadoId} onChange={(e) => setForm({ ...form, asignadoId: e.target.value })}
                      className="w-full px-3 py-2 border border-surface-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-surface-400">
                      <option value="">Sin asignar</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                    </select>
                  ) : (
                    <p className="text-[10px] text-surface-400 py-2">Solo admin puede asignar</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-1">Notas</label>
                <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} placeholder="Notas internas..."
                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-surface-400" />
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="notificarPush2" checked={form.notificarPush} onChange={(e) => setForm({ ...form, notificarPush: e.target.checked })}
                  className="w-4 h-4 rounded border-surface-300" />
                <label htmlFor="notificarPush2" className="text-xs text-surface-600 flex items-center gap-1">{svgIcon(ICON.bell, "w-3.5 h-3.5")} Notificaciones push</label>
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-surface-100">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 sm:py-2 text-sm sm:text-xs border border-surface-200 rounded-lg hover:bg-surface-50 active:scale-[0.97] transition-all">Cancelar</button>
              <button onClick={handleSave} disabled={!form.titulo || !form.fecha}
                className="flex-1 py-2.5 sm:py-2 bg-surface-800 text-white rounded-lg text-sm sm:text-xs font-medium hover:bg-surface-700 disabled:opacity-50 active:scale-[0.97] transition-all">
                {editingId ? "Guardar cambios" : "Crear evento"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </motion.div>
  );
}
