import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";

/**
 * POST /api/enriquecimiento/confirmar-conformes — pasa a CONFORME los predios que
 * el enriquecimiento detectó en NO CONFORME con la incidencia ya cerrada en Salesforce.
 *
 * Por qué existe: el enriquecimiento NUNCA saca solo a un predio de NO CONFORME.
 * Mover un NC a CONFORME acredita al técnico en el ranking y lo mete en la
 * facturación del viernes, así que la decisión la toma un admin viendo la evidencia
 * (comentario de Nivel 3, estados de nivel, auditoría). Este endpoint aplica esa
 * decisión, sobre los predios elegidos y solo si siguen en NO CONFORME.
 *
 * La transición se registra con el mismo formato "Estado: X -> Y" que usa el resto
 * del sistema, para que cuente en las métricas de conformes por transición.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  let ids: string[] = [];
  let jobId: string | null = null;
  try {
    const body = await request.json();
    ids = Array.isArray(body?.predioIds) ? body.predioIds.filter((x: unknown) => typeof x === "string") : [];
    jobId = typeof body?.jobId === "string" ? body.jobId : null;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  if (ids.length === 0) return NextResponse.json({ error: "Sin predios para confirmar" }, { status: 400 });

  const conforme = await prisma.estadoConfig.findFirst({
    where: { OR: [{ clave: "conforme" }, { nombre: { equals: "CONFORME", mode: "insensitive" } }] },
    select: { id: true },
  });
  if (!conforme) return NextResponse.json({ error: "No existe el estado CONFORME" }, { status: 500 });

  // Solo los que SIGUEN en NO CONFORME: entre que se generó el aviso y el clic pudo
  // haberlos movido otra persona, y no se pisa esa decisión.
  const predios = await prisma.predio.findMany({
    where: { id: { in: ids }, estado: { nombre: { equals: "NO CONFORME", mode: "insensitive" } } },
    select: { id: true, codigo: true, estado: { select: { nombre: true } } },
  });

  const ahora = new Date();
  for (const p of predios) {
    await prisma.predio.update({
      where: { id: p.id },
      data: { estadoId: conforme.id, fechaActualizacion: ahora },
    });
    await prisma.actividad.create({
      data: {
        accion: "EDITAR",
        descripcion: `Estado: ${p.estado?.nombre ?? "NO CONFORME"} -> CONFORME`,
        entidad: "PREDIO",
        entidadId: p.id,
        userId: session.userId,
        metadata: { origen: "enriquecimiento-confirmado", jobId } as any,
      },
    }).catch(() => { /* el log no debe romper la operación */ });
  }

  const omitidos = ids.length - predios.length;
  return NextResponse.json({
    ok: true,
    movidos: predios.length,
    omitidos,
    codigos: predios.map((p) => p.codigo),
    mensaje: omitidos > 0
      ? `${predios.length} pasaron a CONFORME. ${omitidos} se omitieron porque ya no estaban en NO CONFORME.`
      : `${predios.length} pasaron a CONFORME.`,
  });
}
