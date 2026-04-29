import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const KPI_CACHE_TTL_MS = 45_000;

const cachedKpis: Record<string, { exp: number; data: unknown } | undefined> = {};

function getWeekRange(now = new Date()) {
  const day = now.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const desde = new Date(now);
  desde.setDate(now.getDate() - diffToMonday);
  desde.setHours(0, 0, 0, 0);
  const hasta = new Date(now);
  hasta.setHours(23, 59, 59, 999);
  return { desde, hasta };
}

function getISOWeek(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const cacheKey = session.rol === "ADMIN" ? "admin" : "standard";
  const cached = cachedKpis[cacheKey];
  if (cached && cached.exp > Date.now()) {
    return NextResponse.json(cached.data, {
      headers: { "X-Cache": "HIT", "Cache-Control": "private, max-age=30" },
    });
  }

  const now = new Date();
  const { desde: startOfWeek, hasta: endOfWeek } = getWeekRange(now);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday.getTime() + 86400000);

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
        fecha: { gte: startOfToday, lt: endOfToday },
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

  let produccionSemanal = null;

  if (session.rol === "ADMIN") {
    const estadosProduccion = await prisma.estadoConfig.findMany({
      where: { clave: { in: ["conforme", "no_conforme"] }, activo: true },
      select: { id: true, clave: true, nombre: true, color: true },
    });
    const estadoProduccionMap = new Map(estadosProduccion.map((estado) => [estado.id, estado]));
    const estadoProduccionIds = estadosProduccion.map((estado) => estado.id);

    const prediosProduccion = estadoProduccionIds.length > 0
      ? await prisma.predio.findMany({
          where: {
            estadoId: { in: estadoProduccionIds },
            fechaActualizacion: { gte: startOfWeek, lte: endOfWeek },
          },
          select: {
            id: true,
            estadoId: true,
            equipoAsignado: true,
            asignaciones: {
              where: { tipo: { in: ["TAREA", "TECNICO"] } },
              include: { usuario: { select: { id: true, nombre: true } } },
            },
          },
          orderBy: { fechaActualizacion: "desc" },
        })
      : [];

    const porTecnico = new Map<string, { tecnicoId: string; tecnicoNombre: string; total: number; conformes: number; noConformes: number }>();
    let conformesSemana = 0;
    let noConformesSemana = 0;

    for (const predio of prediosProduccion) {
      const estado = predio.estadoId ? estadoProduccionMap.get(predio.estadoId) : null;
      const esNoConforme = estado?.clave === "no_conforme";
      if (esNoConforme) noConformesSemana += 1;
      else conformesSemana += 1;

      const tecnicos = predio.asignaciones.map((asignacion) => asignacion.usuario);
      const targets = tecnicos.length > 0
        ? tecnicos.map((tecnico) => ({ id: tecnico.id, nombre: tecnico.nombre }))
        : [{ id: predio.equipoAsignado || "SIN_ASIGNAR", nombre: predio.equipoAsignado || "Sin asignar" }];

      for (const tecnico of targets) {
        const current = porTecnico.get(tecnico.id) || {
          tecnicoId: tecnico.id,
          tecnicoNombre: tecnico.nombre,
          total: 0,
          conformes: 0,
          noConformes: 0,
        };
        current.total += 1;
        if (esNoConforme) current.noConformes += 1;
        else current.conformes += 1;
        porTecnico.set(tecnico.id, current);
      }
    }

    produccionSemanal = {
      semana: getISOWeek(startOfWeek),
      desde: startOfWeek.toISOString(),
      hasta: endOfWeek.toISOString(),
      total: prediosProduccion.length,
      conformes: conformesSemana,
      noConformes: noConformesSemana,
      porTecnico: Array.from(porTecnico.values()).sort((a, b) => b.total - a.total || a.tecnicoNombre.localeCompare(b.tecnicoNombre, "es")),
    };
  }

  // Progreso general (% de predios con estado "conforme" o similar)
  const conformeCount = byEstado
    .filter((e) => e.nombre.toLowerCase().includes("conforme") && !e.nombre.toLowerCase().includes("no conforme"))
    .reduce((sum, e) => sum + e.count, 0);

  const responseData = {
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
    ...(produccionSemanal ? { produccionSemanal } : {}),
  };

  cachedKpis[cacheKey] = { exp: Date.now() + KPI_CACHE_TTL_MS, data: responseData };

  return NextResponse.json(responseData, {
    headers: { "X-Cache": "MISS", "Cache-Control": "private, max-age=30" },
  });
}
