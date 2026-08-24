import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { prediosFacturadosHasta, yaFueFacturado } from "@/lib/prediosFacturados";
import { getSession } from "@/lib/auth";
import { elegirTecnicoAcreditado } from "@/utils/equipoUtils";
import { inicioSemana, SEMANA_MS } from "@/lib/semanaRanking";

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
  const startMonday = new Date(inicioSemana(now).getTime() - (semanas - 1) * SEMANA_MS);

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
          id: true,
          fechaActualizacion: true,
          updatedAt: true,
          estado: { select: { nombre: true, clave: true } },
          asignaciones: {
            where: { tipo: { in: ["TAREA", "TECNICO"] } },
            select: { createdAt: true, usuario: { select: { id: true, nombre: true, rol: true, activo: true } } },
          },
        },
      })
    : [];

  const series = new Map<string, SerieTecnico>();
  const globalConformes = new Array(semanas).fill(0);
  const globalTotal = new Array(semanas).fill(0);

  // Un predio YA FACTURADO que vuelve a CONFORME (alguien lo pasa a INSTALADO y lo
  // devuelve) mueve su fechaActualizacion a la semana actual y volveria a contar en
  // una semana en la que nadie lo trabajo. Paso el 21/08/2026 con dos predios.
  const facturados = await prediosFacturadosHasta();

  for (const predio of predios) {
    const bucket = getStateBucket(predio.estado);
    if (!bucket) continue;
    const fecha = predio.fechaActualizacion || predio.updatedAt;
    if (!fecha) continue;
    // Solo los CONFORMES repetidos (ver el ranking): los NC y las reinstalaciones
    // de un predio ya facturado son eventos reales y siguen contando.
    if (bucket === "conformes" && yaFueFacturado(facturados, predio.id, fecha)) continue;
    const weekIndex = Math.floor((inicioSemana(fecha).getTime() - startMonday.getTime()) / SEMANA_MS);
    if (weekIndex < 0 || weekIndex >= semanas) continue;

    // Se acredita a UN SOLO técnico (el último asignado) para no duplicar el predio.
    const elegido = elegirTecnicoAcreditado(predio.asignaciones);
    if (elegido) {
      let serie = series.get(elegido.mergeKey);
      if (!serie) {
        serie = {
          tecnicoId: elegido.mergeKey,
          nombre: elegido.displayName,
          equipoKey: elegido.equipoKey,
          conformesPorSemana: new Array(semanas).fill(0),
          totalPorSemana: new Array(semanas).fill(0),
        };
        series.set(elegido.mergeKey, serie);
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
