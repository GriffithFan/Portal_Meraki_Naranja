import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/chat/mensaje/[id] — Editar mensaje propio
 * Body: { contenido: string }
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const { contenido } = body;

    if (!contenido?.trim()) {
      return NextResponse.json({ error: "Contenido requerido" }, { status: 400 });
    }

    const mensaje = await prisma.chatMensaje.findUnique({
      where: { id },
      select: { id: true, autorId: true, archivoUrl: true },
    });

    if (!mensaje) {
      return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 });
    }

    // Solo el autor puede editar su mensaje
    if (mensaje.autorId !== session.userId) {
      return NextResponse.json({ error: "Solo podés editar tus propios mensajes" }, { status: 403 });
    }

    // No permitir editar mensajes que son solo archivo (sin texto)
    if (mensaje.archivoUrl) {
      return NextResponse.json({ error: "No se pueden editar mensajes con archivo" }, { status: 400 });
    }

    const actualizado = await prisma.chatMensaje.update({
      where: { id },
      data: {
        contenido: contenido.trim().slice(0, 2000),
        editadoAt: new Date(),
      },
    });

    return NextResponse.json(actualizado);
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * DELETE /api/chat/mensaje/[id] — Eliminar mensaje propio (o Mesa/Admin cualquier mensaje)
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;

  const mensaje = await prisma.chatMensaje.findUnique({
    where: { id },
    select: { id: true, autorId: true, archivoUrl: true },
  });

  if (!mensaje) {
    return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { esMesa: true, rol: true },
  });

  const esAutor = mensaje.autorId === session.userId;
  const esMesaOAdmin = user?.esMesa === true || user?.rol === "ADMIN";

  // Autor puede borrar su propio mensaje, Mesa/Admin puede borrar cualquiera
  if (!esAutor && !esMesaOAdmin) {
    return NextResponse.json({ error: "Sin permisos para eliminar este mensaje" }, { status: 403 });
  }

  // Eliminar archivo del disco si existe
  if (mensaje.archivoUrl) {
    try {
      const { unlink } = await import("fs/promises");
      const { join } = await import("path");
      const filePath = join(process.cwd(), "uploads", "chat", mensaje.archivoUrl.split("/").pop()!);
      await unlink(filePath);
    } catch { /* archivo ya no existe */ }
  }

  await prisma.chatMensaje.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
