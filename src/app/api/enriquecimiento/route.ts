import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/enriquecimiento — historial de corridas (solo ADMIN)
export async function GET() {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN")
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const jobs = await prisma.enriquecimientoJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      estado: true,
      alcance: true,
      resumen: true,
      archivoEntrada: true,
      archivoSalida: true,
      createdAt: true,
      aplicadoAt: true,
      creadoPor: { select: { nombre: true } },
    },
  });

  return NextResponse.json({ jobs });
}
