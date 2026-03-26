import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * GET /api/chat/sin-leer — Cuenta conversaciones con actividad pendiente
 *  - Técnico: conversaciones propias con mensajes no leídos de Mesa
 *  - Mesa: conversaciones ABIERTA sin asignar
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { esMesa: true, rol: true },
  });

  const esAdminOMod = user?.rol === "ADMIN" || user?.rol === "MODERADOR";
  let count = 0;

  if (user?.esMesa || esAdminOMod) {
    // Mesa y Admin/Mod: conversaciones abiertas sin asignar
    count = await prisma.chatConversacion.count({
      where: { estado: "ABIERTA", agenteId: null },
    });
  } else {
    // Técnico: ve si tiene conversación activa con mensajes nuevos del agente
    const activa = await prisma.chatConversacion.findFirst({
      where: {
        creadorId: session.userId,
        estado: { in: ["ABIERTA", "EN_CURSO"] },
      },
      include: {
        mensajes: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { autorId: true },
        },
      },
    });

    // Si el último mensaje no es del técnico, hay algo nuevo
    if (activa?.mensajes[0] && activa.mensajes[0].autorId !== session.userId) {
      count = 1;
    }
  }

  return NextResponse.json({ count });
}
