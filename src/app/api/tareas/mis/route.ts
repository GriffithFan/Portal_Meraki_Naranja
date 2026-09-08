import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { appendAndClause, appendVisibleEstadosClause, buildAssignedPredioVisibilityClause, getHiddenEstadoIdsForSession } from "@/lib/predioVisibility";
import { getRestrictedSpaceIdsForSession } from "@/lib/spaceAccess";
// Este archivo también devolvía `Predio.incidencias` como motivo. Ver lib/noConformidades.ts.
import { motivoNoConformidad } from "@/lib/noConformidades";

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
  if (
    label.includes("no conforme")
    || label.includes("noconforme")
    || label === "nc"
  ) {
    return "noConforme" as const;
  }

  if (["conforme", "cerrad", "finaliz", "bloque", "blocke", "instalad"].some((token) => label.includes(token))) {
    return "conforme" as const;
  }

  return "otro" as const;
}

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
  const hiddenEstadoIds = await getHiddenEstadoIdsForSession(session);
  const restrictedSpaceIds = await getRestrictedSpaceIdsForSession(session);
  const estadosActivos = await prisma.estadoConfig.findMany({
    where: { entidad: "PREDIO", activo: true },
    select: { id: true, nombre: true, clave: true },
  });
  const conformesEstadoIds = estadosActivos
    .filter((estado) => getStateBucket(estado) === "conforme")
    .map((estado) => estado.id);
  const noConformesEstadoIds = estadosActivos
    .filter((estado) => getStateBucket(estado) === "noConforme")
    .map((estado) => estado.id);

  const where: Record<string, unknown> = {};
  appendAndClause(where, buildAssignedPredioVisibilityClause(idsVisibles));
  appendVisibleEstadosClause(where, hiddenEstadoIds);
  if (conformesEstadoIds.length > 0) {
    appendAndClause(where, {
      OR: [
        { estadoId: { notIn: conformesEstadoIds } },
        { estadoId: null },
      ],
    });
  }
  if (restrictedSpaceIds) {
    appendAndClause(where, {
      OR: [
        { espacioId: { in: restrictedSpaceIds } },
        { espacioId: null },
      ],
    });
  }

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

  const noConformesCountPromise = noConformesEstadoIds.length > 0
    ? prisma.predio.count({ where: { AND: [where, { estadoId: { in: noConformesEstadoIds } }] } })
    : Promise.resolve(0);

  const [predios, total, byEstado, sinEstado, sinGPS, sinEspacio, prioridadAlta, vencidas, hoy, noConformes] = await Promise.all([
    prisma.predio.findMany({
      where,
      include: {
        estado: { select: { id: true, nombre: true, clave: true, color: true, orden: true } },
        espacio: { select: { id: true, nombre: true, color: true } },
        asignaciones: { select: { id: true, usuario: { select: { id: true, nombre: true } } } },
        comentarios: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            contenido: true,
            createdAt: true,
            usuario: { select: { nombre: true } },
          },
        },
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
    noConformesCountPromise,
  ]);

  const prediosEnfocados = predios
    .map((predio) => {
      const isNoConforme = getStateBucket(predio.estado) === "noConforme";
      const m = isNoConforme ? motivoNoConformidad(predio) : null;
      // `comentarioReciente` lo consume la pantalla de mis tareas (muestra el autor), así
      // que se arma con la misma forma de siempre; sólo tiene sentido si el motivo salió
      // de un comentario.
      const comentarioReciente =
        m && m.fuente === "comentario"
          ? { contenido: m.motivo, createdAt: predio.comentarios?.[0]?.createdAt ?? null, autor: m.autor }
          : null;
      return {
        ...predio,
        isNoConforme,
        motivoNoConforme: m?.motivo || null,
        motivoFuente: m?.fuente ?? null,
        comentarioReciente,
      };
    })
    .sort((a, b) => {
      if (a.isNoConforme !== b.isNoConforme) return a.isNoConforme ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  const estadoIds = byEstado.map((item) => item.estadoId).filter(Boolean) as string[];
  const estados = estadoIds.length > 0
    ? await prisma.estadoConfig.findMany({ where: { id: { in: estadoIds } }, select: { id: true, nombre: true, color: true } })
    : [];
  const estadoMap = new Map(estados.map((estado) => [estado.id, estado]));

  return NextResponse.json({
    total,
    predios: prediosEnfocados,
    quickCounts: { sinEstado, sinGPS, sinEspacio, prioridadAlta, vencidas, hoy, noConformes },
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
