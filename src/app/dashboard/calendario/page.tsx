"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/hooks/useSession";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface TareaCalendario {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  horaInicio: string | null;
  prioridad: string;
  completada: boolean;
  notificarPush: boolean;
  esAsignada: boolean;
  creador: { id: string; nombre: string } | null;
  asignado: { id: string; nombre: string } | null;
  predio: { id: string; nombre: string } | null;
}

const PRIORIDAD_COLOR: Record<string, string> = {
  ALTA: "bg-red-500",
  MEDIA: "bg-yellow-500",
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

export default function CalendarioPage() {
  const { session, isModOrAdmin } = useSession();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [tasks, setTasks] = useState<TareaCalendario[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ titulo: "", descripcion: "", fecha: "", hora: "", prioridad: "MEDIA", asignadoId: "", notificarPush: true });
  const [users, setUsers] = useState<any[]>([]);

  const monthName = new Date(year, month).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  const grid = getMonthGrid(year, month);

  const load = useCallback(() => {
    const desde = new Date(year, month, 1).toISOString();
    const hasta = new Date(year, month + 1, 0).toISOString();
    fetch(`/api/calendario?desde=${desde}&hasta=${hasta}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setTasks(Array.isArray(data) ? data : []));
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isModOrAdmin) {
      fetch("/api/usuarios", { credentials: "include" })
        .then((r) => r.json())
        .then((data) => setUsers(Array.isArray(data) ? data : []));
    }
  }, [isModOrAdmin]);

  function prev() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function next() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  function tasksForDay(day: number) {
    return tasks.filter((t) => {
      const d = new Date(t.fecha);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
  }

  function openCreate(day?: number) {
    const d = day ? new Date(year, month, day) : new Date(year, month, today.getDate());
    setForm({ titulo: "", descripcion: "", fecha: d.toISOString().split("T")[0], hora: "", prioridad: "MEDIA", asignadoId: "", notificarPush: true });
    setShowCreate(true);
  }

  async function handleCreate() {
    const body: any = {
      titulo: form.titulo,
      fecha: form.fecha,
      prioridad: form.prioridad,
      notificarPush: form.notificarPush,
    };
    if (form.hora) body.horaInicio = form.hora;
    if (form.descripcion) body.descripcion = form.descripcion;
    if (form.asignadoId) body.asignadoId = form.asignadoId;

    const res = await fetch("/api/calendario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setShowCreate(false);
      load();
    }
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
    await fetch(`/api/calendario/${id}`, { method: "DELETE", credentials: "include" });
    load();
  }

  const dayTasks = selectedDay ? tasksForDay(selectedDay) : [];

  return (
    <div className="animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 mb-1">Calendario</h1>
          <p className="text-xs text-surface-400">Agenda de instalaciones y mantenimientos</p>
        </div>
        <button onClick={() => openCreate()} className="px-3 py-1.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 transition-colors">
          + Nueva tarea
        </button>
      </div>

      <div className="bg-white rounded-lg border border-surface-200 p-3 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prev} className="px-3 py-1.5 text-xs border border-surface-200 rounded-md hover:bg-surface-50 transition-colors">←</button>
          <h2 className="text-sm font-semibold text-surface-700 capitalize">{monthName}</h2>
          <button onClick={next} className="px-3 py-1.5 text-xs border border-surface-200 rounded-md hover:bg-surface-50 transition-colors">→</button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-px bg-surface-200 rounded-lg overflow-hidden">
          {DAYS.map((d) => (
            <div key={d} className="bg-surface-50 py-1.5 text-center text-[10px] font-medium text-surface-400 uppercase tracking-wider">{d}</div>
          ))}
          {grid.map((day, i) => {
            const dt = day ? tasksForDay(day) : [];
            const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            const isSelected = day === selectedDay;
            return (
              <div
                key={i}
                onClick={() => day && setSelectedDay(day)}
                className={`bg-white min-h-[48px] sm:min-h-[72px] p-1 sm:p-1.5 cursor-pointer transition-colors ${!day ? "bg-surface-50" : ""} ${isSelected ? "ring-1 ring-surface-400" : ""} ${isToday ? "bg-surface-50" : "hover:bg-surface-50"}`}
              >
                {day && (
                  <>
                    <span className={`text-[10px] font-medium ${isToday ? "text-surface-800 font-bold" : "text-surface-600"}`}>{day}</span>
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {dt.slice(0, 3).map((t) => (
                        <span key={t.id} className={`w-1.5 h-1.5 rounded-full ${t.completada ? "bg-green-400" : PRIORIDAD_COLOR[t.prioridad] || "bg-surface-300"}`} title={t.titulo} />
                      ))}
                      {dt.length > 3 && <span className="text-[9px] text-surface-400">+{dt.length - 3}</span>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Day detail */}
      {selectedDay && (
        <div className="mt-4 bg-white rounded-lg border border-surface-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-surface-800">{selectedDay} de {new Date(year, month).toLocaleDateString("es-AR", { month: "long" })}</h3>
            <button onClick={() => openCreate(selectedDay)} className="text-xs text-surface-500 hover:text-surface-700">+ Agregar</button>
          </div>
          {dayTasks.length === 0 ? (
            <p className="text-sm text-surface-400 py-4 text-center">Sin tareas este día</p>
          ) : (
            <div className="space-y-2">
              {dayTasks.map((t) => {
                const esPropia = t.creador?.id === session?.userId;
                const puedeBorrar = isModOrAdmin || (esPropia && !t.esAsignada);

                return (
                  <div key={t.id} className={`flex items-center gap-3 p-3 rounded-lg border ${t.completada ? "bg-green-50 border-green-200" : "bg-surface-50 border-surface-200"}`}>
                    <button onClick={() => toggleComplete(t.id, t.completada)} className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center text-xs ${t.completada ? "bg-green-500 border-green-500 text-white" : "border-surface-300"}`}>
                      {t.completada && "✓"}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm font-medium ${t.completada ? "line-through text-surface-400" : "text-surface-800"}`}>{t.titulo}</p>
                        {t.esAsignada && !isModOrAdmin && (
                          <span title="Tarea asignada por administrador" className="text-[10px]">🔒</span>
                        )}
                        {t.notificarPush && (
                          <span title="Notificaciones activadas" className="text-[10px]">🔔</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-surface-500">
                        {t.horaInicio && <span>{t.horaInicio}</span>}
                        {t.asignado && <span>→ {t.asignado.nombre}</span>}
                        {t.esAsignada && t.creador && <span className="text-surface-400">por {t.creador.nombre}</span>}
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium text-white ${PRIORIDAD_COLOR[t.prioridad]}`}>{t.prioridad}</span>
                      </div>
                    </div>
                    {puedeBorrar && (
                      <button onClick={() => handleDelete(t.id)} className="text-xs text-red-400 hover:text-red-600">✕</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[440px] max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-surface-800 mb-4">Nueva tarea</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-1">Título *</label>
                <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-1">Descripción</label>
                <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={2} className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-1">Fecha *</label>
                  <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-1">Hora</label>
                  <input type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-1">Prioridad</label>
                <select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400">
                  <option value="BAJA">Baja</option>
                  <option value="MEDIA">Media</option>
                  <option value="ALTA">Alta</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wider mb-1">Asignar a</label>
                {isModOrAdmin ? (
                  <select value={form.asignadoId} onChange={(e) => setForm({ ...form, asignadoId: e.target.value })} className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400">
                    <option value="">Sin asignar</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.rol})</option>)}
                  </select>
                ) : (
                  <p className="text-xs text-surface-400 py-2">Solo administradores pueden asignar tareas</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="notificarPush"
                  checked={form.notificarPush}
                  onChange={(e) => setForm({ ...form, notificarPush: e.target.checked })}
                  className="w-4 h-4 rounded border-surface-300 text-surface-800 focus:ring-surface-500"
                />
                <label htmlFor="notificarPush" className="text-xs text-surface-600">🔔 Habilitar notificaciones push</label>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2 text-xs border border-surface-200 rounded-md hover:bg-surface-50">Cancelar</button>
              <button onClick={handleCreate} disabled={!form.titulo || !form.fecha} className="flex-1 py-2 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 disabled:opacity-50">Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
