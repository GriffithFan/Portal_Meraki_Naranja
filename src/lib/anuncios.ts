import { prisma } from "@/lib/prisma";

/**
 * IDs de los usuarios activos que forman la audiencia de un anuncio.
 * rolesDestino vacío = todos los usuarios activos.
 */
export async function getDestinatariosAnuncio(
  rolesDestino: string[],
  excludeUserId?: string
): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      activo: true,
      ...(rolesDestino.length > 0 ? { rol: { in: rolesDestino as never } } : {}),
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/**
 * Cláusula where de visibilidad de anuncios para un usuario no gestor:
 * activos, no expirados y cuya audiencia incluya su rol.
 */
export function buildAnuncioVisibleWhere(rol: string, ahora = new Date()) {
  return {
    activo: true,
    AND: [
      { OR: [{ fechaExpiracion: null }, { fechaExpiracion: { gt: ahora } }] },
      { OR: [{ rolesDestino: { isEmpty: true } }, { rolesDestino: { has: rol } }] },
    ],
  };
}
