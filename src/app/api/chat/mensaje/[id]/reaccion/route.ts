import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const ALLOWED_REACTIONS = new Set(["👍", "❤️", "😂", "😮", "🙏", "🎉"]);

/**
 * POST /api/chat/mensaje/[id]/reaccion
 * Body: { emoji: string }
 * Alterna la reacción del usuario para un mensaje.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id: mensajeId } = await params;

  try {
    const body = await request.json();
    const emoji = String(body?.emoji || "").trim();

    if (!ALLOWED_REACTIONS.has(emoji)) {
      return NextResponse.json({ error: "Reacción inválida" }, { status: 400 });
    }

    const mensaje = await prisma.chatMensaje.findUnique({
      where: { id: mensajeId },
      select: {
        id: true,
        conversacionId: true,
        conversacion: { select: { creadorId: true, agenteId: true, estado: true } },
      },
    });

    if (!mensaje) return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 });

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { esMesa: true, rol: true },
    });

    const esCreador = mensaje.conversacion.creadorId === session.userId;
    const esAgente = mensaje.conversacion.agenteId === session.userId;
    const esMesa = user?.esMesa === true;
    const esAdminOMod = user?.rol === "ADMIN" || user?.rol === "MODERADOR";

    if (!esCreador && !esAgente && !esMesa && !esAdminOMod) {
      return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    }

    if (mensaje.conversacion.estado === "CERRADA") {
      return NextResponse.json({ error: "No se puede reaccionar en chats cerrados" }, { status: 400 });
    }

    const actual = await prisma.chatMensajeReaction.findUnique({
      where: { mensajeId_userId: { mensajeId, userId: session.userId } },
      select: { id: true, emoji: true },
    });

    if (actual?.emoji === emoji) {
      await prisma.chatMensajeReaction.delete({ where: { id: actual.id } });
    } else if (actual) {
      await prisma.chatMensajeReaction.update({
        where: { id: actual.id },
        data: { emoji },
      });
    } else {
      await prisma.chatMensajeReaction.create({
        data: { mensajeId, userId: session.userId, emoji },
      });
    }

    const reacciones = await prisma.chatMensajeReaction.findMany({
      where: { mensajeId },
      select: { id: true, userId: true, emoji: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ ok: true, mensajeId, reacciones });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
