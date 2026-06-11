import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { markTyping } from "@/lib/chatTyping";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/chat/[id]/typing — Señala que el usuario está escribiendo.
 * No persiste nada: solo actualiza el store en memoria (TTL corto).
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;

  const conversacion = await prisma.chatConversacion.findUnique({
    where: { id },
    select: { id: true, estado: true, creadorId: true, agenteId: true },
  });

  if (!conversacion) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }
  if (conversacion.estado === "CERRADA") {
    return NextResponse.json({ ok: true });
  }

  const esCreador = conversacion.creadorId === session.userId;
  const esAgente = conversacion.agenteId === session.userId;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { esMesa: true },
  });
  const esMesaUser = user?.esMesa === true;

  // Mismo criterio que para enviar mensajes: creador, agente, o Mesa en EN_CURSO.
  if (!esCreador && !esAgente && !(esMesaUser && conversacion.estado === "EN_CURSO")) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  markTyping(id, session.userId);
  return NextResponse.json({ ok: true });
}
