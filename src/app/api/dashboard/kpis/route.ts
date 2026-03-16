import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    prediosTotal,
    prediosConRed,
    prediosPorEstado,
    prediosPorEquipo,
    prediosPorProvincia,
    prediosPorAmbito,
    tareasCompletadasSemana,
    tareasCompletadasMes,
    tareasPendientes,
    tareasHoy,
    equiposDisponibles,
    equiposAsignados,
    equiposRotos,
    usuariosActivos,
    actividadSemana,
    notificacionesSinLeerTotal,
    prediosConGPS,
  ] = await Promise.all([
    prisma.predio.count(),
    prisma.predio.count({ where: { merakiNetworkId: { not: null } } }),
    prisma.predio.groupBy({
      by: ["estadoId"],
      _count: true,
    }),
    prisma.predio.groupBy({
      by: ["equipoAsignado"],
      _count: true,
    }),
    prisma.predio.groupBy({
      by: ["provincia"],
      _count: true,
    }),
    prisma.predio.groupBy({
      by: ["ambito"],
      _count: true,
    }),
    prisma.tareaCalendario.count({
      where: { completada: true, fecha: { gte: startOfWeek } },
    }),
    prisma.tareaCalendario.count({
      where: { completada: true, fecha: { gte: startOfMonth } },
    }),
    prisma.tareaCalendario.count({ where: { completada: false } }),
    prisma.tareaCalendario.count({
      where: {
        fecha: { gte: new Date(now.setHours(0, 0, 0, 0)), lt: new Date(now.getTime() + 86400000) },
        completada: false,
      },
    }),
    prisma.equipo.count({ where: { estado: "DISPONIBLE" } }),
    prisma.equipo.count({ where: { estado: { in: ["ASIGNADO", "INSTALADO"] } } }),
    prisma.equipo.count({ where: { estado: { in: ["ROTO", "PERDIDO"] } } }),
    prisma.user.count({ where: { activo: true } }),
    prisma.actividad.count({ where: { createdAt: { gte: startOfWeek } } }),
    prisma.notificacion.count({ where: { leida: false } }),
    prisma.predio.count({
      where: {
        latitud: { not: null },
        longitud: { not: null },
      },
    }),
  ]);

  // Resolver nombres de estados
  const estadoIds = prediosPorEstado
    .map((e) => e.estadoId)
    .filter((id): id is string => id !== null);
  const estados = await prisma.estadoConfig.findMany({
    where: { id: { in: estadoIds } },
    select: { id: true, nombre: true, color: true },
  });
  const estadoMap = new Map(estados.map((e) => [e.id, e]));

  const byEstado = prediosPorEstado.map((e) => {
    const est = e.estadoId ? estadoMap.get(e.estadoId) : null;
    return {
      nombre: est?.nombre || "Sin estado",
      color: est?.color || "#94a3b8",
      count: e._count,
    };
  }).sort((a, b) => b.count - a.count);

  const byEquipo = prediosPorEquipo
    .map((e) => ({ nombre: e.equipoAsignado || "Sin asignar", count: e._count }))
    .sort((a, b) => b.count - a.count);

  const byProvincia = prediosPorProvincia
    .map((e) => ({ nombre: e.provincia || "Sin provincia", count: e._count }))
    .sort((a, b) => b.count - a.count);

  const byAmbito = prediosPorAmbito
    .map((e) => ({ nombre: e.ambito || "Sin definir", count: e._count }))
    .sort((a, b) => b.count - a.count);

  // Progreso general (% de predios con estado "conforme" o similar)
  const conformeCount = byEstado
    .filter((e) => e.nombre.toLowerCase().includes("conforme") && !e.nombre.toLowerCase().includes("no conforme"))
    .reduce((sum, e) => sum + e.count, 0);

  return NextResponse.json({
    predios: {
      total: prediosTotal,
      conRed: prediosConRed,
      conGPS: prediosConGPS,
      conformes: conformeCount,
      progreso: prediosTotal > 0 ? Math.round((conformeCount / prediosTotal) * 100) : 0,
      byEstado,
      byEquipo,
      byProvincia,
      byAmbito,
    },
    tareas: {
      pendientes: tareasPendientes,
      hoy: tareasHoy,
      completadasSemana: tareasCompletadasSemana,
      completadasMes: tareasCompletadasMes,
    },
    equipos: {
      disponibles: equiposDisponibles,
      asignados: equiposAsignados,
      rotos: equiposRotos,
    },
    operacion: {
      usuariosActivos,
      actividadSemana,
      notificacionesPendientes: notificacionesSinLeerTotal,
    },
  });
}
