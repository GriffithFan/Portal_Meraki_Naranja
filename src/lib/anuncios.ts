import { prisma } from "@/lib/prisma";

/**
 * IDs de los usuarios activos que forman la audiencia de un anuncio.
 * - Si `usuariosDestino` no está vacío, manda esa lista (selección manual).
 * - Si no, se usa `rolesDestino` (vacío = todos los usuarios activos).
 */
export async function getDestinatariosAnuncio(
  rolesDestino: string[],
  usuariosDestino: string[],
  excludeUserId?: string
): Promise<string[]> {
  const baseWhere = usuariosDestino.length > 0
    ? { id: { in: usuariosDestino } }
    : (rolesDestino.length > 0 ? { rol: { in: rolesDestino as never } } : {});

  const users = await prisma.user.findMany({
    where: {
      activo: true,
      ...baseWhere,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/**
 * Fragmento `where` que indica que un usuario está dentro de la audiencia de un anuncio.
 * (selección manual por usuario, o por rol cuando no hay selección manual).
 */
export function anuncioAudienceWhere(userId: string, rol: string) {
  return {
    OR: [
      { usuariosDestino: { has: userId } },
      {
        AND: [
          { usuariosDestino: { isEmpty: true } },
          { OR: [{ rolesDestino: { isEmpty: true } }, { rolesDestino: { has: rol } }] },
        ],
      },
    ],
  };
}

/**
 * Cláusula where de visibilidad de anuncios para un usuario no gestor:
 * activos, ya publicados (programación), no expirados y cuya audiencia lo incluya.
 */
export function buildAnuncioVisibleWhere(rol: string, userId: string, ahora = new Date()) {
  return {
    activo: true,
    AND: [
      { OR: [{ fechaPublicacion: null }, { fechaPublicacion: { lte: ahora } }] },
      { OR: [{ fechaExpiracion: null }, { fechaExpiracion: { gt: ahora } }] },
      anuncioAudienceWhere(userId, rol),
    ],
  };
}
