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
  /** Todos los permisos (para panel admin) */
  permisos: PermisoSeccion[];
  /** Actualizar permisos (solo admin) */
  guardarPermisos: (permisos: PermisoSeccion[]) => Promise<boolean>;
  loading: boolean;
}

// Secciones de monitoreo — siempre visibles para todos
const SECCIONES_MONITOREO = ["topologia", "switches", "aps", "appliance"];

export function usePermisos(): PermisosResult {
  const { session } = useSession();
  const [permisos, setPermisos] = useState<PermisoSeccion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/permisos", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { permisos: [] }))
      .then((d) => setPermisos(d.permisos || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const puedeVer = useCallback(
    (seccion: string): boolean => {
      // Monitoreo siempre visible
      if (SECCIONES_MONITOREO.includes(seccion)) return true;
      // Admin siempre puede todo
      if (!session || session.rol === "ADMIN") return true;
      // Buscar permiso específico
      const p = permisos.find((x) => x.seccion === seccion && x.rol === session.rol);
      // Si no hay configuración explícita, default: moderadores ven todo, técnicos ven lo básico
      if (!p) {
        if (session.rol === "MODERADOR") return true;
        // Técnicos por default ven: tareas, calendario, bandeja, instructivo, predios, chat
        return ["tareas", "calendario", "bandeja", "instructivo", "predios", "chat", "hospedajes", "actas"].includes(seccion);
      }
      return p.ver;
    },
    [session, permisos]
  );

  const puedeEditar = useCallback(
    (seccion: string): boolean => {
      if (SECCIONES_MONITOREO.includes(seccion)) return false;
      if (!session || session.rol === "ADMIN") return true;
      const p = permisos.find((x) => x.seccion === seccion && x.rol === session.rol);
      if (!p) {
        if (session.rol === "MODERADOR") return true;
        return ["tareas", "calendario"].includes(seccion);
      }
      return p.editar;
    },
    [session, permisos]
  );

  const puedeCrear = useCallback(
    (seccion: string): boolean => {
      if (SECCIONES_MONITOREO.includes(seccion)) return false;
      if (!session || session.rol === "ADMIN") return true;
      const p = permisos.find((x) => x.seccion === seccion && x.rol === session.rol);
      if (!p) {
        if (session.rol === "MODERADOR") return true;
        return ["tareas", "calendario"].includes(seccion);
      }
      return p.crear;
    },
    [session, permisos]
  );

  const puedeEliminar = useCallback(
    (seccion: string): boolean => {
      if (SECCIONES_MONITOREO.includes(seccion)) return false;
      if (!session || session.rol === "ADMIN") return true;
      const p = permisos.find((x) => x.seccion === seccion && x.rol === session.rol);
      if (!p) {
        if (session.rol === "MODERADOR") return true;
        return false;
      }
      return p.eliminar;
    },
    [session, permisos]
  );

  const puedeExportar = useCallback(
    (seccion: string): boolean => {
      if (SECCIONES_MONITOREO.includes(seccion)) return false;
      if (!session || session.rol === "ADMIN") return true;
      const p = permisos.find((x) => x.seccion === seccion && x.rol === session.rol);
      if (!p) {
        if (session.rol === "MODERADOR") return true;
        return false;
      }
      return p.exportar;
    },
    [session, permisos]
  );

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
          // Merge con los existentes
          setPermisos((prev) => {
            const map = new Map(prev.map((p) => [`${p.seccion}-${p.rol}`, p]));
            for (const p of data.permisos) map.set(`${p.seccion}-${p.rol}`, p);
            return Array.from(map.values());
          });
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    []
  );

  return { puedeVer, puedeCrear, puedeEditar, puedeEliminar, puedeExportar, permisos, guardarPermisos, loading };
}
