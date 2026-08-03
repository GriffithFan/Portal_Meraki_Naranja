import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Trae una conversación con sus mensajes (solo el dueño ADMIN). */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  const conv = await prisma.asistenteConversacion.findFirst({
    where: { id: params.id, userId: session.userId },
    select: {
      id: true,
      titulo: true,
      mensajes: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          rol: true,
          contenido: true,
          fuente: true,
          feedbackId: true,
          replyToId: true,
          replyTo: { select: { id: true, rol: true, contenido: true } },
          createdAt: true,
        },
      },
    },
  });
  if (!conv) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  // Adjuntar el voto actual de cada mensaje del bot (desde AsistenteFeedback).
  const fbIds = conv.mensajes.map((m) => m.feedbackId).filter(Boolean) as string[];
  const votos = fbIds.length
    ? await prisma.asistenteFeedback.findMany({ where: { id: { in: fbIds } }, select: { id: true, voto: true } })
    : [];
  const votoById = new Map(votos.map((v) => [v.id, v.voto]));
  const mensajes = conv.mensajes.map((m) => ({ ...m, voto: m.feedbackId ? votoById.get(m.feedbackId) ?? 0 : 0 }));

  return NextResponse.json({ id: conv.id, titulo: conv.titulo, mensajes });
}

/** Renombra una conversación. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  let body: { titulo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const titulo = String(body?.titulo || "").trim().slice(0, 120);
  if (!titulo) return NextResponse.json({ error: "Título vacío" }, { status: 400 });
  const res = await prisma.asistenteConversacion.updateMany({
    where: { id: params.id, userId: session.userId },
    data: { titulo },
  });
  if (res.count === 0) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Elimina una conversación (y sus mensajes por cascade). */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  const res = await prisma.asistenteConversacion.deleteMany({
    where: { id: params.id, userId: session.userId },
  });
  if (res.count === 0) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
