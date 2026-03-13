"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/hooks/useSession";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Permiso {
  seccion: string;
  rol: string;
  ver: boolean;
  editar: boolean;
}

const SECCIONES = [
  { clave: "tareas", label: "Tareas", grupo: "Gestión" },
  { clave: "calendario", label: "Calendario", grupo: "Gestión" },
  { clave: "stock", label: "Stock", grupo: "Gestión" },
  { clave: "importar", label: "Importar", grupo: "Gestión" },
  { clave: "bandeja", label: "Bandeja", grupo: "Comunicación" },
  { clave: "actividad", label: "Actividad", grupo: "Comunicación" },
  { clave: "instructivo", label: "Instructivo", grupo: "Recursos" },
  { clave: "actas", label: "Actas", grupo: "Recursos" },
  { clave: "facturas", label: "Facturas", grupo: "Recursos" },
  { clave: "usuarios", label: "Usuarios", grupo: "Administración" },
];

const ROLES_EDITABLES = ["MODERADOR", "TECNICO"] as const;

const ROL_COLORS: Record<string, string> = {
  MODERADOR: "text-amber-700 bg-amber-50 border-amber-200",
  TECNICO: "text-teal-700 bg-teal-50 border-teal-200",
};

export default function PermisosPage() {
  const { isAdmin } = useSession();
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fetchPermisos = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/permisos", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setPermisos(data.permisos || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPermisos(); }, [fetchPermisos]);

  const getPermiso = (seccion: string, rol: string): { ver: boolean; editar: boolean } => {
    const found = permisos.find((p) => p.seccion === seccion && p.rol === rol);
    if (found) return { ver: found.ver, editar: found.editar };
    // Defaults
    if (rol === "MODERADOR") return { ver: true, editar: true };
    if (rol === "TECNICO") {
      const verDefault = ["tareas", "calendario", "bandeja", "instructivo"].includes(seccion);
      const editarDefault = ["tareas", "calendario"].includes(seccion);
      return { ver: verDefault, editar: editarDefault };
    }
    return { ver: false, editar: false };
  };

  const togglePermiso = (seccion: string, rol: string, campo: "ver" | "editar") => {
    setDirty(true);
    setPermisos((prev) => {
      const idx = prev.findIndex((p) => p.seccion === seccion && p.rol === rol);
      const current = getPermiso(seccion, rol);
      let newVer = current.ver;
      let newEditar = current.editar;

      if (campo === "ver") {
        newVer = !newVer;
        if (!newVer) newEditar = false; // Can't edit without seeing
      } else {
        newEditar = !newEditar;
        if (newEditar) newVer = true; // Must see to edit
      }

      const updated: Permiso = { seccion, rol, ver: newVer, editar: newEditar };
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      }
      return [...prev, updated];
    });
  };

  const guardar = async () => {
    setSaving(true);
    const payload = SECCIONES.flatMap((s) =>
      ROLES_EDITABLES.map((rol) => {
        const p = getPermiso(s.clave, rol);
        return { seccion: s.clave, rol, ver: p.ver, editar: p.editar };
      })
    );

    const res = await fetch("/api/permisos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ permisos: payload }),
    });
    if (res.ok) {
      const data = await res.json();
      setPermisos(data.permisos || []);
      setDirty(false);
      setToast("Permisos guardados correctamente");
      setTimeout(() => setToast(null), 3000);
    }
    setSaving(false);
  };

  if (!isAdmin) {
    return (
      <div className="animate-fade-in-up flex items-center justify-center py-20">
        <p className="text-sm text-surface-400">Solo administradores pueden gestionar permisos.</p>
      </div>
    );
  }

  const gruposSet = new Set(SECCIONES.map((s) => s.grupo));
  const grupos: string[] = [];
  gruposSet.forEach((g) => grupos.push(g));

  return (
    <div className="animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 tracking-tight">Permisos por sección</h1>
          <p className="text-surface-400 text-xs mt-0.5">
            Configura qué pueden ver y editar los roles Moderador y Técnico. Admin siempre tiene acceso total.
          </p>
        </div>
        <button
          onClick={guardar}
          disabled={!dirty || saving}
          className="px-4 py-1.5 text-xs font-medium rounded-md bg-surface-800 text-white hover:bg-surface-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="mb-4 px-3 py-2 bg-emerald-50 text-emerald-700 text-xs rounded-lg border border-emerald-200 animate-fade-in-up">
          {toast}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
          <span className="ml-3 text-xs text-surface-400">Cargando permisos...</span>
        </div>
      ) : (
        <>
          {/* Desktop matrix */}
          <div className="hidden md:block bg-white rounded-lg border border-surface-200 overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="border-b border-surface-200 bg-surface-50">
                <tr>
                  <th className="text-left px-4 py-3 uppercase text-[10px] tracking-wider text-surface-400 font-medium w-[180px]">Sección</th>
                  {ROLES_EDITABLES.map((rol) => (
                    <th key={rol} className="text-center px-3 py-3" colSpan={2}>
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${ROL_COLORS[rol]}`}>
                        {rol}
                      </span>
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-surface-100">
                  <th />
                  {ROLES_EDITABLES.map((rol) => (
                    <th key={`${rol}-sub`} className="contents">
                      <th className="text-center px-3 py-1.5 text-[10px] text-surface-400 font-medium">Ver</th>
                      <th className="text-center px-3 py-1.5 text-[10px] text-surface-400 font-medium border-r border-surface-100 last:border-r-0">Editar</th>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grupos.map((grupo) => (
                  <>
                    <tr key={`g-${grupo}`}>
                      <td colSpan={1 + ROLES_EDITABLES.length * 2} className="px-4 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-surface-400 bg-surface-50/50">
                        {grupo}
                      </td>
                    </tr>
                    {SECCIONES.filter((s) => s.grupo === grupo).map((sec, idx) => (
                      <tr key={sec.clave} className={`hover:bg-surface-50 ${idx % 2 ? "bg-surface-50/30" : ""}`}>
                        <td className="px-4 py-2 text-surface-700 font-medium">{sec.label}</td>
                        {ROLES_EDITABLES.map((rol) => {
                          const p = getPermiso(sec.clave, rol);
                          return (
                            <td key={`${sec.clave}-${rol}`} className="contents">
                              <td className="text-center px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={p.ver}
                                  onChange={() => togglePermiso(sec.clave, rol, "ver")}
                                  className="w-3.5 h-3.5 rounded border-surface-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                />
                              </td>
                              <td className="text-center px-3 py-2 border-r border-surface-100 last:border-r-0">
                                <input
                                  type="checkbox"
                                  checked={p.editar}
                                  onChange={() => togglePermiso(sec.clave, rol, "editar")}
                                  className="w-3.5 h-3.5 rounded border-surface-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                />
                              </td>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {grupos.map((grupo) => (
              <div key={grupo}>
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-surface-400 mb-2 px-1">{grupo}</h3>
                {SECCIONES.filter((s) => s.grupo === grupo).map((sec) => (
                  <div key={sec.clave} className="bg-white rounded-lg border border-surface-200 p-3 mb-2">
                    <p className="text-xs font-semibold text-surface-800 mb-2">{sec.label}</p>
                    <div className="space-y-2">
                      {ROLES_EDITABLES.map((rol) => {
                        const p = getPermiso(sec.clave, rol);
                        return (
                          <div key={rol} className="flex items-center justify-between gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${ROL_COLORS[rol]}`}>{rol}</span>
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={p.ver}
                                  onChange={() => togglePermiso(sec.clave, rol, "ver")}
                                  className="w-3.5 h-3.5 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-[11px] text-surface-500">Ver</span>
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={p.editar}
                                  onChange={() => togglePermiso(sec.clave, rol, "editar")}
                                  className="w-3.5 h-3.5 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-[11px] text-surface-500">Editar</span>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <p className="text-[10px] text-surface-400 mt-4 px-1">
            Las secciones de Monitoreo (Topología, Switches, APs, Appliance) son siempre visibles para todos. El rol Admin siempre tiene acceso total.
          </p>
        </>
      )}
    </div>
  );
}
