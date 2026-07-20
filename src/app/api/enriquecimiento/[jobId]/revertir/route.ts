import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

const DATE_FIELDS = new Set(["fechaDesde", "fechaHasta"]);

// POST /api/enriquecimiento/[jobId]/revertir — restaura los valores previos (solo ADMIN).
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN")
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { jobId } = await params;
  const job = await prisma.enriquecimientoJob.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });
  if (job.estado !== "APLICADO")
    return NextResponse.json({ error: "Solo se puede revertir un job aplicado" }, { status: 409 });

  const cambios = (job.cambiosPrevios as Record<string, Record<string, any>>) || {};
  const predioIds = Object.keys(cambios);
  if (predioIds.length === 0) {
    await prisma.enriquecimientoJob.update({ where: { id: jobId }, data: { estado: "REVERTIDO" } });
    return NextResponse.json({ revertidos: 0 });
  }

  let revertidos = 0;
  await prisma.$transaction(async (tx) => {
    for (const predioId of predioIds) {
      const previos = cambios[predioId] || {};
      const data: Record<string, any> = {};
      for (const [campo, valor] of Object.entries(previos)) {
        if (DATE_FIELDS.has(campo)) data[campo] = valor ? new Date(valor) : null;
        else data[campo] = valor; // strings, números, camposExtra (objeto) o null
      }
      // Deshacer la marca de enriquecimiento de este job.
      data.ultimoEnriquecimiento = null;
      data.enriquecimientoJobId = null;
      await tx.predio.update({ where: { id: predioId }, data });
      revertidos++;
    }
  }, { timeout: 180000 });

  await prisma.enriquecimientoJob.update({ where: { id: jobId }, data: { estado: "REVERTIDO" } });
  return NextResponse.json({ revertidos });
}
