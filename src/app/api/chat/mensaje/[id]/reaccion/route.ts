import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const ALLOWED_REACTIONS = new Set(["👍", "❤️", "😂", "😮", "🙏", "✅"]);

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const emoji = typeof body?.emoji === "string" ? body.emoji.trim() : "";

    if (!ALLOWED_REACTIONS.has(emoji)) {
      return NextResponse.json({ error: "Reacción no permitida" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { esMesa: true, rol: true },
    });

    const mensaje = await prisma.chatMensaje.findUnique({
      where: { id },
      select: {
        id: true,
        conversacion: {
          select: {
            id: true,
            estado: true,
            creadorId: true,
            agenteId: true,
          },
        },
      },
    });

    if (!mensaje) {
      return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 });
    }

    const esCreador = mensaje.conversacion.creadorId === session.userId;
    const esAgente = mensaje.conversacion.agenteId === session.userId;
    const esMesa = user?.esMesa === true;
    const esAdminOMod = user?.rol === "ADMIN" || user?.rol === "MODERADOR";
    const puedeVer = esCreador || esAgente || esMesa || esAdminOMod;

    if (!puedeVer) {
      return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    }

    if (mensaje.conversacion.estado === "CERRADA") {
      return NextResponse.json({ error: "La conversación está cerrada" }, { status: 400 });
    }

    const existente = await prisma.chatMensajeReaction.findUnique({
      where: { mensajeId_userId: { mensajeId: id, userId: session.userId } },
    });

    if (existente && existente.emoji === emoji) {
      await prisma.chatMensajeReaction.delete({ where: { id: existente.id } });
    } else if (existente) {
      await prisma.chatMensajeReaction.update({ where: { id: existente.id }, data: { emoji } });
    } else {
      await prisma.chatMensajeReaction.create({
        data: {
          mensajeId: id,
          userId: session.userId,
          emoji,
        },
      });
    }

    await prisma.chatMensaje.update({ where: { id }, data: { updatedAt: new Date() } });
    await prisma.chatConversacion.update({ where: { id: mensaje.conversacion.id }, data: { updatedAt: new Date() } });

    const reacciones = await prisma.chatMensajeReaction.findMany({
      where: { mensajeId: id },
      select: { id: true, emoji: true, userId: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ mensajeId: id, reacciones });
  } catch (error) {
    console.error("[Chat] Error guardando reacción:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
