import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getEquipoDisplayName, resolveEquipoKey } from "@/utils/equipoUtils";

export const dynamic = "force-dynamic";

function getWeekRange(now = new Date()) {
  const day = now.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const desde = new Date(now);
  desde.setDate(now.getDate() - diffToMonday);
  desde.setHours(0, 0, 0, 0);
  const hasta = new Date(now);
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

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const now = new Date();
  const { desde, hasta } = getWeekRange(now);
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
            select: { usuario: { select: { id: true, nombre: true, rol: true, activo: true } } },
          },
        },
      })
    : [];

  const ranking = new Map<string, MutableRankingRow>();

  for (const predio of predios) {
    const bucket = getStateBucket(predio.estado);
    if (!bucket) continue;

    const assignedUsers = predio.asignaciones
      .map((asignacion) => asignacion.usuario)
      .filter((usuario) => !!usuario && usuario.activo !== false && usuario.rol === "TECNICO");

    for (const usuario of assignedUsers) {
      const equipoKey = resolveEquipoKey(usuario.nombre) || usuario.nombre;
      const current = ranking.get(usuario.id) || {
        tecnicoId: usuario.id,
        tecnicoNombre: getEquipoDisplayName(usuario.nombre),
        equipoKey,
        instaladosAuditar: 0,
        conformes: 0,
        noConformes: 0,
        total: 0,
      };
      addMetric(current, bucket);
      ranking.set(usuario.id, current);
    }
  }

  const rows = Array.from(ranking.values())
    .filter((row) => row.total > 0)
    .sort((left, right) => right.conformes - left.conformes || right.total - left.total || left.tecnicoNombre.localeCompare(right.tecnicoNombre, "es"));

  const isFriday = now.getDay() === 5;
  const maxConformes = rows[0]?.conformes || 0;
  const rankingRows: RankingRow[] = rows.map((row, index) => ({
    ...row,
    puesto: index + 1,
    esGanadorViernes: isFriday && row.conformes > 0 && row.conformes === maxConformes && index === 0,
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
    semana: getISOWeek(desde),
    desde: desde.toISOString(),
    hasta: hasta.toISOString(),
    isFriday,
    resumen,
    ranking: rankingRows,
  }, { headers: { "Cache-Control": "no-store" } });
}
