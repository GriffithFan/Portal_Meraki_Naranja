import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/enriquecimiento/[jobId]/estado — estado + progreso de una corrida (polling). Solo ADMIN.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN")
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { jobId } = await params;
  const job = await prisma.enriquecimientoJob.findUnique({
    where: { id: jobId },
    select: { id: true, estado: true, resumen: true, aplicadoAt: true },
  });
  if (!job) return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });
  return NextResponse.json(job);
}
