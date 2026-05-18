import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SAMPLE_LIMIT = 8;

const predioSelect = {
  id: true,
  codigo: true,
  nombre: true,
  incidencias: true,
  cue: true,
  cuePredio: true,
  provincia: true,
  equipoAsignado: true,
  fechaHasta: true,
  fechaProgramada: true,
  updatedAt: true,
  estado: { select: { nombre: true, color: true } },
  espacio: { select: { nombre: true } },
  asignaciones: { select: { usuario: { select: { nombre: true } } }, take: 3 },
};

function missingGpsWhere() {
  return {
    AND: [
      { OR: [{ gpsPredio: null }, { gpsPredio: "" }] },
      { OR: [{ latitud: null }, { longitud: null }] },
    ],
  };
}

async function sample(where: any) {
  return prisma.predio.findMany({
    where,
    select: predioSelect,
    orderBy: [{ updatedAt: "desc" }],
    take: SAMPLE_LIMIT,
  });
}

async function duplicateCue() {
  const groups = await prisma.predio.groupBy({
    by: ["cue"],
    where: { cue: { not: null }, NOT: [{ cue: "" }] },
    _count: { _all: true },
    having: { cue: { _count: { gt: 1 } } },
    orderBy: { _count: { cue: "desc" } },
    take: 8,
  });
  const values = groups.map((item) => item.cue).filter(Boolean) as string[];
  const rows = values.length
    ? await prisma.predio.findMany({
        where: { cue: { in: values } },
        select: predioSelect,
        orderBy: [{ cue: "asc" }, { updatedAt: "desc" }],
        take: 24,
      })
    : [];
  return { count: groups.reduce((acc, item) => acc + item._count._all, 0), groups, rows };
}

async function duplicateCuePredio() {
  const groups = await prisma.predio.groupBy({
    by: ["cuePredio"],
    where: { cuePredio: { not: null }, NOT: [{ cuePredio: "" }] },
    _count: { _all: true },
    having: { cuePredio: { _count: { gt: 1 } } },
    orderBy: { _count: { cuePredio: "desc" } },
    take: 8,
  });
  const values = groups.map((item) => item.cuePredio).filter(Boolean) as string[];
  const rows = values.length
    ? await prisma.predio.findMany({
        where: { cuePredio: { in: values } },
        select: predioSelect,
        orderBy: [{ cuePredio: "asc" }, { updatedAt: "desc" }],
        take: 24,
      })
    : [];
  return { count: groups.reduce((acc, item) => acc + item._count._all, 0), groups, rows };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isModOrAdmin(session.rol)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const rules = {
    sinEstado: { estadoId: null },
    sinEquipo: { OR: [{ equipoAsignado: null }, { equipoAsignado: "" }] },
    sinGps: missingGpsWhere(),
    sinEspacio: { espacioId: null },
    sinAsignacion: { asignaciones: { none: {} } },
    vencidas: {
      OR: [
        { fechaHasta: { lt: startOfToday } },
        { fechaProgramada: { lt: startOfToday } },
      ],
    },
    sinProvincia: { OR: [{ provincia: null }, { provincia: "" }] },
    sinCue: { OR: [{ cue: null }, { cue: "" }] },
  };

  const [total, counts, samples, cueDuplicado, cuePredioDuplicado] = await Promise.all([
    prisma.predio.count(),
    Promise.all(Object.entries(rules).map(async ([key, where]) => [key, await prisma.predio.count({ where })] as const)),
    Promise.all(Object.entries(rules).map(async ([key, where]) => [key, await sample(where)] as const)),
    duplicateCue(),
    duplicateCuePredio(),
  ]);

  const countMap = Object.fromEntries(counts);
  const sampleMap = Object.fromEntries(samples);
  const issues = [
    { key: "sin-estado", title: "Sin estado", count: countMap.sinEstado, severity: "alta", href: "/dashboard/tareas?quick=sin-estado", sample: sampleMap.sinEstado },
    { key: "sin-equipo", title: "Sin equipo", count: countMap.sinEquipo, severity: "alta", href: "/dashboard/tareas?quick=sin-equipo", sample: sampleMap.sinEquipo },
    { key: "sin-gps", title: "Sin GPS", count: countMap.sinGps, severity: "media", href: "/dashboard/tareas?quick=sin-gps", sample: sampleMap.sinGps },
    { key: "sin-espacio", title: "Sin espacio", count: countMap.sinEspacio, severity: "media", href: "/dashboard/tareas?quick=sin-espacio", sample: sampleMap.sinEspacio },
    { key: "sin-asignacion", title: "Sin asignacion formal", count: countMap.sinAsignacion, severity: "media", href: "/dashboard/tareas", sample: sampleMap.sinAsignacion },
    { key: "vencidas", title: "Fechas vencidas", count: countMap.vencidas, severity: "alta", href: "/dashboard/tareas?quick=vencidas", sample: sampleMap.vencidas },
    { key: "sin-provincia", title: "Sin provincia", count: countMap.sinProvincia, severity: "baja", href: "/dashboard/tareas", sample: sampleMap.sinProvincia },
    { key: "sin-cue", title: "Sin CUE", count: countMap.sinCue, severity: "baja", href: "/dashboard/tareas", sample: sampleMap.sinCue },
    { key: "cue-duplicado", title: "CUE duplicado", count: cueDuplicado.count, severity: "alta", href: "/dashboard/tareas", sample: cueDuplicado.rows, groups: cueDuplicado.groups },
    { key: "cue-predio-duplicado", title: "CUE predio duplicado", count: cuePredioDuplicado.count, severity: "media", href: "/dashboard/tareas", sample: cuePredioDuplicado.rows, groups: cuePredioDuplicado.groups },
  ];

  const weightedScore = issues.reduce((acc, issue) => {
    const weight = issue.severity === "alta" ? 3 : issue.severity === "media" ? 2 : 1;
    return acc + Math.min(issue.count, total) * weight;
  }, 0);
  const maxScore = Math.max(total * 12, 1);
  const quality = Math.max(0, Math.min(100, Math.round(100 - (weightedScore / maxScore) * 100)));

  return NextResponse.json({
    generatedAt: now.toISOString(),
    total,
    quality,
    issues,
  }, { headers: { "Cache-Control": "private, max-age=30" } });
}
