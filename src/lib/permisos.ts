/**
 * Lógica pura de resolución de permisos por sección.
 *
 * Centraliza las reglas que antes estaban duplicadas entre el hook
 * `usePermisos` (acceso real) y la página de administración de permisos
 * (defaults mostrados). Es pura (sin React ni fetch) para poder testearla.
 */

export type CampoPermiso = "ver" | "crear" | "editar" | "eliminar" | "exportar";

export interface PermisoSeccion {
  seccion: string;
  rol: string;
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
  exportar: boolean;
}

export interface PermisoSeccionUsuario {
  seccion: string;
  userId: string;
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
  exportar: boolean;
}

export interface SessionLike {
  userId?: string;
  rol?: string;
}

// Secciones de monitoreo — siempre visibles (solo lectura) para todos los roles.
export const SECCIONES_MONITOREO = ["topologia", "switches", "aps", "appliance"];

// Secciones restringidas — ocultas por defecto para no-admin.
export const SECCIONES_RESTRINGIDAS = ["permisos", "auditoria", "papelera"];

// Defaults de TÉCNICO.
export const TECNICO_VER_DEFAULT = [
  "tareas", "mis-tareas", "calendario", "bandeja", "instructivo",
  "predios", "chat", "hospedajes", "actas", "anuncios",
];
export const TECNICO_EDIT_DEFAULT = ["tareas", "calendario"];

export const CAMPOS_PERMISO: CampoPermiso[] = ["ver", "crear", "editar", "eliminar", "exportar"];

/** Permiso por defecto (sin override explícito) para un rol + sección + campo. */
export function getDefaultPermiso(seccion: string, rol: string, campo: CampoPermiso): boolean {
  if (rol === "ADMIN") return true;
  if (rol === "MODERADOR") {
    if (SECCIONES_RESTRINGIDAS.includes(seccion)) return false;
    return true; // ver/crear/editar/eliminar/exportar
  }
  // TECNICO
  if (campo === "ver") return TECNICO_VER_DEFAULT.includes(seccion);
  if (campo === "crear" || campo === "editar") return TECNICO_EDIT_DEFAULT.includes(seccion);
  return false;
}

/** Objeto de permiso por defecto completo para un rol + sección. */
export function getDefaultPermisoSeccion(seccion: string, rol: string): PermisoSeccion {
  return {
    seccion,
    rol,
    ver: getDefaultPermiso(seccion, rol, "ver"),
    crear: getDefaultPermiso(seccion, rol, "crear"),
    editar: getDefaultPermiso(seccion, rol, "editar"),
    eliminar: getDefaultPermiso(seccion, rol, "eliminar"),
    exportar: getDefaultPermiso(seccion, rol, "exportar"),
  };
}

/**
 * Resuelve si la sesión puede realizar `campo` en `seccion`.
 * Prioridad: monitoreo → admin → override por usuario → permiso por rol → default.
 */
export function resolvePermiso(
  seccion: string,
  campo: CampoPermiso,
  ctx: {
    session: SessionLike | null | undefined;
    permisos: PermisoSeccion[];
    permisosUsuario: PermisoSeccionUsuario[];
  }
): boolean {
  const { session, permisos, permisosUsuario } = ctx;

  if (SECCIONES_MONITOREO.includes(seccion)) return campo === "ver";
  if (!session || session.rol === "ADMIN") return true;

  // Override por usuario (tiene prioridad sobre el rol)
  if (session.userId) {
    const pu = permisosUsuario.find((x) => x.seccion === seccion && x.userId === session.userId);
    if (pu) return pu[campo];
  }

  // Permiso por rol
  const pr = permisos.find((x) => x.seccion === seccion && x.rol === session.rol);
  if (pr) return pr[campo];

  // Default por rol
  return getDefaultPermiso(seccion, session.rol || "TECNICO", campo);
}
