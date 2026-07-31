import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Analítica de huecos del asistente (solo ADMIN): totales, huecos (consultas que el
 * bot no supo), votos 👍/👎 y las listas recientes para revisar y curar situaciones.
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const [total, huecos, positivos, negativos, recientesHuecos, recientesNegativos] = await Promise.all([
    prisma.asistenteFeedback.count(),
    prisma.asistenteFeedback.count({ where: { tuvoRespuesta: false } }),
    prisma.asistenteFeedback.count({ where: { voto: 1 } }),
    prisma.asistenteFeedback.count({ where: { voto: -1 } }),
    prisma.asistenteFeedback.findMany({
      where: { tuvoRespuesta: false },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, pregunta: true, createdAt: true },
    }),
    prisma.asistenteFeedback.findMany({
      where: { voto: -1 },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, pregunta: true, respuesta: true, fuente: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    totales: { total, huecos, positivos, negativos },
    recientesHuecos,
    recientesNegativos,
  });
}
