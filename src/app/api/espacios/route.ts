import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin, isModOrAdmin } from "@/lib/auth";
import { espacioSchema, parseBody, isErrorResponse } from "@/lib/validation";
import { withPrivateCatalogCache } from "@/lib/cacheHeaders";
import { sanitizeTaskFieldConfigs } from "@/utils/taskFieldConfig";
import { appendVisibleEstadosClause, buildAssignedPredioVisibilityClause, getDelegatedVisibleUserIds, getHiddenEstadoIdsForSession } from "@/lib/predioVisibility";
import { getRestrictedSpaceIdsForSession } from "@/lib/spaceAccess";

/* eslint-disable @typescript-eslint/no-explicit-any */

function sanitizeEspacioNode(espacio: any): any {
  const estadosConfig = espacio.estadosConfig && typeof espacio.estadosConfig === "object" && !Array.isArray(espacio.estadosConfig)
    ? {
        ...espacio.estadosConfig,
        detalleCamposConfig: sanitizeTaskFieldConfigs(espacio.estadosConfig.detalleCamposConfig),
      }
    : espacio.estadosConfig;

  return {
    ...espacio,
    camposConfig: sanitizeTaskFieldConfigs(espacio.camposConfig),
    estadosConfig,
    children: Array.isArray(espacio.children) ? espacio.children.map(sanitizeEspacioNode) : espacio.children,
  };
}

// GET /api/espacios — Listar árbol de espacios con conteos
export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const espacios = await prisma.espacioTrabajo.findMany({
    where: { activo: true },
    include: {
      _count: { select: { predios: true, hijos: true } },
    },
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
  });
  const restrictedSpaceIds = await getRestrictedSpaceIdsForSession(session);
  const hiddenEstadoIds = await getHiddenEstadoIdsForSession(session);

  // Filtrar por acceso del usuario (ADMIN siempre ve todo)
  let espaciosFiltrados = espacios;
  if (!isAdmin(session.rol) && restrictedSpaceIds) {
    const idsPermitidos = new Set(restrictedSpaceIds);
    espaciosFiltrados = espacios.filter((espacio) => idsPermitidos.has(espacio.id));
  }

  const visiblePredioWhere: Record<string, any> = {};
  if (restrictedSpaceIds) visiblePredioWhere.espacioId = { in: restrictedSpaceIds };
  appendVisibleEstadosClause(visiblePredioWhere, hiddenEstadoIds);
  if (!isModOrAdmin(session.rol)) {
    const idsVisibles = await getDelegatedVisibleUserIds(session);
    visiblePredioWhere.AND = [...(visiblePredioWhere.AND || []), buildAssignedPredioVisibilityClause(idsVisibles)];
  }

  const visibleCounts = await prisma.predio.groupBy({
    by: ["espacioId"],
    where: {
      ...visiblePredioWhere,
      espacioId: visiblePredioWhere.espacioId || { not: null },
    },
    _count: { _all: true },
  });
  const directCountBySpaceId = new Map(
    visibleCounts
      .filter((row) => row.espacioId)
      .map((row) => [row.espacioId as string, row._count._all]),
  );

  // Construir árbol
  const map = new Map<string, any>();
  const roots: any[] = [];

  for (const e of espaciosFiltrados) {
    map.set(e.id, {
      ...e,
      _count: { ...e._count, predios: directCountBySpaceId.get(e.id) || 0 },
      children: [],
    });
  }

  for (const e of espaciosFiltrados) {
    const node = map.get(e.id);
    if (e.parentId && map.has(e.parentId)) {
      map.get(e.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }

  const foldCounts = (node: any): any => {
    const children = Array.isArray(node.children) ? node.children.map(foldCounts) : [];
    const subtotal = children.reduce((sum: number, child: any) => sum + (child._count?.predios || 0), 0);
    return {
      ...node,
      children,
      _count: {
        ...node._count,
        predios: (node._count?.predios || 0) + subtotal,
      },
    };
  };

  return withPrivateCatalogCache(NextResponse.json({ espacios: roots.map(foldCounts).map(sanitizeEspacioNode) }));
}

// POST /api/espacios — Crear espacio
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  try {
    const data = await parseBody(request, espacioSchema);
    if (isErrorResponse(data)) return data;

    const { nombre, descripcion, color, icono, parentId } = data;

    // Calcular siguiente orden
    const maxOrden = await prisma.espacioTrabajo.aggregate({
      where: { parentId: parentId || null },
      _max: { orden: true },
    });

    const espacio = await prisma.espacioTrabajo.create({
      data: {
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        color: color || "#3b82f6",
        icono: icono || "folder",
        parentId: parentId || null,
        orden: (maxOrden._max.orden ?? -1) + 1,
        creadorId: session.userId,
      },
    });

    return NextResponse.json(espacio, { status: 201 });
  } catch (error) {
    console.error("Error creando espacio:", error);
    return NextResponse.json({ error: "Error al crear espacio" }, { status: 500 });
  }
}
