/**
 * Configuración compartida (cliente y servidor) del tablero de anuncios.
 * No importa prisma ni código server-only.
 */

export const CATEGORIAS_ANUNCIO = ["GENERAL", "OPERACIONES", "RRHH", "CAPACITACION", "SISTEMAS"] as const;
export type CategoriaAnuncio = (typeof CATEGORIAS_ANUNCIO)[number];

export const CATEGORIA_META: Record<CategoriaAnuncio, { label: string; dot: string }> = {
  GENERAL:      { label: "General",      dot: "bg-surface-400" },
  OPERACIONES:  { label: "Operaciones",  dot: "bg-blue-500" },
  RRHH:         { label: "RR.HH.",       dot: "bg-emerald-500" },
  CAPACITACION: { label: "Capacitación", dot: "bg-violet-500" },
  SISTEMAS:     { label: "Sistemas",     dot: "bg-amber-500" },
};

export const ROLES_DESTINO = ["TECNICO", "MODERADOR", "ADMIN"] as const;
export type RolDestino = (typeof ROLES_DESTINO)[number];

export const ROL_LABEL: Record<RolDestino, string> = {
  TECNICO: "Técnicos",
  MODERADOR: "Moderadores",
  ADMIN: "Administradores",
};

export function esCategoriaValida(value: unknown): value is CategoriaAnuncio {
  return typeof value === "string" && (CATEGORIAS_ANUNCIO as readonly string[]).includes(value);
}

/** Normaliza una lista de roles destino: solo roles válidos, sin duplicados. */
export function sanitizeRolesDestino(value: unknown): RolDestino[] {
  if (!Array.isArray(value)) return [];
  const out: RolDestino[] = [];
  for (const item of value) {
    if (typeof item === "string" && (ROLES_DESTINO as readonly string[]).includes(item) && !out.includes(item as RolDestino)) {
      out.push(item as RolDestino);
    }
  }
  // Si seleccionaron todos los roles, equivale a "todos" (lista vacía)
  return out.length === ROLES_DESTINO.length ? [] : out;
}

/** Etiqueta legible de la audiencia de un anuncio. */
export function audienciaLabel(rolesDestino: string[] | null | undefined): string {
  if (!rolesDestino || rolesDestino.length === 0) return "Todos";
  return rolesDestino
    .map((r) => ROL_LABEL[r as RolDestino] || r)
    .join(", ");
}
