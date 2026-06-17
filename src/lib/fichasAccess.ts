/**
 * Candado de acceso a la base de Personal (fichas de técnicos y contratistas).
 *
 * El acceso está FIJADO EN CÓDIGO: solo estas cuentas pueden ver y editar las
 * fichas. No es configurable desde el front (no pasa por la matriz de Permisos),
 * así que ninguna otra cuenta —ni siquiera nuevas ADMIN— tiene acceso.
 *
 * Se usa por email porque el email es único e inmutable desde el front (el PATCH
 * de usuarios no permite cambiarlo), por lo que una cuenta nueva no puede tomar
 * estos emails. Para cambiar quién entra hay que editar esta lista y desplegar.
 */
export const FICHAS_EMAILS = ["griffith@thnet.com", "fernando@thnet.com"] as const;

export function tieneAccesoFichas(email?: string | null): boolean {
  return !!email && (FICHAS_EMAILS as readonly string[]).includes(email.trim().toLowerCase());
}

/** Secciones (apartados) válidas para notas y archivos de una ficha. */
export const FICHA_SECCIONES = [
  "nombre",
  "dni",
  "direccion",
  "telefono",
  "carnet",
  "seguro",
  "monotributo",
  "auto",
  "proyecto",
  "general",
] as const;

export type FichaSeccion = (typeof FICHA_SECCIONES)[number];

export function esSeccionValida(seccion: string): seccion is FichaSeccion {
  return (FICHA_SECCIONES as readonly string[]).includes(seccion);
}
