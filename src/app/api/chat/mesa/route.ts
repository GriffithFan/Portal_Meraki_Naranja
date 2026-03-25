import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";

/**
 * PATCH /api/chat/mesa — Toggling esMesa en un usuario (solo admin)
 * Body: { userId: string, esMesa: boolean }
 */
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session.rol)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  try {
    const { userId, esMesa } = await request.json();

    if (!userId || typeof esMesa !== "boolean") {
      return NextResponse.json({ error: "userId y esMesa requeridos" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { esMesa },
      select: { id: true, nombre: true, email: true, rol: true, esMesa: true },
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * GET /api/chat/mesa — Lista usuarios Mesa activos
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const usuarios = await prisma.user.findMany({
    where: { esMesa: true, activo: true },
    select: { id: true, nombre: true },
  });

  return NextResponse.json(usuarios);
}
