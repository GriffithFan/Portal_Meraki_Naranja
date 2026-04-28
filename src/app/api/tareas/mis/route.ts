import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getAllEquipoVariants } from "@/utils/equipoUtils";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const delegaciones = await prisma.delegacion.findMany({
    where: { delegadoId: session.userId, activo: true },
    select: { delegadorId: true },
  });
  const idsVisibles = [session.userId, ...delegaciones.map((d) => d.delegadorId)];
  const equipoMatch = getAllEquipoVariants(session.nombre);

  const where = {
    OR: [
      { asignaciones: { some: { userId: { in: idsVisibles } } } },
      { creadorId: { in: idsVisibles } },
      {
        equipoAsignado: equipoMatch.length > 0
          ? { in: equipoMatch, mode: "insensitive" as const }
          : { equals: session.nombre, mode: "insensitive" as const },
      },
    ],
  };

  const sinGpsWhere = {
    AND: [
      where,
      {
        AND: [
          { OR: [{ gpsPredio: null }, { gpsPredio: "" }] },
          { OR: [{ latitud: null }, { longitud: null }] },
        ],
      },
    ],
  };
  const vencidasWhere = {
    AND: [
      where,
      {
        OR: [
          { fechaHasta: { lt: startOfDay } },
          { fechaProgramada: { lt: startOfDay } },
        ],
      },
    ],
  };
  const hoyWhere = {
    AND: [
      where,
      {
        OR: [
          { fechaDesde: { lte: endOfDay }, fechaHasta: { gte: startOfDay } },
          { fechaProgramada: { gte: startOfDay, lte: endOfDay } },
        ],
      },
    ],
  };

  const [predios, total, byEstado, sinEstado, sinGPS, sinEspacio, prioridadAlta, vencidas, hoy] = await Promise.all([
    prisma.predio.findMany({
      where,
      include: {
        estado: { select: { id: true, nombre: true, clave: true, color: true, orden: true } },
        espacio: { select: { id: true, nombre: true, color: true } },
        asignaciones: { select: { id: true, usuario: { select: { id: true, nombre: true } } } },
        _count: { select: { comentarios: true, equipos: true } },
      },
      orderBy: [{ prioridad: "desc" }, { updatedAt: "desc" }],
      take: 250,
    }),
    prisma.predio.count({ where }),
    prisma.predio.groupBy({ by: ["estadoId"], where, _count: { _all: true } }),
    prisma.predio.count({ where: { AND: [where, { estadoId: null }] } }),
    prisma.predio.count({ where: sinGpsWhere }),
    prisma.predio.count({ where: { AND: [where, { espacioId: null }] } }),
    prisma.predio.count({ where: { AND: [where, { prioridad: "ALTA" }] } }),
    prisma.predio.count({ where: vencidasWhere }),
    prisma.predio.count({ where: hoyWhere }),
  ]);

  const estadoIds = byEstado.map((item) => item.estadoId).filter(Boolean) as string[];
  const estados = estadoIds.length > 0
    ? await prisma.estadoConfig.findMany({ where: { id: { in: estadoIds } }, select: { id: true, nombre: true, color: true } })
    : [];
  const estadoMap = new Map(estados.map((estado) => [estado.id, estado]));

  return NextResponse.json({
    total,
    predios,
    quickCounts: { sinEstado, sinGPS, sinEspacio, prioridadAlta, vencidas, hoy },
    byEstado: byEstado.map((item) => {
      const estado = item.estadoId ? estadoMap.get(item.estadoId) : null;
      return {
        estadoId: item.estadoId || "sin-estado",
        nombre: estado?.nombre || "Sin estado",
        color: estado?.color || "#94a3b8",
        count: item._count._all,
      };
    }).sort((a, b) => b.count - a.count),
  });
}
