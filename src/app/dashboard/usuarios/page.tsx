"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/hooks/useSession";

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: "ADMIN" | "MODERADOR" | "TECNICO";
  esMesa?: boolean;
  passwordPlain?: string;
}

interface Delegacion {
  id: string;
  delegador: { id: string; nombre: string; email: string; rol: string };
  delegado: { id: string; nombre: string; email: string; rol: string };
  notas: string | null;
  activo: boolean;
  createdAt: string;
}

interface EspacioSimple {
  id: string;
  nombre: string;
  parentId: string | null;
  children?: EspacioSimple[];
}

interface AccesoEspacio {
  id: string;
  userId: string;
  espacioId: string;
  user: { id: string; nombre: string; email: string; rol: string };
  espacio: { id: string; nombre: string; parentId: string | null };
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
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  // Crear usuario
  const [showCrear, setShowCrear] = useState(false);
  const [crearNombre, setCrearNombre] = useState("");
  const [crearEmail, setCrearEmail] = useState("");
  const [crearPassword, setCrearPassword] = useState("");
  const [crearRol, setCrearRol] = useState<Usuario["rol"]>("TECNICO");
  const [crearEsMesa, setCrearEsMesa] = useState(false);
  const [crearError, setCrearError] = useState<string | null>(null);
  const [savingCrear, setSavingCrear] = useState(false);

  // Editar usuario (expandido)
  const [editPassword, setEditPassword] = useState("");
  const [editEsMesa, setEditEsMesa] = useState(false);
  const [editNombre, setEditNombre] = useState("");

  // Delegaciones
  const [delegaciones, setDelegaciones] = useState<Delegacion[]>([]);
  const [loadingDeleg, setLoadingDeleg] = useState(false);
  const [showDelegModal, setShowDelegModal] = useState(false);
  const [delegadorId, setDelegadorId] = useState("");
  const [delegadoId, setDelegadoId] = useState("");
  const [delegNotas, setDelegNotas] = useState("");
  const [savingDeleg, setSavingDeleg] = useState(false);
  const [delegError, setDelegError] = useState<string | null>(null);

  // Acceso a Espacios
  const [accesos, setAccesos] = useState<AccesoEspacio[]>([]);
  const [espacios, setEspacios] = useState<EspacioSimple[]>([]);
  const [showAccesoModal, setShowAccesoModal] = useState(false);
  const [accesoUserId, setAccesoUserId] = useState("");
  const [accesoEspacioIds, setAccesoEspacioIds] = useState<Set<string>>(new Set());
  const [savingAcceso, setSavingAcceso] = useState(false);
  const [accesoError, setAccesoError] = useState<string | null>(null);

  const cargarDelegaciones = async () => {
    setLoadingDeleg(true);
    try {
      const r = await fetch("/api/delegaciones", { credentials: "include" });
      if (r.ok) setDelegaciones(await r.json());
    } catch { /* ignore */ }
    setLoadingDeleg(false);
  };

  const cargarAccesos = async () => {
    try {
      const r = await fetch("/api/accesos-espacio", { credentials: "include" });
      if (r.ok) setAccesos(await r.json());
    } catch { /* ignore */ }
  };

