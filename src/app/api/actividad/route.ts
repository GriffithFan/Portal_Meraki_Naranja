import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entidad = searchParams.get("entidad");
  const entidadId = searchParams.get("entidadId");
  const limite = parseInt(searchParams.get("limite") || "50");

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const where: any = {};

  // Técnicos solo ven su propia actividad (a menos que filtren por entidadId)
  if (!isModOrAdmin(session.rol) && !entidadId) {
    where.userId = session.userId;
  }

  if (entidad) where.entidad = entidad;
  if (entidadId) where.entidadId = entidadId;

  const actividades = await prisma.actividad.findMany({
    where,
    include: {
      usuario: { select: { id: true, nombre: true, rol: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(limite, 200),
  });

  return NextResponse.json({ actividades });
}
