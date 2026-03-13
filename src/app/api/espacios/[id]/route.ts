import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/espacios/[id] — Detalle + stats del espacio
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });

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

  const body = await request.json();
  const allowed = ["nombre", "descripcion", "color", "icono", "orden", "activo"];
  const data: any = {};

  for (const key of allowed) {
    if (key in body) data[key] = body[key];
  }

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
