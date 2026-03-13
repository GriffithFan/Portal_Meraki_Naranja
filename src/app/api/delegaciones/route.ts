import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

// GET: obtener delegaciones del usuario actual, o todas si es admin/mod
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  const where: Record<string, unknown> = { activo: true };

  if (isModOrAdmin(session.rol) && userId) {
    // Admin/mod puede ver las delegaciones de cualquier usuario
    where.OR = [{ delegadorId: userId }, { delegadoId: userId }];
  } else if (isModOrAdmin(session.rol)) {
    // Admin/mod ve todas
  } else {
    // Técnico solo ve las suyas
    where.OR = [{ delegadorId: session.userId }, { delegadoId: session.userId }];
  }

  const delegaciones = await prisma.delegacion.findMany({
    where,
    include: {
      delegador: { select: { id: true, nombre: true, email: true, rol: true } },
      delegado: { select: { id: true, nombre: true, email: true, rol: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(delegaciones);
}

// POST: crear delegación (solo admin/mod)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isModOrAdmin(session.rol)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const body = await req.json();
  const { delegadorId, delegadoId, notas } = body as {
    delegadorId?: string;
    delegadoId?: string;
    notas?: string;
  };

  if (!delegadorId || !delegadoId) {
    return NextResponse.json({ error: "delegadorId y delegadoId requeridos" }, { status: 400 });
  }
  if (delegadorId === delegadoId) {
    return NextResponse.json({ error: "No se puede delegar a sí mismo" }, { status: 400 });
  }

  // Verificar que ambos usuarios existen
  const [delegador, delegado] = await Promise.all([
    prisma.user.findUnique({ where: { id: delegadorId }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: delegadoId }, select: { id: true } }),
  ]);
  if (!delegador || !delegado) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // Upsert: si ya existe, reactivar
  const delegacion = await prisma.delegacion.upsert({
    where: { delegadorId_delegadoId: { delegadorId, delegadoId } },
    update: { activo: true, notas: notas || null },
    create: { delegadorId, delegadoId, notas: notas || null },
    include: {
      delegador: { select: { id: true, nombre: true, email: true, rol: true } },
      delegado: { select: { id: true, nombre: true, email: true, rol: true } },
    },
  });

  return NextResponse.json(delegacion, { status: 201 });
}

// DELETE: desactivar delegación (solo admin/mod)
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isModOrAdmin(session.rol)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  await prisma.delegacion.update({
    where: { id },
    data: { activo: false },
  });

  return NextResponse.json({ ok: true });
}
