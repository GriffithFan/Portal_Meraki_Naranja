import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { cancelarProcesoExtraccion } from "@/lib/enriquecimiento/ejecutar";

// POST /api/enriquecimiento/[jobId]/cancelar — cancela una corrida EJECUTANDO.
// Si el proceso ya no existe (p.ej. lo mató un reinicio del servidor), el job
// "huérfano" se marca como ERROR para destrabar el historial. Solo ADMIN.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN")
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { jobId } = await params;
  const job = await prisma.enriquecimientoJob.findUnique({
    where: { id: jobId },
    select: { id: true, estado: true },
  });
  if (!job) return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });
  if (job.estado !== "EJECUTANDO")
    return NextResponse.json({ error: `El job no está en ejecución (estado: ${job.estado})` }, { status: 400 });

  const resultado = cancelarProcesoExtraccion(jobId);
  if (resultado === "huerfano") {
    // Sin proceso vivo: marcarlo como fallido directamente.
    await prisma.enriquecimientoJob.update({
      where: { id: jobId },
      data: { estado: "ERROR", resumen: { error: "Job interrumpido (el proceso ya no existía, probablemente por un reinicio del servidor)" } },
    });
  }
  // Si hubo proceso, el propio runner marca ERROR "Cancelado por el usuario" al cerrarse.

  await prisma.actividad.create({
    data: {
      accion: "EDITAR",
      descripcion: resultado === "cancelado" ? "Enriquecimiento cancelado" : "Enriquecimiento huérfano marcado como fallido",
      entidad: "ENRIQUECIMIENTO",
      entidadId: jobId,
      userId: session.userId,
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, resultado });
}
