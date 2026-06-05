import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { getEquipoDisplayName, normalizeAssigneeName, resolveEquipoKey } from "@/utils/equipoUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

function asignadoWhere(userIds: string[] | null) {
  if (!userIds || userIds.length === 0) return { asignaciones: { none: {} } };
  return { asignaciones: { some: { userId: { in: userIds } } } };
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

function normalizeStateLabel(value?: string | null) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getStateBucket(estado?: { nombre?: string | null; clave?: string | null } | null) {
  const nombre = normalizeStateLabel(estado?.nombre);
  const clave = normalizeStateLabel(estado?.clave);
  const label = `${clave} ${nombre}`.trim();

  if (!label) return "otro" as const;
  if (label.includes("no conforme") || label.includes("noconforme") || label === "nc") return "noConforme" as const;
  if (["conforme", "cerrad", "finaliz", "bloque", "blocke", "instalad"].some((token) => label.includes(token))) return "conforme" as const;
  return "otro" as const;
}

function getNoConformeReason(predio: {
  incidencias?: string | null;
  notas?: string | null;
  comentarios?: Array<{ contenido?: string | null }>;
}) {
  const incidencia = predio.incidencias?.trim();
  if (incidencia) return { motivo: incidencia, fuente: "incidencia" as const };

  const nota = predio.notas?.trim();
  if (nota) return { motivo: nota, fuente: "nota" as const };

  const comentario = predio.comentarios?.[0]?.contenido?.trim();
  if (comentario) return { motivo: comentario, fuente: "comentario" as const };

  return { motivo: null, fuente: null };
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

  const groupedUsers = new Map<string, { key: string; display: string; userIds: string[] }>();
  for (const user of users) {
    const resolvedKey = resolveEquipoKey(user.nombre);
    const mergeKey = resolvedKey || normalizeAssigneeName(user.nombre) || user.id;
    const current = groupedUsers.get(mergeKey);
    if (!current) {
      groupedUsers.set(mergeKey, {
        key: resolvedKey || mergeKey,
        display: getEquipoDisplayName(resolvedKey || user.nombre),
        userIds: [user.id],
      });
      continue;
    }
    if (!current.userIds.includes(user.id)) current.userIds.push(user.id);
  }

  const options = [
    ...Array.from(groupedUsers.values()).sort((a, b) => a.display.localeCompare(b.display, "es")),
    { key: "SIN_ASIGNAR", display: "Sin asignar", userIds: null as string[] | null },
  ];

  const [estadosActivos, reportesFacturacion] = await Promise.all([
    prisma.estadoConfig.findMany({
      where: { entidad: "PREDIO", activo: true },
      select: { id: true, nombre: true, clave: true },
    }),
    prisma.reporteFacturacion.findMany({
      select: { resumen: true },
      orderBy: { createdAt: "desc" },
      take: 520,
    }),
  ]);

  const conformesEstadoIds = estadosActivos.filter((estado) => getStateBucket(estado) === "conforme").map((estado) => estado.id);
  const noConformesEstadoIds = estadosActivos.filter((estado) => getStateBucket(estado) === "noConforme").map((estado) => estado.id);

  const facturadoHistoricoByKey = new Map<string, number>();
  for (const reporte of reportesFacturacion) {
    if (!Array.isArray(reporte.resumen)) continue;
    for (const row of reporte.resumen as any[]) {
      const rawName = typeof row?.tecnicoNombre === "string" ? row.tecnicoNombre : "";
      const rawId = typeof row?.tecnicoId === "string" ? row.tecnicoId : "";
      const normalizedName = normalizeAssigneeName(rawName || rawId);
      const resolved = resolveEquipoKey(rawName || rawId);
      const mergeKey = rawId === "SIN_ASIGNAR" || normalizedName === "SIN ASIGNAR"
        ? "SIN_ASIGNAR"
        : (resolved || normalizedName || rawId);
      if (!mergeKey) continue;

      const cantidad = Number(row?.cantidad) || 0;
      if (cantidad <= 0) continue;
      facturadoHistoricoByKey.set(mergeKey, (facturadoHistoricoByKey.get(mergeKey) || 0) + cantidad);
    }
  }

  const asignados = await Promise.all(options.map(async (option) => {
    const baseWhere = asignadoWhere(option.userIds);
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

    const conformesWhere = conformesEstadoIds.length > 0
      ? { AND: [baseWhere, { estadoId: { in: conformesEstadoIds } }] }
      : { AND: [baseWhere, { id: "__none__" }] };

    const noConformesWhere = noConformesEstadoIds.length > 0
      ? { AND: [baseWhere, { estadoId: { in: noConformesEstadoIds } }] }
      : { AND: [baseWhere, { id: "__none__" }] };

    const noConformesConDetalleWhere = noConformesEstadoIds.length > 0
      ? {
          AND: [
            baseWhere,
            { estadoId: { in: noConformesEstadoIds } },
            {
              OR: [
                { incidencias: { not: null } },
                { notas: { not: null } },
                { comentarios: { some: {} } },
              ],
            },
          ],
        }
      : { AND: [baseWhere, { id: "__none__" }] };

    const noConformesSinDetalleWhere = noConformesEstadoIds.length > 0
      ? {
          AND: [
            baseWhere,
            { estadoId: { in: noConformesEstadoIds } },
            {
              NOT: {
                OR: [
                  { incidencias: { not: null } },
                  { notas: { not: null } },
                  { comentarios: { some: {} } },
                ],
              },
            },
          ],
        }
      : { AND: [baseWhere, { id: "__none__" }] };

    const activity30Where = {
      AND: [baseWhere, { updatedAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } }],
    };

    const [
      total,
      vencidas,
      hoy,
      sinGPS,
      sinEstado,
      sinEspacio,
      alta,
      actualizadasSemana,
      byEstado,
      recientes,
      conformesActuales,
      noConformesActuales,
      noConformesConDetalle,
      noConformesSinDetalle,
      actividad30d,
      muestraNoConformes,
    ] = await Promise.all([
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
      prisma.predio.count({ where: conformesWhere }),
      prisma.predio.count({ where: noConformesWhere }),
      prisma.predio.count({ where: noConformesConDetalleWhere }),
      prisma.predio.count({ where: noConformesSinDetalleWhere }),
      prisma.predio.count({ where: activity30Where }),
      prisma.predio.findMany({
        where: noConformesWhere,
        select: {
          id: true,
          codigo: true,
          incidencias: true,
          notas: true,
          comentarios: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { contenido: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 4,
      }),
    ]);

    const estadoIds = byEstado.map((item) => item.estadoId).filter(Boolean) as string[];
    const estados = estadoIds.length > 0
      ? await prisma.estadoConfig.findMany({ where: { id: { in: estadoIds } }, select: { id: true, nombre: true, color: true } })
      : [];
    const estadoMap = new Map(estados.map((estado) => [estado.id, estado]));

    const facturadosHistoricos = facturadoHistoricoByKey.get(option.key) || 0;
    const conformesHistoricos = conformesActuales + facturadosHistoricos;
    const auditar = noConformesSinDetalle + sinGPS + sinEstado;

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
      historico: {
        prediosAsignadosActuales: total,
        actividad30d,
        conformesActuales,
        facturadosHistoricos,
        conformesHistoricos,
        noConformesActuales,
        noConformesConDetalle,
        noConformesSinDetalle,
        auditar,
      },
      noConformesMuestra: muestraNoConformes.map((predio) => {
        const motivoInfo = getNoConformeReason(predio);
        return {
          id: predio.id,
          codigo: predio.codigo,
          motivo: motivoInfo.motivo,
          fuente: motivoInfo.fuente,
        };
      }),
      byEstado: byEstado.map((item) => {
        const estado = item.estadoId ? estadoMap.get(item.estadoId) : null;
        return { estadoId: item.estadoId || "sin-estado", nombre: estado?.nombre || "Sin estado", color: estado?.color || "#94a3b8", count: item._count._all };
      }),
      recientes,
    };
  }));

  const activos = asignados.filter((item) => item.total > 0 || item.key === "SIN_ASIGNAR");
  const resumen = activos.reduce((acc, item) => {
    acc.total += item.total;
    acc.vencidas += item.vencidas;
    acc.hoy += item.hoy;
    acc.sinGPS += item.sinGPS;
    acc.sinEstado += item.sinEstado;
    acc.alta += item.alta;
    acc.conformesHistoricos += item.historico.conformesHistoricos;
    acc.noConformesActuales += item.historico.noConformesActuales;
    acc.auditar += item.historico.auditar;
    return acc;
  }, { total: 0, vencidas: 0, hoy: 0, sinGPS: 0, sinEstado: 0, alta: 0, conformesHistoricos: 0, noConformesActuales: 0, auditar: 0 });

  return NextResponse.json({ generatedAt: now.toISOString(), resumen, asignados: activos.sort((a, b) => b.total - a.total) });
}
