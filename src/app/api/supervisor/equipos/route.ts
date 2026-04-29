import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { buildEquipoOptions, getAllEquipoVariants } from "@/utils/equipoUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

function equipoWhere(key: string, display?: string) {
  const variants = getAllEquipoVariants(key);
  const values = variants.length > 0 ? variants : [key, display].filter(Boolean) as string[];
  if (values.length === 0) return { OR: [{ equipoAsignado: null }, { equipoAsignado: "" }] };
  return {
    OR: values.map((value) => ({ equipoAsignado: { equals: value, mode: "insensitive" as const } })),
  };
}

function missingGpsWhere(baseWhere: any) {
  return {
    AND: [
      baseWhere,
      {
        AND: [
          { OR: [{ gpsPredio: null }, { gpsPredio: "" }] },
          { OR: [{ latitud: null }, { longitud: null }] },
        ],
      },
    ],
  };
}

export async function GET() {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const users = await prisma.user.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, rol: true },
    orderBy: { nombre: "asc" },
  });
  const equipoOptions = buildEquipoOptions(users).map((item) => ({ key: item.key, display: item.display }));
  const options = [...equipoOptions, { key: "SIN_EQUIPO", display: "SIN EQUIPO" }];

  const equipos = await Promise.all(options.map(async (option) => {
    const baseWhere = option.key === "SIN_EQUIPO"
      ? { OR: [{ equipoAsignado: null }, { equipoAsignado: "" }] }
      : equipoWhere(option.key, option.display);
    const vencidasWhere = {
      AND: [
        baseWhere,
        { OR: [{ fechaHasta: { lt: startOfDay } }, { fechaProgramada: { lt: startOfDay } }] },
      ],
    };
    const hoyWhere = {
      AND: [
        baseWhere,
        { OR: [{ fechaDesde: { lte: endOfDay }, fechaHasta: { gte: startOfDay } }, { fechaProgramada: { gte: startOfDay, lte: endOfDay } }] },
      ],
    };

    const [total, vencidas, hoy, sinGPS, sinEstado, sinEspacio, alta, actualizadasSemana, byEstado, recientes] = await Promise.all([
      prisma.predio.count({ where: baseWhere }),
      prisma.predio.count({ where: vencidasWhere }),
      prisma.predio.count({ where: hoyWhere }),
      prisma.predio.count({ where: missingGpsWhere(baseWhere) }),
      prisma.predio.count({ where: { AND: [baseWhere, { estadoId: null }] } }),
      prisma.predio.count({ where: { AND: [baseWhere, { espacioId: null }] } }),
      prisma.predio.count({ where: { AND: [baseWhere, { prioridad: { in: ["ALTA", "URGENTE"] } }] } }),
      prisma.predio.count({ where: { AND: [baseWhere, { updatedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } }] } }),
      prisma.predio.groupBy({ by: ["estadoId"], where: baseWhere, _count: { _all: true }, orderBy: { _count: { estadoId: "desc" } }, take: 5 }),
      prisma.predio.findMany({
        where: baseWhere,
        select: {
          id: true,
          codigo: true,
          nombre: true,
          incidencias: true,
          provincia: true,
          prioridad: true,
          fechaHasta: true,
          fechaProgramada: true,
          updatedAt: true,
          estado: { select: { nombre: true, color: true } },
          espacio: { select: { nombre: true } },
          _count: { select: { comentarios: true } },
        },
        orderBy: [{ prioridad: "desc" }, { updatedAt: "desc" }],
        take: 5,
      }),
    ]);

    const estadoIds = byEstado.map((item) => item.estadoId).filter(Boolean) as string[];
    const estados = estadoIds.length > 0
      ? await prisma.estadoConfig.findMany({ where: { id: { in: estadoIds } }, select: { id: true, nombre: true, color: true } })
      : [];
    const estadoMap = new Map(estados.map((estado) => [estado.id, estado]));

    return {
      key: option.key,
      display: option.display,
      total,
      vencidas,
      hoy,
      sinGPS,
      sinEstado,
      sinEspacio,
      alta,
      actualizadasSemana,
      avance: total > 0 ? Math.round(((total - vencidas - sinEstado) / total) * 100) : 0,
      byEstado: byEstado.map((item) => {
        const estado = item.estadoId ? estadoMap.get(item.estadoId) : null;
        return { estadoId: item.estadoId || "sin-estado", nombre: estado?.nombre || "Sin estado", color: estado?.color || "#94a3b8", count: item._count._all };
      }),
      recientes,
    };
  }));

  const activos = equipos.filter((item) => item.total > 0 || item.key === "SIN_EQUIPO");
  const resumen = activos.reduce((acc, item) => {
    acc.total += item.total;
    acc.vencidas += item.vencidas;
    acc.hoy += item.hoy;
    acc.sinGPS += item.sinGPS;
    acc.sinEstado += item.sinEstado;
    acc.alta += item.alta;
    return acc;
  }, { total: 0, vencidas: 0, hoy: 0, sinGPS: 0, sinEstado: 0, alta: 0 });

  return NextResponse.json({ generatedAt: now.toISOString(), resumen, equipos: activos.sort((a, b) => b.total - a.total) });
}
