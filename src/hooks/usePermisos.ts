"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "./useSession";
import { resolvePermiso, type PermisoSeccion, type PermisoSeccionUsuario, type CampoPermiso } from "@/lib/permisos";

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

  // Resolver permiso: delega en la lógica pura compartida (src/lib/permisos.ts)
  const resolve = useCallback(
    (seccion: string, campo: CampoPermiso): boolean =>
      resolvePermiso(seccion, campo, { session, permisos, permisosUsuario }),
    [session, permisos, permisosUsuario]
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
