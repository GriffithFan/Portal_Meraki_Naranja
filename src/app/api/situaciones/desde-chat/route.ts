import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redactarSituacionDesdeChat } from "@/lib/asistente/claude";

export const dynamic = "force-dynamic";

/** Lista conversaciones de Mesa recientes (candidatas a convertir en situación). */
export async function GET() {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  const convs = await prisma.chatConversacion.findMany({
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: {
      id: true,
      asunto: true,
      estado: true,
      updatedAt: true,
      creador: { select: { nombre: true } },
      _count: { select: { mensajes: true } },
    },
  });
  return NextResponse.json(convs);
}

/** Genera un BORRADOR de situación a partir de una conversación (no la guarda). */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Falta configurar la API key del asistente" }, { status: 503 });
  }

  let body: { conversacionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const conversacionId = String(body?.conversacionId || "");
  if (!conversacionId) return NextResponse.json({ error: "Falta la conversación" }, { status: 400 });

  const conv = await prisma.chatConversacion.findUnique({
    where: { id: conversacionId },
    select: {
      asunto: true,
      creadorId: true,
      mensajes: {
        where: { eliminadoAt: null },
        orderBy: { createdAt: "asc" },
        select: { contenido: true, autorId: true },
      },
    },
  });
  if (!conv) return NextResponse.json({ error: "No se encontró la conversación" }, { status: 404 });

  const lineas = conv.mensajes
    .filter((m) => (m.contenido || "").trim())
    .map((m) => `${m.autorId === conv.creadorId ? "Técnico" : "Mesa"}: ${m.contenido.replace(/\s+/g, " ").trim()}`);
  const transcripcion = `${conv.asunto ? `Asunto: ${conv.asunto}\n` : ""}${lineas.join("\n")}`;

  try {
    const borrador = await redactarSituacionDesdeChat(transcripcion);
    if (!borrador || !borrador.pregunta.trim() || !borrador.respuesta.trim()) {
      return NextResponse.json({ borrador: null, mensaje: "Esta conversación no tiene una consulta técnica clara para convertir en situación." });
    }
    return NextResponse.json({ borrador, conversacionId });
  } catch (e) {
    console.error("[situaciones/desde-chat] error:", (e as Error).message);
    return NextResponse.json({ error: "No se pudo generar el borrador" }, { status: 502 });
  }
}
