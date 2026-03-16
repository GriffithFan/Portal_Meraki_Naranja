import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { notificacionMarcarSchema, notificacionCrearSchema, parseBody, isErrorResponse } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const soloNoLeidas = searchParams.get("noLeidas") === "true";

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const where: any = { userId: session.userId };
  if (soloNoLeidas) where.leida = false;

  const [notificaciones, sinLeer] = await Promise.all([
    prisma.notificacion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notificacion.count({
      where: { userId: session.userId, leida: false },
    }),
  ]);

  return NextResponse.json({ notificaciones, sinLeer });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const data = await parseBody(request, notificacionMarcarSchema);
    if (isErrorResponse(data)) return data;

    const { ids, marcarTodas } = data;

    if (marcarTodas) {
      await prisma.notificacion.updateMany({
        where: { userId: session.userId, leida: false },
        data: { leida: true },
      });
    } else if (ids && Array.isArray(ids)) {
      await prisma.notificacion.updateMany({
        where: { id: { in: ids }, userId: session.userId },
        data: { leida: true },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error actualizando notificaciones:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const data = await parseBody(request, notificacionCrearSchema);
    if (isErrorResponse(data)) return data;

    const { tipo, titulo, mensaje, userIds, enlace } = data;

    await prisma.notificacion.createMany({
      data: userIds.map((uid: string) => ({
        tipo: tipo || "GENERAL",
        titulo,
        mensaje,
        userId: uid,
        enlace: enlace || null,
      })),
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Error creando notificación:", error);
    return NextResponse.json({ error: "Error al crear notificación" }, { status: 500 });
  }
}
