import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);

  const [
    prediosTotal,
    prediosSinEstado,
    prediosSinEquipo,
    prediosSinGPS,
    prediosSinEspacio,
    usuariosActivos,
    chatsAbiertos,
    chatsEnCurso,
    notificacionesPendientes,
    actividadSemana,
    equiposPorEstado,
    prediosActualizadosHoy,
    cueGroups,
    actividadReciente,
  ] = await Promise.all([
    prisma.predio.count(),
    prisma.predio.count({ where: { estadoId: null } }),
    prisma.predio.count({ where: { OR: [{ equipoAsignado: null }, { equipoAsignado: "" }] } }),
    prisma.predio.count({
      where: {
        AND: [
          { OR: [{ gpsPredio: null }, { gpsPredio: "" }] },
          { OR: [{ latitud: null }, { longitud: null }] },
        ],
      },
    }),
    prisma.predio.count({ where: { espacioId: null } }),
    prisma.user.count({ where: { activo: true } }),
    prisma.chatConversacion.count({ where: { estado: "ABIERTA" } }),
    prisma.chatConversacion.count({ where: { estado: "EN_CURSO" } }),
    prisma.notificacion.count({ where: { leida: false } }),
    prisma.actividad.count({ where: { createdAt: { gte: startOfWeek } } }),
    prisma.equipo.groupBy({ by: ["estado"], _sum: { cantidad: true }, _count: { _all: true } }),
    prisma.predio.count({ where: { updatedAt: { gte: startOfDay } } }),
    prisma.predio.groupBy({
      by: ["cue"],
      where: { cue: { not: null } },
      _count: { _all: true },
      having: { cue: { _count: { gt: 1 } } },
      orderBy: { _count: { cue: "desc" } },
      take: 10,
    }),
    prisma.actividad.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        accion: true,
        descripcion: true,
        entidad: true,
        createdAt: true,
        usuario: { select: { nombre: true, rol: true } },
      },
    }),
  ]);

  const stockTotal = equiposPorEstado.reduce((sum, item) => sum + (item._sum.cantidad || item._count._all), 0);
  const stockEstados = equiposPorEstado
    .map((item) => ({ estado: item.estado || "Sin estado", cantidad: item._sum.cantidad || item._count._all }))
    .sort((a, b) => b.cantidad - a.cantidad);

  const backups = await getBackupSummary();
  const duplicadosCue = cueGroups
    .filter((item) => item.cue && item.cue.trim() !== "")
    .map((item) => ({ cue: item.cue, count: item._count._all }));

  return NextResponse.json({
    generatedAt: now.toISOString(),
    app: { ok: true, commit: process.env.VERCEL_GIT_COMMIT_SHA || null },
    predios: {
      total: prediosTotal,
      actualizadosHoy: prediosActualizadosHoy,
      sinEstado: prediosSinEstado,
      sinEquipo: prediosSinEquipo,
      sinGPS: prediosSinGPS,
      sinEspacio: prediosSinEspacio,
      duplicadosCue,
    },
    stock: { total: stockTotal, estados: stockEstados },
    comunicacion: { chatsAbiertos, chatsEnCurso, notificacionesPendientes },
    operacion: { usuariosActivos, actividadSemana },
    backups,
    actividadReciente,
  });
}

async function getBackupSummary() {
  const backupDir = join(process.cwd(), "backups");
  try {
    const files = await readdir(backupDir);
    const details = await Promise.all(
      files
        .filter((name) => name.endsWith(".gz") || name.endsWith(".tar.gz"))
        .map(async (name) => {
          const info = await stat(join(backupDir, name));
          return { name, size: info.size, modifiedAt: info.mtime.toISOString() };
        })
    );
    const sorted = details.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
    return { configured: true, count: sorted.length, latest: sorted[0] || null };
  } catch {
    return { configured: false, count: 0, latest: null };
  }
}
