import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entidad = searchParams.get("entidad");
  const entidadId = searchParams.get("entidadId");
  const limite = Math.min(parseInt(searchParams.get("limite") || "50") || 50, 200);
  const page = Math.max(parseInt(searchParams.get("page") || "1") || 1, 1);
  const skip = (page - 1) * limite;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const where: any = {};

  // Técnicos solo ven su propia actividad (a menos que filtren por entidadId)
  if (!isModOrAdmin(session.rol) && !entidadId) {
    where.userId = session.userId;
  }

  if (entidad) where.entidad = entidad;
  if (entidadId) where.entidadId = entidadId;

  const [actividades, total] = await Promise.all([
    prisma.actividad.findMany({
      where,
      include: {
        usuario: { select: { id: true, nombre: true, rol: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limite,
      skip,
    }),
    prisma.actividad.count({ where }),
  ]);

  return NextResponse.json({ actividades, total, page, totalPages: Math.ceil(total / limite) });
}
