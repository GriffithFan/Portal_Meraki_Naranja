"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "./useSession";

interface PermisoSeccion {
  seccion: string;
  rol: string;
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
  exportar: boolean;
}

interface PermisoSeccionUsuario {
  seccion: string;
  userId: string;
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
  exportar: boolean;
}

interface PermisosResult {
  /** Puede el usuario actual ver esta sección? */
  puedeVer: (seccion: string) => boolean;
  /** Puede el usuario actual crear en esta sección? */
  puedeCrear: (seccion: string) => boolean;
  /** Puede el usuario actual editar en esta sección? */
  puedeEditar: (seccion: string) => boolean;
  /** Puede el usuario actual eliminar en esta sección? */
  puedeEliminar: (seccion: string) => boolean;
  /** Puede el usuario actual exportar en esta sección? */
  puedeExportar: (seccion: string) => boolean;
  /** Todos los permisos por rol (para panel admin) */
  permisos: PermisoSeccion[];
  /** Todos los permisos por usuario (para panel admin) */
  permisosUsuario: PermisoSeccionUsuario[];
  /** Actualizar permisos (solo admin) */
  guardarPermisos: (permisos: PermisoSeccion[]) => Promise<boolean>;
  /** Actualizar permisos por usuario (solo admin) */
  guardarPermisosUsuario: (permisosUsuario: PermisoSeccionUsuario[]) => Promise<boolean>;
  loading: boolean;
}

// Secciones de monitoreo — siempre visibles para todos
const SECCIONES_MONITOREO = ["topologia", "switches", "aps", "appliance"];

// Secciones restringidas — por defecto ocultas para no-admin
const SECCIONES_RESTRINGIDAS = ["permisos", "auditoria", "papelera"];

export function usePermisos(): PermisosResult {
  const { session } = useSession();
  const [permisos, setPermisos] = useState<PermisoSeccion[]>([]);
  const [permisosUsuario, setPermisosUsuario] = useState<PermisoSeccionUsuario[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/permisos", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { permisos: [], permisosSeccionUsuario: [] }))
      .then((d) => {
        setPermisos(d.permisos || []);
        setPermisosUsuario(d.permisosSeccionUsuario || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Buscar permiso per-user (override) para una sección + campo
  const getPermisoUsuario = useCallback(
    (seccion: string, campo: "ver" | "crear" | "editar" | "eliminar" | "exportar"): boolean | null => {
      if (!session?.userId) return null;
      const p = permisosUsuario.find((x) => x.seccion === seccion && x.userId === session.userId);
      if (!p) return null; // No hay override per-user
      return p[campo];
    },
    [session, permisosUsuario]
  );

  // Buscar permiso por rol para una sección + campo, con fallback a defaults
  const getPermisoRol = useCallback(
    (seccion: string, campo: "ver" | "crear" | "editar" | "eliminar" | "exportar"): boolean => {
      if (!session) return false;
      const p = permisos.find((x) => x.seccion === seccion && x.rol === session.rol);
      if (p) return p[campo];
      // Defaults
      if (session.rol === "MODERADOR") {
        if (SECCIONES_RESTRINGIDAS.includes(seccion)) return false;
        return campo === "ver" || campo === "crear" || campo === "editar" || campo === "eliminar" || campo === "exportar";
      }
      // TECNICO defaults
      if (campo === "ver") return ["tareas", "mis-tareas", "calendario", "bandeja", "instructivo", "predios", "chat", "hospedajes", "actas"].includes(seccion);
      if (campo === "crear" || campo === "editar") return ["tareas", "calendario"].includes(seccion);
      return false;
    },
    [session, permisos]
  );

  // Resolver permiso: monitoreo → admin → per-user override → per-rol → default
  const resolve = useCallback(
    (seccion: string, campo: "ver" | "crear" | "editar" | "eliminar" | "exportar"): boolean => {
      if (SECCIONES_MONITOREO.includes(seccion)) return campo === "ver";
      if (!session || session.rol === "ADMIN") return true;
      // Per-user override tiene prioridad
      const userOverride = getPermisoUsuario(seccion, campo);
      if (userOverride !== null) return userOverride;
      // Fallback al permiso por rol
      return getPermisoRol(seccion, campo);
    },
    [session, getPermisoUsuario, getPermisoRol]
  );

  const puedeVer = useCallback((seccion: string) => resolve(seccion, "ver"), [resolve]);
  const puedeCrear = useCallback((seccion: string) => resolve(seccion, "crear"), [resolve]);
  const puedeEditar = useCallback((seccion: string) => resolve(seccion, "editar"), [resolve]);
  const puedeEliminar = useCallback((seccion: string) => resolve(seccion, "eliminar"), [resolve]);
  const puedeExportar = useCallback((seccion: string) => resolve(seccion, "exportar"), [resolve]);

  const guardarPermisos = useCallback(
    async (nuevosPermisos: PermisoSeccion[]): Promise<boolean> => {
      try {
        const res = await fetch("/api/permisos", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ permisos: nuevosPermisos }),
        });
        if (res.ok) {
          const data = await res.json();
          setPermisos(data.permisos || []);
          if (data.permisosSeccionUsuario) setPermisosUsuario(data.permisosSeccionUsuario);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    []
  );

  const guardarPermisosUsuario = useCallback(
    async (nuevos: PermisoSeccionUsuario[]): Promise<boolean> => {
      try {
        const res = await fetch("/api/permisos", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ permisosSeccionUsuario: nuevos }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.permisos) setPermisos(data.permisos);
          setPermisosUsuario(data.permisosSeccionUsuario || []);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    []
  );

  return { puedeVer, puedeCrear, puedeEditar, puedeEliminar, puedeExportar, permisos, permisosUsuario, guardarPermisos, guardarPermisosUsuario, loading };
}
