import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { procesarSubida, resumenDePlan, type ParSnapshot } from "@/lib/enriquecimiento/procesar";
import { aplicarCambiosEnDB, backupBestEffort } from "@/lib/enriquecimiento/persistir";
import type { AlcanceSpec } from "@/lib/enriquecimiento/alcance";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_FILE = 40 * 1024 * 1024;

// POST /api/enriquecimiento/[jobId]/aplicar — aplica el enriquecimiento (solo ADMIN).
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN")
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { jobId } = await params;
  const job = await prisma.enriquecimientoJob.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });
  if (job.estado === "APLICADO")
    return NextResponse.json({ error: "Este job ya fue aplicado" }, { status: 409 });

  let plan, prediosPorCodigo, resumen;
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 });
    if (file.size > MAX_FILE) return NextResponse.json({ error: "El archivo supera 40MB" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const pares = (job.paresSnapshot as unknown as ParSnapshot[]) || [];
    const res = await procesarSubida(buffer, pares, job.alcance as unknown as AlcanceSpec);
    plan = res.plan;
    prediosPorCodigo = res.prediosPorCodigo;
    resumen = resumenDePlan(plan);

    // Guardamos el nombre del archivo subido para trazabilidad.
    await prisma.enriquecimientoJob.update({
      where: { id: jobId }, data: { archivoSalida: file.name },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al procesar el archivo";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (plan.cambios.length === 0) {
    await prisma.enriquecimientoJob.update({
      where: { id: jobId }, data: { estado: "APLICADO", aplicadoAt: new Date(), resumen: resumen as any },
    });
    return NextResponse.json({ resumen, aplicados: 0, nota: "No había nada para actualizar." });
  }

  await backupBestEffort();
  const { aplicados, cambiosPrevios } = await aplicarCambiosEnDB(jobId, plan.cambios, prediosPorCodigo);

  await prisma.enriquecimientoJob.update({
    where: { id: jobId },
    data: { estado: "APLICADO", aplicadoAt: new Date(), resumen: resumen as any, cambiosPrevios: cambiosPrevios as any },
  });

  return NextResponse.json({ resumen, aplicados });
}
