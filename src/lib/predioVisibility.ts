import { isAdmin, isModOrAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type SessionLike = {
  userId: string;
  rol: string;
};

type EstadoRecord = {
  id: string;
  nombre: string;
  clave: string;
  color?: string;
};

type PermisoEstadoRecord = {
  estadoId: string;
  rol: string;
  visible: boolean;
  estado?: EstadoRecord;
};

type PermisoEstadoUsuarioRecord = {
  estadoId: string;
  userId: string;
  visible: boolean;
  estado?: EstadoRecord;
};

function normalizeStateLabel(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isDefaultHiddenStateForTecnico(estado: Pick<EstadoRecord, "nombre" | "clave">) {
  const nombre = normalizeStateLabel(estado.nombre);
  const clave = normalizeStateLabel(estado.clave);
  const label = `${clave} ${nombre}`.trim();

  if (!label) return false;
  if (label.includes("no conforme")) return false;

  return ["conforme", "cerrad", "finaliz", "bloque", "blocke", "instalado"]
    .some((token) => label.includes(token));
}

export async function getDelegatedVisibleUserIds(session: SessionLike) {
  const delegaciones = await prisma.delegacion.findMany({
    where: { delegadoId: session.userId, activo: true },
    select: { delegadorId: true },
  });

  return [session.userId, ...delegaciones.map((delegacion) => delegacion.delegadorId)];
}

export function buildAssignedPredioVisibilityClause(userIds: string[]) {
  return {
    asignaciones: { some: { userId: { in: userIds } } },
  };
}

export function appendAndClause(where: Record<string, unknown>, clause: Record<string, unknown>) {
  const current = Array.isArray(where.AND) ? where.AND : [];
  where.AND = [...current, clause];
}

export function appendVisibleEstadosClause(where: Record<string, unknown>, hiddenEstadoIds: string[]) {
  if (hiddenEstadoIds.length === 0) return;
  appendAndClause(where, {
    OR: [
      { estadoId: { notIn: hiddenEstadoIds } },
      { estadoId: null },
    ],
  });
}

export async function getHiddenEstadoIdsForSession(session: SessionLike, entidad = "PREDIO") {
  if (isAdmin(session.rol)) return [] as string[];

  const [estados, permisosRol, permisosUsuario] = await Promise.all([
    prisma.estadoConfig.findMany({
      where: { entidad, activo: true },
      select: { id: true, nombre: true, clave: true, color: true },
      orderBy: { orden: "asc" },
    }),
    prisma.permisoEstado.findMany({
      where: { rol: session.rol as "ADMIN" | "MODERADOR" | "TECNICO" },
      select: { estadoId: true, visible: true },
    }),
    prisma.permisoEstadoUsuario.findMany({
      where: { userId: session.userId },
      select: { estadoId: true, visible: true },
    }),
  ]);

  const hidden = new Set<string>();

  if (session.rol === "TECNICO") {
    for (const estado of estados) {
      if (isDefaultHiddenStateForTecnico(estado)) hidden.add(estado.id);
    }
  }

  for (const permiso of permisosRol) {
    if (permiso.visible) hidden.delete(permiso.estadoId);
    else hidden.add(permiso.estadoId);
  }

  for (const permiso of permisosUsuario) {
    if (permiso.visible) hidden.delete(permiso.estadoId);
    else hidden.add(permiso.estadoId);
  }

  return Array.from(hidden);
}

export async function materializeEstadoVisibility(params: {
  permisos: PermisoEstadoRecord[];
  permisosUsuario: PermisoEstadoUsuarioRecord[];
}) {
  const estados = await prisma.estadoConfig.findMany({
    where: { entidad: "PREDIO", activo: true },
    select: { id: true, nombre: true, clave: true, color: true },
    orderBy: { orden: "asc" },
  });

  const permisos = [...params.permisos];
  const seen = new Set(permisos.map((permiso) => `${permiso.estadoId}:${permiso.rol}`));

  for (const estado of estados) {
    const key = `${estado.id}:TECNICO`;
    if (seen.has(key) || !isDefaultHiddenStateForTecnico(estado)) continue;
    permisos.push({
      estadoId: estado.id,
      rol: "TECNICO",
      visible: false,
      estado,
    });
  }

  return {
    permisos: permisos.sort((a, b) => `${a.estadoId}:${a.rol}`.localeCompare(`${b.estadoId}:${b.rol}`)),
    permisosUsuario: params.permisosUsuario,
  };
}

function collectAncestors(rootIds: string[], spaces: Array<{ id: string; parentId: string | null }>) {
  const byId = new Map(spaces.map((space) => [space.id, space]));
  const ids = new Set(rootIds);

  for (const rootId of rootIds) {
    let current = byId.get(rootId)?.parentId || null;
    while (current) {
      if (ids.has(current)) break;
      ids.add(current);
      current = byId.get(current)?.parentId || null;
    }
  }

  return Array.from(ids);
}

export async function getAssignedSpaceIdsForSession(session: SessionLike) {
  if (isModOrAdmin(session.rol)) return null as string[] | null;

  const [userIds, hiddenEstadoIds, predios] = await Promise.all([
    getDelegatedVisibleUserIds(session),
    getHiddenEstadoIdsForSession(session),
    prisma.espacioTrabajo.findMany({
      where: { activo: true },
      select: { id: true, parentId: true },
    }),
  ]);

  const where: Record<string, unknown> = buildAssignedPredioVisibilityClause(userIds);
  appendVisibleEstadosClause(where, hiddenEstadoIds);

  const visibles = await prisma.predio.findMany({
    where,
    select: { espacioId: true },
    distinct: ["espacioId"],
  });

  const directIds = visibles.map((predio) => predio.espacioId).filter(Boolean) as string[];
  return collectAncestors(directIds, predios);
}
