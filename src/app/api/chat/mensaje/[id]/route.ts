import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { publicarCambioChat } from "@/lib/chatBus";

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
      select: { id: true, autorId: true, archivoUrl: true, eliminadoAt: true, conversacionId: true },
    });

    if (!mensaje) {
      return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 });
    }

    // Solo el autor puede editar su mensaje
    if (mensaje.autorId !== session.userId) {
      return NextResponse.json({ error: "Solo podés editar tus propios mensajes" }, { status: 403 });
    }

    if (mensaje.eliminadoAt) {
      return NextResponse.json({ error: "No se puede editar un mensaje eliminado" }, { status: 400 });
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

    publicarCambioChat(mensaje.conversacionId, { tipo: "edicion", mensajeId: id });

    return NextResponse.json(actualizado);
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * DELETE /api/chat/mensaje/[id] — Eliminar mensaje propio (o Mesa/Admin cualquier mensaje)
 *
 * Soft-delete estilo WhatsApp: el mensaje no se borra de la base, se marca con
 * `eliminadoAt` y se limpia su contenido/archivo. La UI muestra
 * "Se eliminó este mensaje" en su lugar, conservando el hilo de respuestas.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;

  const mensaje = await prisma.chatMensaje.findUnique({
    where: { id },
    select: { id: true, autorId: true, archivoUrl: true, eliminadoAt: true, conversacionId: true },
  });

  if (!mensaje) {
    return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 });
  }

  if (mensaje.eliminadoAt) {
    return NextResponse.json({ ok: true });
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

  // Eliminar archivo del disco si existe (el contenido ya no se mostrará)
  if (mensaje.archivoUrl) {
    try {
      const { unlink } = await import("fs/promises");
      const { join } = await import("path");
      const filePath = join(process.cwd(), "uploads", "chat", mensaje.archivoUrl.split("/").pop()!);
      await unlink(filePath);
    } catch { /* archivo ya no existe */ }
  }

  await prisma.chatMensaje.update({
    where: { id },
    data: {
      eliminadoAt: new Date(),
      contenido: "",
      archivoUrl: null,
      archivoNombre: null,
      archivoTipo: null,
      archivoTamanio: null,
      reacciones: { deleteMany: {} },
    },
  });

  publicarCambioChat(mensaje.conversacionId, { tipo: "borrado", mensajeId: id });

  return NextResponse.json({ ok: true });
}
