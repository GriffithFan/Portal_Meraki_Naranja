import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getEquipoDisplayName, normalizeAssigneeName, resolveEquipoKey } from "@/utils/equipoUtils";

export const dynamic = "force-dynamic";

const DIA_MS = 86400000;
const SEMANA_MS = 7 * DIA_MS;

// Lunes 00:00 de la semana de `d`.
function mondayOf(d: Date): Date {
  const base = new Date(d);
  const day = base.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  base.setDate(base.getDate() - diffToMonday);
  base.setHours(0, 0, 0, 0);
  return base;
}

function getISOWeek(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function normalizeText(value?: string | null) {
  return (value || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_\s-]+/g, "");
}

function getStateBucket(estado?: { nombre?: string | null; clave?: string | null } | null) {
  const nombre = normalizeText(estado?.nombre);
  const clave = normalizeText(estado?.clave);
  if (nombre === "conforme" || clave === "conforme") return "conformes";
  if (nombre === "noconforme" || clave === "noconforme" || nombre === "nc" || clave === "nc") return "noConformes";
  if (nombre.includes("instalad") || clave.includes("instalad") || nombre.includes("auditar") || clave.includes("auditar")) return "instaladosAuditar";
  return null;
}

type SerieTecnico = {
  tecnicoId: string;
  nombre: string;
  equipoKey: string;
  conformesPorSemana: number[];
  totalPorSemana: number[];
};

// Evolución de conformes/total por semana de cada técnico durante las últimas N semanas.
// Hace UNA sola query sobre todo el rango y agrupa por semana en memoria.
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const semanas = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get("semanas") || "8") || 8, 4), 16);
  const now = new Date();
  const startMonday = new Date(mondayOf(now).getTime() - (semanas - 1) * SEMANA_MS);

  const semanasMeta = Array.from({ length: semanas }, (_, i) => {
    const desde = new Date(startMonday.getTime() + i * SEMANA_MS);
    return { label: getISOWeek(desde), desde: desde.toISOString() };
  });

  const estados = await prisma.estadoConfig.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, clave: true },
  });
  const estadoIds = estados.filter((e) => getStateBucket(e)).map((e) => e.id);

  const predios = estadoIds.length > 0
    ? await prisma.predio.findMany({
        where: {
          estadoId: { in: estadoIds },
          OR: [
            { fechaActualizacion: { gte: startMonday, lte: now } },
            { fechaActualizacion: null, updatedAt: { gte: startMonday, lte: now } },
          ],
        },
        select: {
          fechaActualizacion: true,
          updatedAt: true,
          estado: { select: { nombre: true, clave: true } },
          asignaciones: {
            where: { tipo: { in: ["TAREA", "TECNICO"] } },
            select: { usuario: { select: { id: true, nombre: true, rol: true, activo: true } } },
          },
        },
      })
    : [];

  const series = new Map<string, SerieTecnico>();
  const globalConformes = new Array(semanas).fill(0);
  const globalTotal = new Array(semanas).fill(0);

  for (const predio of predios) {
    const bucket = getStateBucket(predio.estado);
    if (!bucket) continue;
    const fecha = predio.fechaActualizacion || predio.updatedAt;
    if (!fecha) continue;
    const weekIndex = Math.floor((mondayOf(fecha).getTime() - startMonday.getTime()) / SEMANA_MS);
    if (weekIndex < 0 || weekIndex >= semanas) continue;

    const assignedUsers = predio.asignaciones
      .map((a) => a.usuario)
      .filter((u) => !!u && u.activo !== false && u.rol === "TECNICO");

    const uniqueTargets = new Map<string, { tecnicoId: string; nombre: string; equipoKey: string }>();
    for (const usuario of assignedUsers) {
      const resolvedKey = resolveEquipoKey(usuario!.nombre);
      const mergeKey = resolvedKey || normalizeAssigneeName(usuario!.nombre) || usuario!.id;
      if (!mergeKey || uniqueTargets.has(mergeKey)) continue;
      const equipoKey = resolvedKey || usuario!.nombre;
      uniqueTargets.set(mergeKey, { tecnicoId: mergeKey, nombre: getEquipoDisplayName(equipoKey), equipoKey });
    }

    for (const target of Array.from(uniqueTargets.values())) {
      let serie = series.get(target.tecnicoId);
      if (!serie) {
        serie = {
          tecnicoId: target.tecnicoId,
          nombre: target.nombre,
          equipoKey: target.equipoKey,
          conformesPorSemana: new Array(semanas).fill(0),
          totalPorSemana: new Array(semanas).fill(0),
        };
        series.set(target.tecnicoId, serie);
      }
      serie.totalPorSemana[weekIndex] += 1;
      if (bucket === "conformes") serie.conformesPorSemana[weekIndex] += 1;
    }

    // Global (sin duplicar por técnico): cuenta el predio una vez.
    globalTotal[weekIndex] += 1;
    if (bucket === "conformes") globalConformes[weekIndex] += 1;
  }

  const tecnicos = Array.from(series.values())
    .filter((s) => s.totalPorSemana.some((n) => n > 0))
    .sort((a, b) => {
      const sa = a.conformesPorSemana.reduce((x, y) => x + y, 0);
      const sb = b.conformesPorSemana.reduce((x, y) => x + y, 0);
      return sb - sa || a.nombre.localeCompare(b.nombre, "es");
    });

  return NextResponse.json({
    generatedAt: now.toISOString(),
    semanas: semanasMeta,
    global: { conformesPorSemana: globalConformes, totalPorSemana: globalTotal },
    tecnicos,
  }, { headers: { "Cache-Control": "no-store" } });
}
