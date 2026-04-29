import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { sanitizeSearch } from "@/lib/sanitize";
import { getAllEquipoVariants } from "@/utils/equipoUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function buildPredioVisibilityWhere(session: { rol: string; userId: string; nombre: string }) {
  if (isModOrAdmin(session.rol)) return {};

  const delegaciones = await prisma.delegacion.findMany({
    where: { delegadoId: session.userId, activo: true },
    select: { delegadorId: true },
  });
  const idsVisibles = [session.userId, ...delegaciones.map((delegacion) => delegacion.delegadorId)];
  const equipoMatch = getAllEquipoVariants(session.nombre);
  return {
    OR: [
      { asignaciones: { some: { userId: { in: idsVisibles } } } },
      { creadorId: { in: idsVisibles } },
      { equipoAsignado: equipoMatch.length > 0
        ? { in: equipoMatch, mode: "insensitive" as const }
        : { equals: session.nombre, mode: "insensitive" as const } },
    ],
  };
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const query = sanitizeSearch(new URL(request.url).searchParams.get("q"), 80);
  if (query.length < 2) {
    return NextResponse.json({ query, results: [], resumen: { predios: 0, stock: 0, total: 0 } });
  }

  const predioSearchWhere = {
    OR: [
      { nombre: { contains: query, mode: "insensitive" as const } },
      { codigo: { contains: query, mode: "insensitive" as const } },
      { incidencias: { contains: query, mode: "insensitive" as const } },
      { cue: { contains: query, mode: "insensitive" as const } },
      { provincia: { contains: query, mode: "insensitive" as const } },
      { equipoAsignado: { contains: query, mode: "insensitive" as const } },
      { nombreInstitucion: { contains: query, mode: "insensitive" as const } },
    ],
  };
  const predioWhere: any = await buildPredioVisibilityWhere(session);
  predioWhere.AND = predioWhere.AND ? [...predioWhere.AND, predioSearchWhere] : [predioSearchWhere];

  const stockWhere = {
    OR: [
      { nombre: { contains: query, mode: "insensitive" as const } },
      { modelo: { contains: query, mode: "insensitive" as const } },
      { marca: { contains: query, mode: "insensitive" as const } },
      { numeroSerie: { contains: query, mode: "insensitive" as const } },
      { etiqueta: { contains: query, mode: "insensitive" as const } },
      { proveedor: { contains: query, mode: "insensitive" as const } },
    ],
  };

  const [predios, prediosTotal, equipos, stockTotal] = await Promise.all([
    prisma.predio.findMany({
      where: predioWhere,
      select: {
        id: true,
        nombre: true,
        codigo: true,
        incidencias: true,
        provincia: true,
        equipoAsignado: true,
        prioridad: true,
        estado: { select: { nombre: true, color: true } },
        espacio: { select: { nombre: true } },
      },
      orderBy: [{ prioridad: "desc" }, { updatedAt: "desc" }],
      take: 6,
    }),
    prisma.predio.count({ where: predioWhere }),
    prisma.equipo.findMany({
      where: stockWhere,
      select: {
        id: true,
        nombre: true,
        modelo: true,
        numeroSerie: true,
        estado: true,
        ubicacion: true,
        etiqueta: true,
        asignado: { select: { nombre: true } },
        predio: { select: { nombre: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.equipo.count({ where: stockWhere }),
  ]);

  const results = [
    ...predios.map((predio) => {
      const searchValue = predio.codigo || predio.nombre;
      const params = new URLSearchParams({ search: searchValue });
      if (predio.codigo) params.set("open", predio.codigo);
      return {
        id: predio.id,
        type: "PREDIO",
        title: predio.codigo ? `${predio.codigo} · ${predio.nombre}` : predio.nombre,
        subtitle: [predio.incidencias, predio.provincia, predio.equipoAsignado, predio.espacio?.nombre].filter(Boolean).join(" · "),
        badge: predio.estado?.nombre || predio.prioridad,
        href: `/dashboard/tareas?${params.toString()}`,
      };
    }),
    ...equipos.map((equipo) => {
      const searchValue = equipo.numeroSerie || equipo.modelo || equipo.nombre;
      const params = new URLSearchParams({ search: searchValue });
      return {
        id: equipo.id,
        type: "STOCK",
        title: equipo.numeroSerie ? `${equipo.nombre} · ${equipo.numeroSerie}` : equipo.nombre,
        subtitle: [equipo.modelo, equipo.estado?.replace(/_/g, " "), equipo.asignado?.nombre || equipo.ubicacion || equipo.predio?.nombre, equipo.etiqueta].filter(Boolean).join(" · "),
        badge: equipo.estado?.replace(/_/g, " ") || "Stock",
        href: `/dashboard/stock?${params.toString()}`,
      };
    }),
  ].slice(0, 10);

  return NextResponse.json({
    query,
    results,
    resumen: { predios: prediosTotal, stock: stockTotal, total: prediosTotal + stockTotal },
  });
}
