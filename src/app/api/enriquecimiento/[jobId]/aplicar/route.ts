import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { procesarSubida, resumenDePlan, type ParSnapshot } from "@/lib/enriquecimiento/procesar";
import type { AlcanceSpec } from "@/lib/enriquecimiento/alcance";

/* eslint-disable @typescript-eslint/no-explicit-any */

const execFileAsync = promisify(execFile);
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

  // Backup best-effort de la base antes de escribir (no bloquea si falla / no existe).
  try {
    await execFileAsync("bash", ["scripts/backup-production.sh"], {
      cwd: process.env.APP_DIR || "/var/www/carrot",
      env: { ...process.env, DB_ONLY: "1" },
      timeout: 90000,
    });
  } catch (e) {
    console.error("[enriquecimiento] backup best-effort falló (se continúa):", (e as Error).message);
  }

  // cambiosPrevios por predio (incluye camposExtra completo previo si se toca).
  const cambiosPrevios: Record<string, any> = {};
  const ahora = new Date();

  await prisma.$transaction(async (tx) => {
    for (const c of plan!.cambios) {
      const data: Record<string, any> = { ...c.upd };
      const previos: Record<string, any> = { ...c.cambiosPrevios };
      if (Object.keys(c.extra).length > 0) {
        const actual = prediosPorCodigo!.get(c.codigo);
        const baseExtra = (actual?.camposExtra && typeof actual.camposExtra === "object") ? actual.camposExtra : {};
        previos.camposExtra = actual?.camposExtra ?? null; // para revertir el objeto completo
        data.camposExtra = { ...baseExtra, ...c.extra };
      }
      data.ultimoEnriquecimiento = ahora;
      data.enriquecimientoJobId = jobId;
      data.fechaActualizacion = ahora;
      cambiosPrevios[c.predioId] = previos;
      await tx.predio.update({ where: { id: c.predioId }, data });
    }
  }, { timeout: 180000 });

  await prisma.enriquecimientoJob.update({
    where: { id: jobId },
    data: { estado: "APLICADO", aplicadoAt: ahora, resumen: resumen as any, cambiosPrevios: cambiosPrevios as any },
  });

  return NextResponse.json({ resumen, aplicados: plan.cambios.length });
}
