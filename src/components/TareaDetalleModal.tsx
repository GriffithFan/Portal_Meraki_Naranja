"use client";

import { useState, useEffect, useCallback } from "react";
import { IconX, IconChevron, IconCheck, IconClock } from "@/components/ui/Icons";
import { toast } from "sonner";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── CopyButton ──────────────────────────────
function CopyButton({ value }: { value: string }) {
  if (!value || value === "—") return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value).then(() => toast.success("Copiado"));
      }}
      className="ml-1 p-0.5 text-surface-300 hover:text-surface-500 transition-colors shrink-0"
      title="Copiar"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
    </button>
  );
}

// ── Props ──────────────────────────────────────
interface TareaDetalleModalProps {
  tareaId: string;
  estados: any[];
  isModOrAdmin: boolean;
  onClose: () => void;
  onUpdated?: () => void; // callback para refrescar la lista
}

export default function TareaDetalleModal({
  tareaId,
  estados,
  isModOrAdmin,
  onClose,
  onUpdated,
}: TareaDetalleModalProps) {
  const [tarea, setTarea] = useState<any>(null);
  const [actividades, setActividades] = useState<any[]>([]);
  const [comentarios, setComentarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [estadoDropdown, setEstadoDropdown] = useState(false);
  const [nuevoComentario, setNuevoComentario] = useState("");
  const [activeTab, setActiveTab] = useState<"info" | "actividad">("info");

  const formatDateTime = (d: string) =>
    new Date(d).toLocaleDateString("es-AR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  // ── Cargar datos ──────────────────────────────
  const fetchDetail = useCallback(async () => {
    setLoading(true);

    const [tareaRes, actRes, comRes] = await Promise.all([
      fetch(`/api/tareas/${tareaId}`, { credentials: "include" }),
      fetch(`/api/actividad?entidad=PREDIO&entidadId=${tareaId}&limite=50`, { credentials: "include" }),
      fetch(`/api/comentarios?predioId=${tareaId}`, { credentials: "include" }),
    ]);

    if (tareaRes.ok) setTarea(await tareaRes.json());
    if (actRes.ok) {
      const d = await actRes.json();
      setActividades(d.actividades || []);
    }
    if (comRes.ok) {
      const d = await comRes.json();
      setComentarios(d.comentarios || []);
    }

    setLoading(false);
  }, [tareaId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // ── ESC key handler ──────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // ── Cambiar estado ──────────────────────────────
  async function changeEstado(estadoId: string) {
    const newEstado = estados.find((e) => e.id === estadoId);
    const res = await fetch(`/api/tareas/${tareaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ estadoId }),
    });
    if (res.ok) {
      setTarea((prev: any) => ({ ...prev, estadoId, estado: newEstado }));
      onUpdated?.();
    }
    setEstadoDropdown(false);
  }

  // ── Guardar campo inline ──────────────────────────────
  async function saveField(field: string, value: any) {
    const res = await fetch(`/api/tareas/${tareaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      setTarea((prev: any) => ({ ...prev, [field]: value }));
      onUpdated?.();
    }
  }

  // ── Guardar comentario ──────────────────────────────
  async function saveComentario() {
    if (!nuevoComentario.trim()) return;
    const res = await fetch("/api/comentarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ contenido: nuevoComentario, predioId: tareaId }),
    });
    if (res.ok) {
      const newCom = await res.json();
      setComentarios((prev) => [newCom, ...prev]);
      setNuevoComentario("");
    }
  }

  // ── Campos editables ──────────────────────────────
  const fields = [
    { label: "Predio", field: "nombre", editable: false },
    { label: "Incidencia", field: "incidencias", editable: true },
    { label: "Ámbito", field: "ambito", editable: true },
    { label: "CUE", field: "cue", editable: true },
    { label: "CUE_Predio", field: "cuePredio", editable: true },
    { label: "Departamento", field: "ciudad", editable: true },
    { label: "Dirección", field: "direccion", editable: true },
    { label: "Equipo", field: "equipoAsignado", editable: true },
    { label: "DESDE", field: "fechaDesde", type: "date", editable: true },
    { label: "HASTA", field: "fechaHasta", type: "date", editable: true },
    { label: "GPS_Predio", field: "gpsPredio", editable: true },
    { label: "LAC-R", field: "lacR", type: "badge", editable: true },
    { label: "Provincia", field: "provincia", editable: true },
  ];

  // ── Render ──────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col animate-fade-in-up"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-surface-100 flex items-start justify-between shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-surface-400 uppercase tracking-wider mb-1">Detalle de Tarea</p>
            <h2 className="text-base font-semibold text-surface-800 truncate flex items-center gap-1">
              {loading ? "Cargando..." : tarea?.nombre || tarea?.incidencias || "Sin nombre"}
              {!loading && tarea && <CopyButton value={tarea.nombre || tarea.incidencias || ""} />}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-surface-100 rounded-md transition-colors ml-3 shrink-0"
          >
            <IconX className="w-4 h-4 text-surface-400" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-5 h-5 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" />
          </div>
        ) : tarea ? (
          <>
            {/* Tabs */}
            <div className="flex border-b border-surface-100 px-5 shrink-0">
              <button
                onClick={() => setActiveTab("info")}
                className={`text-xs font-medium px-3 py-2.5 border-b-2 transition-colors ${
                  activeTab === "info"
                    ? "border-primary-600 text-primary-600"
                    : "border-transparent text-surface-400 hover:text-surface-600"
                }`}
              >
                Información
              </button>
              <button
                onClick={() => setActiveTab("actividad")}
                className={`text-xs font-medium px-3 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === "actividad"
                    ? "border-primary-600 text-primary-600"
                    : "border-transparent text-surface-400 hover:text-surface-600"
                }`}
              >
                Actividad
                {(actividades.length + comentarios.length) > 0 && (
                  <span className="bg-surface-100 text-surface-500 text-[10px] px-1.5 py-0.5 rounded-full tabular-nums">
                    {actividades.length + comentarios.length}
                  </span>
                )}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === "info" ? (
                <div className="px-5 py-4 space-y-4">
                  {/* Estado */}
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-surface-400 uppercase tracking-wider w-20 shrink-0">Estado</span>
                    <div className="relative">
                      <button
                        onClick={() => setEstadoDropdown(!estadoDropdown)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border"
                        style={{
                          borderColor: tarea.estado?.color ? `${tarea.estado.color}40` : "#e2e8f0",
                          color: tarea.estado?.color || "#64748b",
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: tarea.estado?.color || "#94a3b8" }}
                        />
                        {tarea.estado?.nombre || "Sin estado"}
                        <IconChevron className="w-2.5 h-2.5" />
                      </button>

                      {estadoDropdown && (
                        <div className="absolute top-full left-0 mt-1 bg-white border border-surface-200 rounded-lg shadow-lg py-1 min-w-[180px] z-20 animate-fade-in-up">
                          <div className="max-h-48 overflow-y-auto">
                            {estados.map((e) => (
                              <button
                                key={e.id}
                                onClick={() => changeEstado(e.id)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-50 transition-colors text-left"
                              >
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: e.color }}
                                />
                                <span className="text-surface-700">{e.nombre}</span>
                                {tarea.estadoId === e.id && (
                                  <IconCheck className="w-3.5 h-3.5 text-surface-500 ml-auto" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Campos */}
                  <div className="border border-surface-200 rounded-lg">
                    <div className="divide-y divide-surface-50">
                      {fields.map((f) => (
                        <div key={f.field} className="flex items-center gap-3 px-3 py-2">
                          <span className="text-[11px] text-surface-400 w-24 shrink-0">{f.label}</span>
                          <div className="flex items-center flex-1 min-w-0">
                          {isModOrAdmin && f.editable ? (
                            f.type === "badge" ? (
                              <select
                                value={tarea[f.field] || ""}
                                onChange={(e) => saveField(f.field, e.target.value)}
                                className="text-xs border-0 bg-transparent focus:ring-0 p-0 cursor-pointer text-surface-700"
                              >
                                <option value="">—</option>
                                <option value="SI">SI</option>
                                <option value="PEDIDO">Pedido</option>
                                <option value="NO">NO</option>
                              </select>
                            ) : f.type === "date" ? (
                              <input
                                type="date"
                                value={
                                  tarea[f.field]
                                    ? new Date(tarea[f.field]).toISOString().split("T")[0]
                                    : ""
                                }
                                onChange={(e) => saveField(f.field, e.target.value)}
                                className="text-xs border-0 bg-transparent focus:ring-0 p-0 cursor-pointer text-surface-700"
                              />
                            ) : (
                              <input
                                type="text"
                                defaultValue={tarea[f.field] || ""}
                                onBlur={(e) => {
                                  if (e.target.value !== (tarea[f.field] || "")) {
                                    saveField(f.field, e.target.value);
                                  }
                                }}
                                className="flex-1 text-xs border-0 bg-transparent focus:ring-0 p-0 text-surface-700"
                                placeholder="—"
                              />
                            )
                          ) : (
                            <span className="text-xs text-surface-600">
                              {f.type === "date" && tarea[f.field]
                                ? new Date(tarea[f.field]).toLocaleDateString("es-AR")
                                : tarea[f.field] || "—"}
                            </span>
                          )}
                          <CopyButton value={
                            f.type === "date" && tarea[f.field]
                              ? new Date(tarea[f.field]).toLocaleDateString("es-AR")
                              : tarea[f.field] || ""
                          } />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Notas */}
                  <div className="border border-surface-200 rounded-lg">
                    <div className="px-3 py-2 border-b border-surface-100">
                      <span className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">
                        Notas
                      </span>
                    </div>
                    {isModOrAdmin ? (
                      <textarea
                        defaultValue={tarea.notas || ""}
                        onBlur={(e) => {
                          if (e.target.value !== (tarea.notas || "")) {
                            saveField("notas", e.target.value);
                          }
                        }}
                        placeholder="Agregar notas..."
                        rows={3}
                        className="w-full text-xs border-0 bg-transparent p-3 focus:ring-0 resize-none text-surface-700 placeholder:text-surface-300"
                      />
                    ) : (
                      <p className="text-xs text-surface-600 p-3">{tarea.notas || "Sin notas"}</p>
                    )}
                  </div>

                  {/* Asignaciones */}
                  {tarea.asignaciones?.length > 0 && (
                    <div className="border border-surface-200 rounded-lg">
                      <div className="px-3 py-2 border-b border-surface-100">
                        <span className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">
                          Asignados
                        </span>
                      </div>
                      <div className="p-3 flex flex-wrap gap-1.5">
                        {tarea.asignaciones.map((a: any) => (
                          <span
                            key={a.id}
                            className="inline-flex items-center gap-1 bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full text-[11px] font-medium"
                          >
                            <span className="w-4 h-4 rounded-full bg-primary-200 flex items-center justify-center text-[9px] font-bold">
                              {a.usuario?.nombre?.charAt(0) || "?"}
                            </span>
                            {a.usuario?.nombre || "Usuario"}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Info de creación */}
                  <div className="flex items-center gap-4 text-[10px] text-surface-400 pt-2">
                    <span>Creado: {formatDateTime(tarea.createdAt)}</span>
                    <span>Actualizado: {formatDateTime(tarea.updatedAt)}</span>
                  </div>
                </div>
              ) : (
                /* ── Tab: Actividad ── */
                <div className="px-5 py-4 space-y-4">
                  {/* Comentar */}
                  <div className="flex gap-2">
                    <textarea
                      value={nuevoComentario}
                      onChange={(e) => setNuevoComentario(e.target.value)}
                      placeholder="Escribe un comentario..."
                      rows={2}
                      className="flex-1 text-xs border border-surface-200 rounded-lg p-2.5 focus:outline-none focus:border-primary-400 resize-none placeholder:text-surface-300"
                    />
                  </div>
                  {nuevoComentario.trim() && (
                    <div className="flex justify-end -mt-2">
                      <button
                        onClick={saveComentario}
                        className="px-3 py-1 bg-primary-600 text-white rounded-md text-[11px] font-medium hover:bg-primary-700 transition-colors"
                      >
                        Comentar
                      </button>
                    </div>
                  )}

                  {/* Timeline */}
                  <div className="space-y-0">
                    {/* Mezclar comentarios + actividades, ordenar por fecha desc */}
                    {[
                      ...comentarios.map((c) => ({ ...c, _type: "comentario" as const })),
                      ...actividades.map((a) => ({ ...a, _type: "actividad" as const })),
                    ]
                      .sort(
                        (a, b) =>
                          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                      )
                      .map((item) => (
                        <div key={item.id} className="flex gap-3 py-2.5 border-b border-surface-50 last:border-0">
                          {item._type === "comentario" ? (
                            <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-[10px] font-bold text-primary-600 shrink-0 mt-0.5">
                              {item.usuario?.nombre?.charAt(0) || "?"}
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-surface-100 flex items-center justify-center shrink-0 mt-0.5">
                              <IconClock className="w-3 h-3 text-surface-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-xs font-medium text-surface-700">
                                {item.usuario?.nombre || "Sistema"}
                              </span>
                              {item._type === "actividad" && (
                                <span className="text-[10px] text-surface-400 bg-surface-50 px-1.5 py-0.5 rounded">
                                  {item.accion}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-surface-500 mt-0.5 break-words">
                              {item._type === "comentario"
                                ? item.contenido
                                : item.descripcion || item.accion}
                            </p>
                            <p className="text-[10px] text-surface-400 mt-1">
                              {formatDateTime(item.createdAt)}
                            </p>
                          </div>
                        </div>
                      ))}

                    {actividades.length === 0 && comentarios.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-surface-300">
                        <IconClock className="w-8 h-8 mb-2" />
                        <p className="text-xs">Sin actividad registrada</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex justify-center py-16 text-surface-400 text-sm">
            Tarea no encontrada
          </div>
        )}
      </div>
    </div>
  );
}
