import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/auditoria — Listado de registros de acceso (solo ADMIN)
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN")
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const limite = Math.min(Number(searchParams.get("limite")) || 50, 200);
  const offset = Number(searchParams.get("offset")) || 0;
  const userId = searchParams.get("userId");
  const accion = searchParams.get("accion");
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");

  const where: any = {};
  if (userId) where.userId = userId;
  if (accion) where.accion = accion;
  if (desde || hasta) {
    where.createdAt = {};
    if (desde) where.createdAt.gte = new Date(desde);
    if (hasta) where.createdAt.lte = new Date(hasta + "T23:59:59.999Z");
  }

  const [registros, total] = await Promise.all([
    prisma.registroAcceso.findMany({
      where,
      include: { usuario: { select: { id: true, nombre: true, email: true, rol: true } } },
      orderBy: { createdAt: "desc" },
      take: limite,
      skip: offset,
    }),
    prisma.registroAcceso.count({ where }),
  ]);

  return NextResponse.json({ registros, total });
}
