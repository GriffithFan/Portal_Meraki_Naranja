import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin, isModOrAdmin } from "@/lib/auth";
import { parseBody, isErrorResponse, espacioUpdateSchema } from "@/lib/validation";

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/espacios/[id] — Detalle + stats del espacio
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Validar acceso al espacio (ADMIN siempre tiene acceso)
  if (!isAdmin(session.rol)) {
    const accesos = await prisma.accesoEspacio.findMany({
      where: { userId: session.userId },
      select: { espacioId: true },
    });
    if (accesos.length > 0) {
      const idsPermitidos = new Set(accesos.map(a => a.espacioId));
      if (!idsPermitidos.has(params.id)) {
        // Verificar si es un padre de un espacio permitido
        const espacioCheck = await prisma.espacioTrabajo.findFirst({
          where: { parentId: params.id, id: { in: Array.from(idsPermitidos) } },
        });
        if (!espacioCheck) {
          return NextResponse.json({ error: "Sin acceso a este espacio" }, { status: 403 });
        }
      }
    }
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

  // Stats: predios por estado, por equipo, por provincia
  const predios = await prisma.predio.findMany({
    where: { espacioId: { in: allSpaceIds } },
    select: {
      id: true,
      estadoId: true,
      equipoAsignado: true,
      provincia: true,
      ambito: true,
      estado: { select: { id: true, nombre: true, color: true, clave: true } },
      espacioId: true,
    },
  });

  const totalPredios = predios.length;

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

  // Por equipo
  const byEquipo: Record<string, number> = {};
  for (const p of predios) {
    const eq = p.equipoAsignado || "Sin asignar";
    byEquipo[eq] = (byEquipo[eq] || 0) + 1;
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
    espacio,
    stats: {
      totalPredios,
      byEstado: Object.values(byEstado).sort((a, b) => b.count - a.count),
      byEquipo: Object.entries(byEquipo)
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

  const espacio = await prisma.espacioTrabajo.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(espacio);
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
