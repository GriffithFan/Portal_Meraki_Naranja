import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin, isModOrAdmin } from "@/lib/auth";
import { parseBody, isErrorResponse, espacioUpdateSchema } from "@/lib/validation";
import { sanitizeTaskFieldConfigs } from "@/utils/taskFieldConfig";
import { appendVisibleEstadosClause, buildAssignedPredioVisibilityClause, getDelegatedVisibleUserIds, getHiddenEstadoIdsForSession } from "@/lib/predioVisibility";
import { getRestrictedSpaceIdsForSession } from "@/lib/spaceAccess";

/* eslint-disable @typescript-eslint/no-explicit-any */

function sanitizeEspacioTaskConfig<T extends { camposConfig?: any; estadosConfig?: any }>(espacio: T): T {
  const estadosConfig = espacio.estadosConfig && typeof espacio.estadosConfig === "object" && !Array.isArray(espacio.estadosConfig)
    ? {
        ...espacio.estadosConfig,
        detalleCamposConfig: sanitizeTaskFieldConfigs((espacio.estadosConfig as any).detalleCamposConfig),
      }
    : espacio.estadosConfig;

  return {
    ...espacio,
    camposConfig: sanitizeTaskFieldConfigs(espacio.camposConfig),
    estadosConfig,
  };
}

// GET /api/espacios/[id] — Detalle + stats del espacio
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const restrictedSpaceIds = await getRestrictedSpaceIdsForSession(session);
  if (!isAdmin(session.rol) && restrictedSpaceIds && !restrictedSpaceIds.includes(params.id)) {
    return NextResponse.json({ error: "Sin acceso a este espacio" }, { status: 403 });
  }

  const espacio = await prisma.espacioTrabajo.findUnique({
    where: { id: params.id },
    include: {
      hijos: {
        where: { activo: true },
        orderBy: { orden: "asc" },
        include: { _count: { select: { predios: true } } },
      },
      _count: { select: { predios: true } },
    },
  });

  if (!espacio)
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  // Obtener todos los IDs de hijos (para stats agregadas)
  const hijoIds = espacio.hijos.map((h) => h.id);
  const allSpaceIds = [espacio.id, ...hijoIds];

  // Stats: predios por estado, asignacion, provincia y ambito
  const predioWhere: Record<string, any> = { espacioId: { in: allSpaceIds } };
  appendVisibleEstadosClause(predioWhere, await getHiddenEstadoIdsForSession(session));
  if (!isModOrAdmin(session.rol)) {
    const idsVisibles = await getDelegatedVisibleUserIds(session);
    predioWhere.AND = [...(predioWhere.AND || []), buildAssignedPredioVisibilityClause(idsVisibles)];
  }

  const predios = await prisma.predio.findMany({
    where: predioWhere,
    select: {
      id: true,
      estadoId: true,
      provincia: true,
      ambito: true,
      estado: { select: { id: true, nombre: true, color: true, clave: true } },
      espacioId: true,
      asignaciones: { include: { usuario: { select: { nombre: true } } } },
    },
  });

  const totalPredios = predios.length;
  const directCounts = await prisma.predio.groupBy({
    by: ["espacioId"],
    where: predioWhere,
    _count: { _all: true },
  });
  const directCountBySpaceId = new Map(
    directCounts
      .filter((row) => row.espacioId)
      .map((row) => [row.espacioId as string, row._count._all]),
  );

  // Por estado
  const byEstado: Record<string, { nombre: string; color: string; count: number }> = {};
  for (const p of predios) {
    const key = p.estadoId || "sin-estado";
    if (!byEstado[key]) {
      byEstado[key] = {
        nombre: p.estado?.nombre || "Sin estado",
        color: p.estado?.color || "#94a3b8",
        count: 0,
      };
    }
    byEstado[key].count++;
  }

  // Por asignado
  const byAsignado: Record<string, number> = {};
  for (const p of predios) {
    const nombres = p.asignaciones.map((a) => a.usuario.nombre).filter(Boolean);
    if (nombres.length === 0) {
      byAsignado["Sin asignar"] = (byAsignado["Sin asignar"] || 0) + 1;
    } else {
      for (const nombre of nombres) {
        byAsignado[nombre] = (byAsignado[nombre] || 0) + 1;
      }
    }
  }

  // Por provincia
  const byProvincia: Record<string, number> = {};
  for (const p of predios) {
    const prov = p.provincia || "Sin provincia";
    byProvincia[prov] = (byProvincia[prov] || 0) + 1;
  }

  // Por ámbito
  const byAmbito: Record<string, number> = {};
  for (const p of predios) {
    const amb = p.ambito || "Sin definir";
    byAmbito[amb] = (byAmbito[amb] || 0) + 1;
  }

  // Predios por sub-espacio
  const bySubEspacio: Record<string, number> = {};
  for (const p of predios) {
    const sid = p.espacioId || espacio.id;
    bySubEspacio[sid] = (bySubEspacio[sid] || 0) + 1;
  }

  // Registrar consulta de predio/espacio (auditoría) — fire-and-forget
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  prisma.registroAcceso.create({
    data: {
      userId: session.userId,
      accion: "CONSULTA_PREDIO",
      detalle: espacio.nombre || params.id,
      ip,
      metadata: { espacioId: params.id, totalPredios },
    },
  }).catch(() => {});

  return NextResponse.json({
    espacio: sanitizeEspacioTaskConfig({
      ...espacio,
      _count: { ...espacio._count, predios: directCountBySpaceId.get(espacio.id) || 0 },
      hijos: espacio.hijos.map((hijo) => ({
        ...hijo,
        _count: { ...hijo._count, predios: directCountBySpaceId.get(hijo.id) || 0 },
      })),
    } as any),
    stats: {
      totalPredios,
      byEstado: Object.values(byEstado).sort((a, b) => b.count - a.count),
      byAsignado: Object.entries(byAsignado)
        .map(([nombre, count]) => ({ nombre, count }))
        .sort((a, b) => b.count - a.count),
      byProvincia: Object.entries(byProvincia)
        .map(([nombre, count]) => ({ nombre, count }))
        .sort((a, b) => b.count - a.count),
      byAmbito: Object.entries(byAmbito)
        .map(([nombre, count]) => ({ nombre, count }))
        .sort((a, b) => b.count - a.count),
      bySubEspacio,
    },
  });
}

// PATCH /api/espacios/[id] — Editar espacio
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const data = await parseBody(request, espacioUpdateSchema);
  if (isErrorResponse(data)) return data;

  const cleanData = { ...data } as any;
  if ("camposConfig" in cleanData) cleanData.camposConfig = sanitizeTaskFieldConfigs(cleanData.camposConfig);
  if (cleanData.estadosConfig && typeof cleanData.estadosConfig === "object" && !Array.isArray(cleanData.estadosConfig)) {
    cleanData.estadosConfig = {
      ...cleanData.estadosConfig,
      detalleCamposConfig: sanitizeTaskFieldConfigs(cleanData.estadosConfig.detalleCamposConfig),
    };
  }

  const espacio = await prisma.espacioTrabajo.update({
    where: { id: params.id },
    data: cleanData,
  });

  return NextResponse.json(sanitizeEspacioTaskConfig(espacio as any));
}

// DELETE /api/espacios/[id] — Soft-delete
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN")
    return NextResponse.json({ error: "Solo ADMIN" }, { status: 403 });

  await prisma.espacioTrabajo.update({
    where: { id: params.id },
    data: { activo: false },
  });

  return NextResponse.json({ ok: true });
}
