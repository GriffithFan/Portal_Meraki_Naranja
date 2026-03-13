"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "@/hooks/useSession";

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

const CATEGORIAS: Record<string, { label: string; icon: string; color: string }> = {
  GENERAL: { label: "General", icon: "📋", color: "#6b7280" },
  INSTALACION: { label: "Instalación", icon: "🔧", color: "#3b82f6" },
  MANTENIMIENTO: { label: "Mantenimiento", icon: "🛠️", color: "#f59e0b" },
  REUNION: { label: "Reunión", icon: "👥", color: "#8b5cf6" },
  VISITA: { label: "Visita", icon: "📍", color: "#10b981" },
  GUARDIA: { label: "Guardia", icon: "🛡️", color: "#ef4444" },
  RECORDATORIO: { label: "Recordatorio", icon: "⏰", color: "#ec4899" },
  OTRO: { label: "Otro", icon: "📌", color: "#64748b" },
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

function formatDateShort(d: Date) {
  return d.toLocaleDateString("es-AR", { weekday: "short", day: "numeric" }).replace(".", "");
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
      desde = new Date(year, month, 1).toISOString();
      hasta = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    } else {
      const week = getWeekDates(selectedDay);
      desde = week[0].toISOString();
      hasta = new Date(week[6].getFullYear(), week[6].getMonth(), week[6].getDate(), 23, 59, 59).toISOString();
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
      const start = new Date(t.fecha);
      if (t.fechaFin) {
        const end = new Date(t.fechaFin);
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
    setForm({ ...EMPTY_FORM, fecha: d.toISOString().split("T")[0] });
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
    if (!confirm("¿Eliminar este evento?")) return;
    await fetch(`/api/calendario/${id}`, { method: "DELETE", credentials: "include" });
    load();
  }

  const weekDates = useMemo(() => getWeekDates(selectedDay), [selectedDay]);
  const grid = getMonthGrid(year, month);
  const monthName = new Date(year, month).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  const selectedDayStr = selectedDay.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

  const catInfo = (cat: string) => CATEGORIAS[cat] || CATEGORIAS.GENERAL;

  // ─── Render ────────────────────────────────────────────
  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 tracking-tight">Calendario</h1>
          <p className="text-xs text-surface-400 mt-0.5">
            {todayTasks.length > 0
              ? `Hoy: ${todayTasks.length} pendiente${todayTasks.length > 1 ? "s" : ""} — ${todayTasks.map(t => `${catInfo(t.categoria).icon} ${t.titulo}`).slice(0, 2).join(", ")}${todayTasks.length > 2 ? ` +${todayTasks.length - 2}` : ""}`
              : "Sin pendientes hoy"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => openCreate()} className="px-3 py-1.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 transition-colors">
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
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="ml-auto px-2 py-1 text-xs border border-surface-200 rounded-md bg-white focus:outline-none">
          <option value="">Todas las categorías</option>
          {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
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
              <div>
                <div className="grid grid-cols-7 gap-px bg-surface-200">
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
                <div className="grid grid-cols-7 gap-px bg-surface-200">
                  {weekDates.map((d, i) => {
                    const dt = tasksForDate(d);
                    return (
                      <div key={i} className="bg-white min-h-[200px] p-1.5 space-y-1">
                        {dt.map((t) => (
                          <div key={t.id} onClick={() => { setSelectedDay(d); openEdit(t); }}
                            className={`p-1.5 rounded text-[10px] cursor-pointer border-l-2 transition-colors hover:shadow-sm ${t.completada ? "opacity-40" : ""}`}
                            style={{ borderColor: catInfo(t.categoria).color, backgroundColor: catInfo(t.categoria).color + "08" }}>
                            <div className="font-medium truncate text-surface-700">{catInfo(t.categoria).icon} {t.titulo}</div>
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
          <div className="bg-white rounded-lg border border-surface-200 p-4 sticky top-20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-surface-800 text-sm capitalize">{selectedDayStr}</h3>
                <p className="text-[10px] text-surface-400">{dayTasks.length} evento{dayTasks.length !== 1 ? "s" : ""}</p>
              </div>
              <button onClick={() => openCreate(selectedDay)} className="text-xs text-surface-500 hover:text-surface-800 border border-surface-200 rounded-md px-2 py-1 hover:bg-surface-50">+ Agregar</button>
            </div>

            {dayTasks.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-2xl mb-1">📅</p>
                <p className="text-xs text-surface-400">Sin eventos este día</p>
                <button onClick={() => openCreate(selectedDay)} className="text-xs text-surface-500 hover:text-surface-700 mt-2">Crear uno</button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {dayTasks.map((t) => {
                  const cat = catInfo(t.categoria);
                  const esPropia = t.creador?.id === session?.userId;
                  const puedeEditar = isModOrAdmin || (esPropia && !t.esAsignada);
                  const puedeBorrar = isModOrAdmin || (esPropia && !t.esAsignada);

                  return (
                    <div key={t.id} className={`p-3 rounded-lg border-l-3 transition-all ${t.completada ? "opacity-50 bg-surface-50" : "bg-white border border-surface-100 hover:shadow-sm"}`}
                      style={{ borderLeftColor: cat.color, borderLeftWidth: "3px" }}>
                      <div className="flex items-start gap-2">
                        <button onClick={() => toggleComplete(t.id, t.completada)}
                          className={`w-4.5 h-4.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center text-[9px] mt-0.5
                            ${t.completada ? "bg-green-500 border-green-500 text-white" : "border-surface-300 hover:border-surface-500"}`}>
                          {t.completada && "✓"}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs">{cat.icon}</span>
                            <p className={`text-sm font-medium truncate ${t.completada ? "line-through text-surface-400" : "text-surface-800"}`}>{t.titulo}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px] text-surface-500">
                            {t.todoElDia ? (
                              <span>Todo el día</span>
                            ) : t.horaInicio ? (
                              <span>🕐 {t.horaInicio}{t.horaFin ? ` – ${t.horaFin}` : ""}</span>
                            ) : null}
                            {t.ubicacion && <span>📍 {t.ubicacion}</span>}
                            {t.asignado && <span>→ {t.asignado.nombre}</span>}
                            {t.predio && <span>📋 {t.predio.nombre}</span>}
                          </div>
                          {t.descripcion && <p className="text-[10px] text-surface-400 mt-1 line-clamp-2">{t.descripcion}</p>}
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium text-white ${PRIORIDAD_COLOR[t.prioridad]}`}>{t.prioridad}</span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium text-white" style={{ backgroundColor: cat.color }}>{cat.label}</span>
                            {t.esAsignada && !isModOrAdmin && <span className="text-[10px]" title="Asignada">🔒</span>}
                            {t.notificarPush && <span className="text-[10px]" title="Push activado">🔔</span>}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          {puedeEditar && (
                            <button onClick={() => openEdit(t)} className="text-[10px] text-surface-400 hover:text-surface-700" title="Editar">✏️</button>
                          )}
                          {puedeBorrar && (
                            <button onClick={() => handleDelete(t.id)} className="text-[10px] text-red-400 hover:text-red-600" title="Eliminar">🗑️</button>
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
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
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
                <div className="grid grid-cols-4 gap-1.5">
                  {Object.entries(CATEGORIAS).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => setForm({ ...form, categoria: k })}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] border transition-all
                        ${form.categoria === k ? "border-surface-400 bg-surface-100 font-medium" : "border-surface-200 hover:bg-surface-50"}`}>
                      <span>{v.icon}</span> {v.label}
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
                    <option value="BAJA">🔵 Baja</option>
                    <option value="MEDIA">🟡 Media</option>
                    <option value="ALTA">🔴 Alta</option>
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
                <label htmlFor="notificarPush2" className="text-xs text-surface-600">🔔 Notificaciones push</label>
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-surface-100">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 text-xs border border-surface-200 rounded-lg hover:bg-surface-50">Cancelar</button>
              <button onClick={handleSave} disabled={!form.titulo || !form.fecha}
                className="flex-1 py-2 bg-surface-800 text-white rounded-lg text-xs font-medium hover:bg-surface-700 disabled:opacity-50 transition-colors">
                {editingId ? "Guardar cambios" : "Crear evento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
