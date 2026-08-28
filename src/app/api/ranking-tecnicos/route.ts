import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { elegirTecnicoAcreditado } from "@/utils/equipoUtils";
import { semanaRango } from "@/lib/semanaRanking";
import { prediosFacturadosHasta, yaFueFacturado } from "@/lib/prediosFacturados";
import { parseTransicion, bucketDeMovimiento } from "@/lib/transicionesEstado";

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

  const params = new URL(request.url).searchParams;
  const offset = Math.min(Math.max(parseInt(params.get("offset") || "0") || 0, 0), 52);
  /**
   * "estado" (por defecto): predios que HOY están en cada estado y se tocaron esta semana.
   * "movimientos": predios que PASARON a cada estado durante la semana, sigan ahí o no.
   * Ver lib/transicionesEstado.ts para por qué las dos formas dan números distintos.
   */
  const modo = params.get("modo") === "movimientos" ? "movimientos" : "estado";
  const isCurrentWeek = offset === 0;
  const now = new Date();
  const { desde, hasta } = semanaRango(now, offset);
  const estados = await prisma.estadoConfig.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, clave: true },
  });
  const estadoIds = estados.filter((estado) => getStateBucket(estado)).map((estado) => estado.id);

  // En modo "movimientos" esta consulta no se usa: ahí se parte del log de actividad.
  const predios = estadoIds.length > 0 && modo === "estado"
    ? await prisma.predio.findMany({
        where: {
          estadoId: { in: estadoIds },
          OR: [
            { fechaActualizacion: { gte: desde, lte: hasta } },
            { fechaActualizacion: null, updatedAt: { gte: desde, lte: hasta } },
          ],
        },
        select: {
          id: true,
          estado: { select: { nombre: true, clave: true } },
          fechaActualizacion: true,
          updatedAt: true,
          asignaciones: {
            where: { tipo: { in: ["TAREA", "TECNICO"] } },
            select: { createdAt: true, usuario: { select: { id: true, nombre: true, rol: true, activo: true } } },
          },
        },
      })
    : [];

  // Un predio ya facturado en una semana ANTERIOR no vuelve a sumar aunque lo muevan
  // de estado y regrese a CONFORME: seria cobrar dos veces el mismo trabajo. Paso el
  // 21/08/2026 con dos predios (ver lib/prediosFacturados.ts).
  const facturados = await prediosFacturadosHasta();

  const ranking = new Map<string, MutableRankingRow>();

  const acumular = (elegido: { mergeKey: string; displayName: string; equipoKey: string }, bucket: ReturnType<typeof getStateBucket>) => {
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
  };

  if (modo === "movimientos") {
    const acts = await prisma.actividad.findMany({
      where: { entidad: "PREDIO", descripcion: { contains: "Estado:" }, createdAt: { gte: desde, lte: hasta } },
      select: { entidadId: true, descripcion: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const idsMovidos = Array.from(new Set(acts.map((a) => a.entidadId).filter(Boolean))) as string[];
    const prediosMovidos = idsMovidos.length
      ? await prisma.predio.findMany({
          where: { id: { in: idsMovidos } },
          select: {
            id: true,
            asignaciones: {
              where: { tipo: { in: ["TAREA", "TECNICO"] } },
              select: { createdAt: true, usuario: { select: { id: true, nombre: true, rol: true, activo: true } } },
            },
          },
        })
      : [];
    const asignacionesPorPredio = new Map(prediosMovidos.map((p) => [p.id, p.asignaciones]));

    // Un predio que rebota (conforme -> NC -> conforme) en la misma semana cuenta UNA
    // vez por cuenta, para que el total siga siendo predios únicos como en el otro modo.
    const yaContado = new Set<string>();
    for (const act of acts) {
      if (!act.entidadId) continue;
      const tr = parseTransicion(act.descripcion);
      if (!tr) continue;
      const bucket = bucketDeMovimiento(tr.antes, tr.despues);
      if (!bucket) continue;
      const clave = `${act.entidadId}|${bucket}`;
      if (yaContado.has(clave)) continue;
      // Misma regla que el otro modo: un predio ya facturado antes no vuelve a sumar
      // como conforme, pero un NC o una reinstalación posterior sí se ven.
      if (bucket === "conformes" && yaFueFacturado(facturados, act.entidadId, act.createdAt)) continue;
      const elegido = elegirTecnicoAcreditado(asignacionesPorPredio.get(act.entidadId) || []);
      if (!elegido) continue;
      yaContado.add(clave);
      acumular(elegido, bucket);
    }
  } else {
  for (const predio of predios) {
    const bucket = getStateBucket(predio.estado);
    if (!bucket) continue;
    // Solo se suprimen los CONFORMES repetidos. Un predio ya facturado que vuelve
    // NO CONFORME es un rechazo real de trabajo ya cobrado, y una reinstalacion es
    // trabajo nuevo: esos si tienen que verse.
    if (bucket === "conformes" && yaFueFacturado(facturados, predio.id, predio.fechaActualizacion ?? predio.updatedAt)) continue;

    // Se acredita a UN SOLO técnico (el último asignado) para no duplicar el predio
    // cuando intervinieron varios. Así el total coincide con predios únicos.
    const elegido = elegirTecnicoAcreditado(predio.asignaciones);
    if (!elegido) continue;

    acumular(elegido, bucket);
  }
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
    modo,
    isCurrentWeek,
    semana: getISOWeek(desde),
    desde: desde.toISOString(),
    hasta: hasta.toISOString(),
    isFriday,
    resumen,
    ranking: rankingRows,
  }, { headers: { "Cache-Control": "no-store" } });
}
