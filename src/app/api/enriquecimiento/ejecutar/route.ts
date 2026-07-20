import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { resolverPrediosAlcance, type AlcanceSpec } from "@/lib/enriquecimiento/alcance";
import { ejecutarExtraccion } from "@/lib/enriquecimiento/ejecutar";

/* eslint-disable @typescript-eslint/no-explicit-any */

// POST /api/enriquecimiento/ejecutar — Fase 2: corre el extractor en el servidor
// y aplica el resultado, todo en background. Solo ADMIN.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN")
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  let alcance: AlcanceSpec;
  try {
    alcance = (await request.json()) as AlcanceSpec;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Solo una extracción a la vez (una sola sesión de Chrome/login).
  const enCurso = await prisma.enriquecimientoJob.findFirst({ where: { estado: "EJECUTANDO" } });
  if (enCurso)
    return NextResponse.json({ error: "Ya hay un enriquecimiento en curso. Esperá a que termine." }, { status: 409 });

  const predios = await resolverPrediosAlcance(alcance);
  const conPar = predios.filter((p) => p.codigo && p.incidencia);
  if (conPar.length === 0)
    return NextResponse.json({ error: "El alcance no tiene predios con incidencia para enriquecer" }, { status: 400 });

  const paresSnapshot = conPar.map((p) => ({ predioId: p.id, codigo: p.codigo, incidencia: p.incidencia }));
  const job = await prisma.enriquecimientoJob.create({
    data: {
      estado: "EJECUTANDO",
      alcance: alcance as any,
      paresSnapshot: paresSnapshot as any,
      resumen: { progreso: { fase: "En cola", hechos: 0, total: paresSnapshot.length } } as any,
      creadoPorId: session.userId,
    },
  });

  // Fire-and-forget: el runner actualiza el estado del job a medida que avanza.
  ejecutarExtraccion(job.id, conPar, alcance).catch((e) =>
    console.error("[enriquecimiento] runner no manejado:", (e as Error).message)
  );

  return NextResponse.json({ jobId: job.id, pares: paresSnapshot.length });
}
