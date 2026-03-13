import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const predioId = searchParams.get("predioId");
  const equipoId = searchParams.get("equipoId");

  if (!predioId && !equipoId) {
    return NextResponse.json({ error: "Se requiere predioId o equipoId" }, { status: 400 });
  }

  const comentarios = await prisma.comentario.findMany({
    where: predioId ? { predioId } : { equipoId },
    include: {
      usuario: { select: { id: true, nombre: true, rol: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ comentarios });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Solo admins y mods pueden crear comentarios
  if (!isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos para comentar" }, { status: 403 });
  }

  try {
    const { contenido, predioId, equipoId } = await request.json();

    if (!contenido?.trim()) {
      return NextResponse.json({ error: "El comentario no puede estar vacío" }, { status: 400 });
    }

    if (!predioId && !equipoId) {
      return NextResponse.json({ error: "Se requiere predioId o equipoId" }, { status: 400 });
    }

    const comentario = await prisma.comentario.create({
      data: {
        contenido: contenido.trim(),
        userId: session.userId,
        predioId: predioId || null,
        equipoId: equipoId || null,
      },
      include: {
        usuario: { select: { id: true, nombre: true, rol: true } },
      },
    });

    // Registrar actividad
    await prisma.actividad.create({
      data: {
        accion: "COMENTARIO",
        descripcion: `Nuevo comentario añadido`,
        entidad: predioId ? "PREDIO" : "EQUIPO",
        entidadId: predioId || equipoId || "",
        userId: session.userId,
        metadata: { contenido: contenido.substring(0, 100) },
      },
    });

    return NextResponse.json(comentario, { status: 201 });
  } catch (error) {
    console.error("Error creando comentario:", error);
    return NextResponse.json({ error: "Error al crear comentario" }, { status: 500 });
  }
}
