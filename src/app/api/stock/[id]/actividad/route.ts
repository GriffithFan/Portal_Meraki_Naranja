import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;

  const actividades = await prisma.actividad.findMany({
    where: { entidad: "EQUIPO", entidadId: id },
    include: { usuario: { select: { nombre: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(actividades, { headers: { "Cache-Control": "no-store" } });
}
