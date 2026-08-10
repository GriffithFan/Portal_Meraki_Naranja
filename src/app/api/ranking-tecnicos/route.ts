import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { elegirTecnicoAcreditado } from "@/utils/equipoUtils";
import { semanaRango } from "@/lib/semanaRanking";

export const dynamic = "force-dynamic";

function getISOWeek(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function normalizeText(value?: string | null) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\s-]+/g, "");
}

function getStateBucket(estado?: { nombre?: string | null; clave?: string | null } | null) {
  const nombre = normalizeText(estado?.nombre);
  const clave = normalizeText(estado?.clave);
  if (nombre === "conforme" || clave === "conforme") return "conformes";
  if (nombre === "noconforme" || clave === "noconforme" || nombre === "nc" || clave === "nc") return "noConformes";
  if (nombre.includes("instalad") || clave.includes("instalad") || nombre.includes("auditar") || clave.includes("auditar")) return "instaladosAuditar";
  return null;
}

type RankingRow = {
  tecnicoId: string;
  tecnicoNombre: string;
  equipoKey: string;
  instaladosAuditar: number;
  conformes: number;
  noConformes: number;
  total: number;
  puesto: number;
  esGanadorViernes: boolean;
};

type MutableRankingRow = Omit<RankingRow, "puesto" | "esGanadorViernes">;

function addMetric(row: MutableRankingRow, bucket: ReturnType<typeof getStateBucket>) {
  if (bucket === "instaladosAuditar") row.instaladosAuditar += 1;
  if (bucket === "conformes") row.conformes += 1;
  if (bucket === "noConformes") row.noConformes += 1;
  row.total += 1;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const offset = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get("offset") || "0") || 0, 0), 52);
  const isCurrentWeek = offset === 0;
  const now = new Date();
  const { desde, hasta } = semanaRango(now, offset);
  const estados = await prisma.estadoConfig.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, clave: true },
  });
  const estadoIds = estados.filter((estado) => getStateBucket(estado)).map((estado) => estado.id);

  const predios = estadoIds.length > 0
    ? await prisma.predio.findMany({
        where: {
          estadoId: { in: estadoIds },
          OR: [
            { fechaActualizacion: { gte: desde, lte: hasta } },
            { fechaActualizacion: null, updatedAt: { gte: desde, lte: hasta } },
          ],
        },
        select: {
          estado: { select: { nombre: true, clave: true } },
          asignaciones: {
            where: { tipo: { in: ["TAREA", "TECNICO"] } },
            select: { createdAt: true, usuario: { select: { id: true, nombre: true, rol: true, activo: true } } },
          },
        },
      })
    : [];

  const ranking = new Map<string, MutableRankingRow>();

  for (const predio of predios) {
    const bucket = getStateBucket(predio.estado);
    if (!bucket) continue;

    // Se acredita a UN SOLO técnico (el último asignado) para no duplicar el predio
    // cuando intervinieron varios. Así el total coincide con predios únicos.
    const elegido = elegirTecnicoAcreditado(predio.asignaciones);
    if (!elegido) continue;

    const current = ranking.get(elegido.mergeKey) || {
      tecnicoId: elegido.mergeKey,
      tecnicoNombre: elegido.displayName,
      equipoKey: elegido.equipoKey,
      instaladosAuditar: 0,
      conformes: 0,
      noConformes: 0,
      total: 0,
    };
    addMetric(current, bucket);
    ranking.set(elegido.mergeKey, current);
  }

  const rows = Array.from(ranking.values())
    .filter((row) => row.total > 0)
    .sort((left, right) => right.conformes - left.conformes || right.total - left.total || left.tecnicoNombre.localeCompare(right.tecnicoNombre, "es"));

  const isFriday = now.getUTCDay() === 5;
  const maxConformes = rows[0]?.conformes || 0;
  const rankingRows: RankingRow[] = rows.map((row, index) => ({
    ...row,
    puesto: index + 1,
    // Semana actual: corona solo el viernes (en vivo). Semanas pasadas (cerradas): corona al #1.
    esGanadorViernes: index === 0 && row.conformes > 0 && row.conformes === maxConformes && (isCurrentWeek ? isFriday : true),
  }));

  const resumen = rankingRows.reduce((acc, row) => {
    acc.instaladosAuditar += row.instaladosAuditar;
    acc.conformes += row.conformes;
    acc.noConformes += row.noConformes;
    acc.total += row.total;
    return acc;
  }, { instaladosAuditar: 0, conformes: 0, noConformes: 0, total: 0 });

  return NextResponse.json({
    generatedAt: now.toISOString(),
    offset,
    isCurrentWeek,
    semana: getISOWeek(desde),
    desde: desde.toISOString(),
    hasta: hasta.toISOString(),
    isFriday,
    resumen,
    ranking: rankingRows,
  }, { headers: { "Cache-Control": "no-store" } });
}