  const cargarEspacios = async () => {
    try {
      const r = await fetch("/api/espacios", { credentials: "include" });
      if (r.ok) {
        const data = await r.json();
        const flatten = (nodes: EspacioSimple[]): EspacioSimple[] => {
          const result: EspacioSimple[] = [];
          for (const n of nodes) {
            result.push(n);
            if (n.children) result.push(...flatten(n.children));
          }
          return result;
        };
        setEspacios(flatten(data.espacios || []));
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetch("/api/usuarios", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setUsuarios)
      .catch(() => setUsuarios([]))
      .finally(() => setLoading(false));
    cargarDelegaciones();
    cargarAccesos();
    cargarEspacios();
  }, []);

  const abrirEdicion = (u: Usuario) => {
    if (!isAdmin) return;
    if (u.id === session?.userId) return;
    setEditando(u);
    setNuevoRol(u.rol);
    setEditPassword("");
    setEditEsMesa(u.esMesa || false);
    setEditNombre(u.nombre);
    setError(null);
  };

  const guardarRol = async () => {
    if (!editando) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { userId: editando.id };
      if (nuevoRol !== editando.rol) body.rol = nuevoRol;
      if (editEsMesa !== (editando.esMesa || false)) body.esMesa = editEsMesa;
      if (editNombre.trim() && editNombre.trim() !== editando.nombre) body.nombre = editNombre.trim();
      if (editPassword.trim()) body.password = editPassword.trim();

      const res = await fetch("/api/usuarios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
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

  const crearUsuario = async () => {
    setSavingCrear(true);
    setCrearError(null);
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          nombre: crearNombre.trim(),
          email: crearEmail.trim(),
          password: crearPassword.trim(),
          rol: crearRol,
          esMesa: crearEsMesa,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al crear usuario");
      }
      const nuevo: Usuario = await res.json();
      setUsuarios(prev => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setShowCrear(false);
      setCrearNombre("");
      setCrearEmail("");
      setCrearPassword("");
      setCrearRol("TECNICO");
      setCrearEsMesa(false);
    } catch (e) {
      setCrearError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSavingCrear(false);
    }
  };

  const desactivarUsuario = async (u: Usuario) => {
    if (!confirm(`¿Desactivar a ${u.nombre}?`)) return;
    try {
      const res = await fetch("/api/usuarios", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: u.id }),
      });
      if (res.ok) {
        setUsuarios(prev => prev.filter(x => x.id !== u.id));
      }
    } catch { /* ignore */ }
  };

  const togglePassword = (id: string) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
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

  const abrirAccesoModal = (u: Usuario) => {
    setAccesoUserId(u.id);
    const espaciosDelUsuario = accesos.filter(a => a.userId === u.id).map(a => a.espacioId);
    setAccesoEspacioIds(new Set(espaciosDelUsuario));
    setAccesoError(null);
    setShowAccesoModal(true);
  };

  const toggleEspacioAcceso = (espacioId: string) => {
    setAccesoEspacioIds(prev => {
      const next = new Set(prev);
      if (next.has(espacioId)) next.delete(espacioId);
      else next.add(espacioId);
      return next;
    });
  };

  const guardarAccesos = async () => {
    setSavingAcceso(true);
    setAccesoError(null);
    try {
      const res = await fetch("/api/accesos-espacio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: accesoUserId, espacioIds: Array.from(accesoEspacioIds) }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al guardar");
      }
      setShowAccesoModal(false);
      await cargarAccesos();
    } catch (e) {
      setAccesoError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSavingAcceso(false);
    }
  };

  const quitarRestricciones = async (userId: string) => {
    try {
      await fetch(`/api/accesos-espacio?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      await cargarAccesos();
    } catch { /* ignore */ }
  };

  // Agrupar accesos por usuario
  const accesosPorUsuario = accesos.reduce<Record<string, AccesoEspacio[]>>((acc, a) => {
    if (!acc[a.userId]) acc[a.userId] = [];
    acc[a.userId].push(a);
    return acc;
  }, {});

  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 mb-1">Usuarios</h1>
          <p className="text-xs text-surface-400">Administración de usuarios y roles</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setShowCrear(true); setCrearError(null); }}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            + Crear usuario
          </button>
        )}
      </div>

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
                  <div
                    key={u.id}
                    className="p-3 rounded-lg border border-surface-150 bg-white"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`${cfg.color} w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0`}>
                        {getIniciales(u.nombre)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-surface-800 truncate">{u.nombre}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${cfg.bg}`}>{u.rol}</span>
                          {u.esMesa && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 bg-blue-50 text-blue-700 border-blue-200">Mesa</span>}
                          {esMiUsuario && <span className="text-[10px] text-surface-400">(tú)</span>}
                        </div>
                        <p className="text-xs text-surface-500 mt-0.5 truncate">{u.email}</p>
                        {isAdmin && u.passwordPlain && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] text-surface-400">Pass:</span>
                            <span className="text-xs font-mono text-surface-600">
                              {showPasswords[u.id] ? u.passwordPlain : "••••••••"}
                            </span>
                            <button onClick={() => togglePassword(u.id)} className="text-surface-400 hover:text-primary-600">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                {showPasswords[u.id] ? (
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                                ) : (
                                  <>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                  </>
                                )}
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {isAdmin && !esMiUsuario && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-surface-100">
                        <button onClick={() => abrirEdicion(u)} className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                          Editar
                        </button>
                        <span className="text-surface-200">|</span>
                        <button onClick={() => desactivarUsuario(u)} className="text-xs text-red-500 hover:text-red-600 font-medium">
                          Desactivar
                        </button>
                      </div>
                    )}
                  </div>
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
                    {isAdmin && <th className="text-left px-2.5 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">Contraseña</th>}
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
                          {u.esMesa && <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium border bg-blue-50 text-blue-700 border-blue-200">Mesa</span>}
                        </td>
                        {isAdmin && (
                          <td className="px-2.5 py-2.5">
                            {u.passwordPlain ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[12px] text-surface-600">
                                  {showPasswords[u.id] ? u.passwordPlain : "••••••••"}
                                </span>
                                <button onClick={() => togglePassword(u.id)} className="text-surface-400 hover:text-primary-600 transition-colors">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    {showPasswords[u.id] ? (
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                                    ) : (
                                      <>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                      </>
                                    )}
                                  </svg>
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-surface-300 italic">Sin registrar</span>
                            )}
                          </td>
                        )}
                        <td className="px-2.5 py-2.5">
                          {isAdmin && !esMiUsuario ? (
                            <div className="flex items-center gap-2">
                              <button onClick={() => abrirEdicion(u)} className="text-xs text-primary-600 hover:text-primary-700 hover:underline font-medium">
                                Editar
                              </button>
                              <button onClick={() => desactivarUsuario(u)} className="text-xs text-red-500 hover:text-red-600 hover:underline font-medium">
                                Desactivar
                              </button>
                            </div>
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

      {/* Sección Acceso a Espacios (solo admin) */}
      {isAdmin && (
        <div className="bg-white rounded-lg border border-surface-200 p-3 sm:p-6 mt-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-surface-800">Acceso a espacios</h2>
              <p className="text-[10px] text-surface-400 mt-0.5">Controla qué listas de tareas puede ver cada usuario. Sin restricción = ve todo.</p>
            </div>
            <button
              onClick={() => { setAccesoUserId(""); setAccesoEspacioIds(new Set()); setAccesoError(null); setShowAccesoModal(true); }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              + Configurar
            </button>
          </div>

          {Object.keys(accesosPorUsuario).length === 0 ? (
            <p className="text-xs text-surface-400 text-center py-6">Todos los usuarios ven todos los espacios (sin restricciones).</p>
          ) : (
            <div className="flex flex-col gap-2">
              {Object.entries(accesosPorUsuario).map(([uid, userAccesos]) => {
                const u = userAccesos[0]?.user;
                if (!u) return null;
                const cfg = ROL_CONFIG[u.rol] || ROL_CONFIG.TECNICO;
                return (
                  <div key={uid} className="flex items-center gap-3 p-3 rounded-lg border border-surface-150 bg-surface-50">
                    <div className={`${cfg.color} w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0`}>
                      {getIniciales(u.nombre)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap text-sm">
                        <span className="font-medium text-surface-800">{u.nombre}</span>
                        <span className="text-surface-400">solo ve:</span>
                        {userAccesos.map(a => (
                          <span key={a.espacioId} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            {a.espacio.nombre}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => abrirAccesoModal({ id: uid, nombre: u.nombre, email: u.email, rol: u.rol as Usuario["rol"] })}
                        className="p-1.5 rounded-md text-surface-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                        title="Editar accesos"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => quitarRestricciones(uid)}
                        className="p-1.5 rounded-md text-surface-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Quitar restricciones (ve todo)"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal configurar acceso a espacios */}
      {showAccesoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAccesoModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-5 animate-fade-in-up max-h-[80vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-surface-800 mb-1">Acceso a espacios</h3>
            <p className="text-xs text-surface-400 mb-4">
              Selecciona los espacios que el usuario podrá ver. Sin selección = ve todo.
            </p>

            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">Usuario</label>
                <select
                  value={accesoUserId}
                  onChange={e => {
                    setAccesoUserId(e.target.value);
                    const userAcc = accesos.filter(a => a.userId === e.target.value).map(a => a.espacioId);
                    setAccesoEspacioIds(new Set(userAcc));
                  }}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none"
                >
                  <option value="">Seleccionar usuario...</option>
                  {usuarios.filter(u => u.rol !== "ADMIN" && u.id !== session?.userId).map(u => (
                    <option key={u.id} value={u.id}>{u.nombre} ({u.rol})</option>
                  ))}
                </select>
              </div>

              {accesoUserId && (
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-2">Espacios permitidos</label>
                  <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto border border-surface-150 rounded-lg p-2">
                    {espacios.map(esp => (
                      <label key={esp.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-surface-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={accesoEspacioIds.has(esp.id)}
                          onChange={() => toggleEspacioAcceso(esp.id)}
                          className="rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className={`text-sm ${esp.parentId ? "ml-3 text-surface-600" : "font-medium text-surface-800"}`}>
                          {esp.parentId ? "└ " : ""}{esp.nombre}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-surface-400 mt-1.5">
                    {accesoEspacioIds.size === 0 ? "Sin selección: el usuario verá todos los espacios" : `${accesoEspacioIds.size} espacio(s) seleccionado(s)`}
                  </p>
                </div>
              )}
            </div>

            {accesoError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2 mb-3">{accesoError}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowAccesoModal(false)}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-surface-200 text-surface-600 hover:bg-surface-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={guardarAccesos}
                disabled={savingAcceso || !accesoUserId}
                className="flex-1 px-3 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {savingAcceso ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
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

      {/* Modal crear usuario */}
      {showCrear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCrear(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-5 animate-fade-in-up">
            <h3 className="text-base font-semibold text-surface-800 mb-1">Crear usuario</h3>
            <p className="text-xs text-surface-400 mb-4">Ingresa los datos del nuevo usuario</p>

            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">Nombre</label>
                <input value={crearNombre} onChange={e => setCrearNombre(e.target.value)} placeholder="Nombre completo"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-surface-200 focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">Email</label>
                <input value={crearEmail} onChange={e => setCrearEmail(e.target.value)} placeholder="email@thnet.com" type="email"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-surface-200 focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">Contraseña</label>
                <input value={crearPassword} onChange={e => setCrearPassword(e.target.value)} placeholder="Mínimo 6 caracteres"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-surface-200 focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">Rol</label>
                <select value={crearRol} onChange={e => setCrearRol(e.target.value as Usuario["rol"])}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-surface-200 bg-white focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none">
                  {ROLES.map(r => <option key={r} value={r}>{ROL_CONFIG[r].label}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={crearEsMesa} onChange={e => setCrearEsMesa(e.target.checked)}
                  className="rounded border-surface-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-surface-700">Es Mesa de ayuda</span>
              </label>
            </div>

            {crearError && <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2 mb-3">{crearError}</p>}

            <div className="flex gap-2">
              <button onClick={() => setShowCrear(false)}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-surface-200 text-surface-600 hover:bg-surface-50 transition-colors">
                Cancelar
              </button>
              <button onClick={crearUsuario} disabled={savingCrear || !crearNombre.trim() || !crearEmail.trim() || !crearPassword.trim()}
                className="flex-1 px-3 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium">
                {savingCrear ? "Creando..." : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal edición de usuario */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditando(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-5 animate-fade-in-up max-h-[85vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-surface-800 mb-1">Editar usuario</h3>
            <p className="text-xs text-surface-400 mb-4">
              Editando a <strong className="text-surface-600">{editando.nombre}</strong>
            </p>

            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">Nombre</label>
                <input value={editNombre} onChange={e => setEditNombre(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-surface-200 focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none" />
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">Nueva contraseña <span className="text-surface-400 font-normal">(dejar vacío para no cambiar)</span></label>
                <input value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="Nueva contraseña..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-surface-200 focus:border-primary-400 focus:ring-1 focus:ring-primary-400 outline-none font-mono" />
                {editando.passwordPlain && (
                  <p className="text-[10px] text-surface-400 mt-1">Actual: <span className="font-mono">{editando.passwordPlain}</span></p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-600 mb-2">Rol</label>
                <div className="flex flex-col gap-2">
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
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editEsMesa} onChange={e => setEditEsMesa(e.target.checked)}
                  className="rounded border-surface-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-surface-700">Es Mesa de ayuda</span>
              </label>
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
                disabled={saving}
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
