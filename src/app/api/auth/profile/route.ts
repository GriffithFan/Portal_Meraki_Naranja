import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/auth/profile — obtener perfil completo del usuario actual
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      nombre: true,
      email: true,
      rol: true,
      telefono: true,
      createdAt: true,
      _count: {
        select: {
          asignaciones: true,
          comentarios: true,
          prediosCreados: true,
        },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  return NextResponse.json({ user });
}

// PATCH /api/auth/profile — actualizar perfil propio (campos limitados)
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  // Solo permitir campos seguros
  const allowed: Record<string, any> = {};
  if (typeof body.nombre === "string" && body.nombre.trim().length >= 2) {
    allowed.nombre = body.nombre.trim().substring(0, 100);
  }
  if (typeof body.telefono === "string") {
    const tel = body.telefono.trim().substring(0, 30);
    allowed.telefono = tel || null;
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "Sin campos válidos para actualizar" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: session.userId },
    data: allowed,
    select: { id: true, nombre: true, email: true, rol: true, telefono: true },
  });

  return NextResponse.json({ user: updated });
}
