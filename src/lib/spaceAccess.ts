import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export type SpaceAccessSession = {
  userId: string;
  rol: string;
  nombre: string;
};

export async function expandSpaceIds(spaceIds: string[]) {
  if (spaceIds.length === 0) return [];

  const espacios = await prisma.espacioTrabajo.findMany({
    where: { activo: true },
    select: { id: true, parentId: true },
  });
  const byParent = new Map<string, string[]>();
  for (const espacio of espacios) {
    if (!espacio.parentId) continue;
    const children = byParent.get(espacio.parentId) || [];
    children.push(espacio.id);
    byParent.set(espacio.parentId, children);
  }

  const ids = new Set(spaceIds);
  const stack = [...spaceIds];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const childId of byParent.get(current) || []) {
      if (ids.has(childId)) continue;
      ids.add(childId);
      stack.push(childId);
    }
  }

  return Array.from(ids);
}

export async function getRestrictedSpaceIdsForSession(session: SpaceAccessSession) {
  if (session.rol === "ADMIN") return null;

  const userAccess = await prisma.accesoEspacio.findMany({
    where: { userId: session.userId },
    select: { espacioId: true },
  });
  if (userAccess.length > 0) {
    return expandSpaceIds(userAccess.map((access) => access.espacioId));
  }

  if (session.rol !== "MODERADOR" && session.rol !== "TECNICO") return null;

  const roleAccess = await prisma.accesoEspacioRol.findMany({
    where: { rol: session.rol as Role },
    select: { espacioId: true },
  });
  if (roleAccess.length > 0) {
    return expandSpaceIds(roleAccess.map((access) => access.espacioId));
  }

  return null;
}

export function canAccessSpaceId(spaceId: string | null | undefined, allowedSpaceIds: string[] | null) {
  if (allowedSpaceIds === null) return true;
  if (!spaceId) return false;
  return allowedSpaceIds.includes(spaceId);
}
