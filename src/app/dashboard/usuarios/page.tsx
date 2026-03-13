"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/hooks/useSession";

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: "ADMIN" | "MODERADOR" | "TECNICO";
}

interface Delegacion {
  id: string;
  delegador: { id: string; nombre: string; email: string; rol: string };
  delegado: { id: string; nombre: string; email: string; rol: string };
  notas: string | null;
  activo: boolean;
  createdAt: string;
}

const ROL_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  ADMIN: { color: "bg-primary-600", bg: "bg-primary-50 text-primary-700 border-primary-200", label: "Admin" },
  MODERADOR: { color: "bg-amber-500", bg: "bg-amber-50 text-amber-700 border-amber-200", label: "Moderador" },
  TECNICO: { color: "bg-teal-500", bg: "bg-teal-50 text-teal-700 border-teal-200", label: "Técnico" },
};

const ROLES: Usuario["rol"][] = ["ADMIN", "MODERADOR", "TECNICO"];

function getIniciales(nombre: string) {
  return nombre.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
}

export default function UsuariosPage() {
  const { session, isAdmin } = useSession();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [nuevoRol, setNuevoRol] = useState<Usuario["rol"]>("TECNICO");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Delegaciones
  const [delegaciones, setDelegaciones] = useState<Delegacion[]>([]);
  const [loadingDeleg, setLoadingDeleg] = useState(false);
  const [showDelegModal, setShowDelegModal] = useState(false);
  const [delegadorId, setDelegadorId] = useState("");
  const [delegadoId, setDelegadoId] = useState("");
  const [delegNotas, setDelegNotas] = useState("");
  const [savingDeleg, setSavingDeleg] = useState(false);
  const [delegError, setDelegError] = useState<string | null>(null);

  const cargarDelegaciones = async () => {
    setLoadingDeleg(true);
    try {
      const r = await fetch("/api/delegaciones", { credentials: "include" });
      if (r.ok) setDelegaciones(await r.json());
    } catch { /* ignore */ }
    setLoadingDeleg(false);
  };

  useEffect(() => {
    fetch("/api/usuarios", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setUsuarios)
      .catch(() => setUsuarios([]))
      .finally(() => setLoading(false));
    cargarDelegaciones();
  }, []);

  const abrirEdicion = (u: Usuario) => {
    if (!isAdmin) return;
    if (u.id === session?.userId) return;
    setEditando(u);
    setNuevoRol(u.rol);
    setError(null);
  };

  const guardarRol = async () => {
    if (!editando) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/usuarios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: editando.id, rol: nuevoRol }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al actualizar");
      }
      const updated: Usuario = await res.json();
      setUsuarios(prev => prev.map(u => u.id === updated.id ? updated : u));
      setEditando(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  const crearDelegacion = async () => {
    if (!delegadorId || !delegadoId) return;
    setSavingDeleg(true);
    setDelegError(null);
    try {
      const res = await fetch("/api/delegaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ delegadorId, delegadoId, notas: delegNotas || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al crear delegación");
      }
      setShowDelegModal(false);
      setDelegadorId("");
      setDelegadoId("");
      setDelegNotas("");
      await cargarDelegaciones();
    } catch (e) {
      setDelegError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSavingDeleg(false);
    }
  };

  const eliminarDelegacion = async (id: string) => {
    try {
      await fetch(`/api/delegaciones?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      await cargarDelegaciones();
    } catch { /* ignore */ }
  };

  return (
    <div className="animate-fade-in-up">
      <h1 className="text-xl font-semibold text-surface-800 mb-1">Usuarios</h1>
      <p className="text-xs text-surface-400 mb-4 sm:mb-6">Administración de usuarios y roles</p>

      <div className="bg-white rounded-lg border border-surface-200 p-3 sm:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
            <span className="ml-3 text-sm text-surface-400">Cargando usuarios...</span>
          </div>
        ) : usuarios.length === 0 ? (
          <p className="text-sm text-surface-400 text-center py-8">No se encontraron usuarios.</p>
        ) : (
          <>
            {/* Mobile: tarjetas */}
            <div className="flex flex-col gap-3 md:hidden">
              {usuarios.map((u) => {
                const cfg = ROL_CONFIG[u.rol] || ROL_CONFIG.TECNICO;
                const esMiUsuario = u.id === session?.userId;
                return (
                  <button
                    key={u.id}
                    onClick={() => abrirEdicion(u)}
                    disabled={!isAdmin || esMiUsuario}
                    className="flex items-center gap-3 p-3 rounded-lg border border-surface-150 hover:bg-surface-50 active:bg-surface-100 transition-colors text-left disabled:opacity-60 disabled:cursor-default w-full"
                  >
                    <div className={`${cfg.color} w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0`}>
                      {getIniciales(u.nombre)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-surface-800 truncate">{u.nombre}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${cfg.bg}`}>{u.rol}</span>
                        {esMiUsuario && <span className="text-[10px] text-surface-400">(tú)</span>}
                      </div>
                      <p className="text-xs text-surface-500 mt-0.5 truncate">{u.email}</p>
                    </div>
                    {isAdmin && !esMiUsuario && (
                      <svg className="w-4 h-4 text-surface-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Desktop: tabla */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="border-b border-surface-200">
                  <tr>
                    <th className="text-left px-2.5 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">Usuario</th>
                    <th className="text-left px-2.5 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">Email</th>
                    <th className="text-left px-2.5 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">Rol</th>
                    <th className="text-left px-2.5 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {usuarios.map((u) => {
                    const cfg = ROL_CONFIG[u.rol] || ROL_CONFIG.TECNICO;
                    const esMiUsuario = u.id === session?.userId;
                    return (
                      <tr key={u.id} className="hover:bg-surface-50">
                        <td className="px-2.5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`${cfg.color} w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0`}>
                              {getIniciales(u.nombre)}
                            </div>
                            <span className="font-medium text-surface-800 text-[12px]">
                              {u.nombre}
                              {esMiUsuario && <span className="text-surface-400 font-normal ml-1">(tú)</span>}
                            </span>
                          </div>
                        </td>
                        <td className="px-2.5 py-2.5 text-surface-600 text-[12px]">{u.email}</td>
                        <td className="px-2.5 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${cfg.bg}`}>{u.rol}</span>
                        </td>
                        <td className="px-2.5 py-2.5">
                          {isAdmin && !esMiUsuario ? (
                            <button onClick={() => abrirEdicion(u)} className="text-xs text-primary-600 hover:text-primary-700 hover:underline font-medium">
                              Cambiar rol
                            </button>
                          ) : (
                            <span className="text-xs text-surface-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="text-[10px] text-surface-400 mt-4 text-center">
          {usuarios.length} usuario{usuarios.length !== 1 ? "s" : ""} activo{usuarios.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Sección Delegaciones (solo admin) */}
      {isAdmin && (
        <div className="bg-white rounded-lg border border-surface-200 p-3 sm:p-6 mt-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-surface-800">Delegaciones de visibilidad</h2>
              <p className="text-[10px] text-surface-400 mt-0.5">Permite que un usuario vea las tareas de otro</p>
            </div>
            <button
              onClick={() => { setShowDelegModal(true); setDelegError(null); }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              + Nueva
            </button>
          </div>

          {loadingDeleg ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-5 h-5 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : delegaciones.length === 0 ? (
            <p className="text-xs text-surface-400 text-center py-6">No hay delegaciones configuradas.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {delegaciones.map((d) => (
                <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg border border-surface-150 bg-surface-50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap text-sm">
                      <span className="font-medium text-primary-700">{d.delegado.nombre}</span>
                      <span className="text-surface-400">puede ver tareas de</span>
                      <span className="font-medium text-teal-700">{d.delegador.nombre}</span>
                    </div>
                    {d.notas && <p className="text-[10px] text-surface-400 mt-0.5 truncate">{d.notas}</p>}
                  </div>
                  <button
                    onClick={() => eliminarDelegacion(d.id)}
                    className="shrink-0 p-1.5 rounded-md text-surface-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Eliminar delegación"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal nueva delegación */}
      {showDelegModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDelegModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-5 animate-fade-in-up">
            <h3 className="text-base font-semibold text-surface-800 mb-1">Nueva delegación</h3>
            <p className="text-xs text-surface-400 mb-4">
              Permitir que un usuario vea las tareas asignadas a otro
            </p>

            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">Puede ver tareas de:</label>
                <select
                  value={delegadorId}
                  onChange={e => setDelegadorId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none"
                >
                  <option value="">Seleccionar usuario...</option>
                  {usuarios.filter(u => u.id !== delegadoId).map(u => (
                    <option key={u.id} value={u.id}>{u.nombre} ({u.rol})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">Usuario que podrá ver:</label>
                <select
                  value={delegadoId}
                  onChange={e => setDelegadoId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none"
                >
                  <option value="">Seleccionar usuario...</option>
                  {usuarios.filter(u => u.id !== delegadorId).map(u => (
                    <option key={u.id} value={u.id}>{u.nombre} ({u.rol})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">Notas (opcional)</label>
                <input
                  value={delegNotas}
                  onChange={e => setDelegNotas(e.target.value)}
                  placeholder="Ej: Instructor/aprendiz"
                  maxLength={200}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-surface-200 focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none"
                />
              </div>
            </div>

            {delegError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2 mb-3">{delegError}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowDelegModal(false)}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-surface-200 text-surface-600 hover:bg-surface-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={crearDelegacion}
                disabled={savingDeleg || !delegadorId || !delegadoId}
                className="flex-1 px-3 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {savingDeleg ? "Guardando..." : "Crear delegación"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal edición de rol */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditando(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-5 animate-fade-in-up">
            <h3 className="text-base font-semibold text-surface-800 mb-1">Cambiar rol</h3>
            <p className="text-xs text-surface-400 mb-4">
              Cambiando rol de <strong className="text-surface-600">{editando.nombre}</strong>
            </p>

            <div className="flex flex-col gap-2 mb-4">
              {ROLES.map(rol => {
                const cfg = ROL_CONFIG[rol];
                const selected = nuevoRol === rol;
                return (
                  <button
                    key={rol}
                    onClick={() => setNuevoRol(rol)}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                      selected ? "border-primary-500 bg-primary-50" : "border-surface-200 hover:border-surface-300"
                    }`}
                  >
                    <div className={`${cfg.color} w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0`}>
                      {rol[0]}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-surface-800">{cfg.label}</div>
                      <div className="text-[10px] text-surface-400">
                        {rol === "ADMIN" && "Acceso total al sistema"}
                        {rol === "MODERADOR" && "Gestión sin configuración"}
                        {rol === "TECNICO" && "Operaciones de campo"}
                      </div>
                    </div>
                    {selected && (
                      <svg className="w-5 h-5 text-primary-600 ml-auto shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2 mb-3">{error}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setEditando(null)}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-surface-200 text-surface-600 hover:bg-surface-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={guardarRol}
                disabled={saving || nuevoRol === editando.rol}
                className="flex-1 px-3 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
