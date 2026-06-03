import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import { getAssignedSpaceIdsForSession } from "@/lib/predioVisibility";

interface SessionLike {
  userId: string;
  rol: string;
}

function collectDescendants(rootIds: string[], spaces: Array<{ id: string; parentId: string | null }>) {
  const byParent = new Map<string, string[]>();
  for (const space of spaces) {
    if (!space.parentId) continue;
    const children = byParent.get(space.parentId) || [];
    children.push(space.id);
    byParent.set(space.parentId, children);
  }

  const ids = new Set(rootIds);
  const stack = [...rootIds];
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

export async function getRestrictedSpaceIdsForSession(session: SessionLike): Promise<string[] | null> {
  if (isAdmin(session.rol)) return null;

  const accesos = await prisma.accesoEspacio.findMany({
    where: { userId: session.userId },
    select: { espacioId: true },
  });

  const accesosRol = await prisma.accesoEspacioRol.findMany({
    where: { rol: session.rol },
    select: { espacioId: true },
  });

  const assignedSpaceIds = await getAssignedSpaceIdsForSession(session);

  if (session.rol === "TECNICO") {
    if (accesos.length === 0 && accesosRol.length === 0) {
      return assignedSpaceIds || [];
    }

    const spaces = await prisma.espacioTrabajo.findMany({
      where: { activo: true },
      select: { id: true, parentId: true },
    });
    const configuredIds = collectDescendants(
      Array.from(new Set([
        ...accesos.map((acceso) => acceso.espacioId),
        ...accesosRol.map((acceso) => acceso.espacioId),
      ])),
      spaces,
    );

    return (assignedSpaceIds || []).filter((spaceId) => configuredIds.includes(spaceId));
  }

  if (accesos.length === 0 && accesosRol.length === 0) return null;

  const rootIds = Array.from(new Set([
    ...accesos.map((acceso) => acceso.espacioId),
    ...accesosRol.map((acceso) => acceso.espacioId),
  ]));
  const spaces = await prisma.espacioTrabajo.findMany({
    where: { activo: true },
    select: { id: true, parentId: true },
  });
  return collectDescendants(rootIds, spaces);
}

export function canAccessSpaceId(espacioId: string, allowedSpaceIds: string[]): boolean;
export function canAccessSpaceId(session: SessionLike, espacioId: string): Promise<boolean>;
export function canAccessSpaceId(arg1: SessionLike | string, arg2: string | string[]) {
  if (typeof arg1 === "string") {
    return Array.isArray(arg2) && arg2.includes(arg1);
  }
  return getRestrictedSpaceIdsForSession(arg1).then((restrictedIds) => {
    if (!restrictedIds) return true;
    return restrictedIds.includes(String(arg2));
  });
}
