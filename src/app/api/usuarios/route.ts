import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin, isModOrAdmin } from "@/lib/auth";
import { updateRolSchema, parseBody, isErrorResponse } from "@/lib/validation";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isModOrAdmin(session.rol)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const usuarios = await prisma.user.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, email: true, rol: true, esMesa: true },
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json(usuarios);
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isAdmin(session.rol)) return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  const data = await parseBody(req, updateRolSchema);
  if (isErrorResponse(data)) return data;

  const { userId, rol } = data;

  if (userId === session.userId) {
    return NextResponse.json({ error: "No puedes cambiar tu propio rol" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { rol },
    select: { id: true, nombre: true, email: true, rol: true, esMesa: true },
  });

  return NextResponse.json(updated);
}
