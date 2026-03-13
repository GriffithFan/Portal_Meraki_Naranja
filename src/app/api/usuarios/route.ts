import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin, isModOrAdmin } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isModOrAdmin(session.rol)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const usuarios = await prisma.user.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, email: true, rol: true },
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json(usuarios);
}

const VALID_ROLES = ["ADMIN", "MODERADOR", "TECNICO"] as const;

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isAdmin(session.rol)) return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  const body = await req.json();
  const { userId, rol } = body as { userId?: string; rol?: string };

  if (!userId || !rol || !VALID_ROLES.includes(rol as typeof VALID_ROLES[number])) {
    return NextResponse.json({ error: "userId y rol válido requeridos" }, { status: 400 });
  }

  if (userId === session.userId) {
    return NextResponse.json({ error: "No puedes cambiar tu propio rol" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { rol: rol as typeof VALID_ROLES[number] },
    select: { id: true, nombre: true, email: true, rol: true },
  });

  return NextResponse.json(updated);
}
