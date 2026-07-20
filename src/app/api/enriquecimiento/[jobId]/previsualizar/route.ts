import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { procesarSubida, resumenDePlan, type ParSnapshot } from "@/lib/enriquecimiento/procesar";
import type { AlcanceSpec } from "@/lib/enriquecimiento/alcance";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_FILE = 40 * 1024 * 1024;

// POST /api/enriquecimiento/[jobId]/previsualizar — dry-run del apply (solo ADMIN).
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN")
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { jobId } = await params;
  const job = await prisma.enriquecimientoJob.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 });
    if (file.size > MAX_FILE) return NextResponse.json({ error: "El archivo supera 40MB" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const pares = (job.paresSnapshot as unknown as ParSnapshot[]) || [];
    const { plan, errores } = await procesarSubida(buffer, pares, job.alcance as unknown as AlcanceSpec);

    return NextResponse.json({ resumen: resumenDePlan(plan, errores) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al procesar el archivo";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
