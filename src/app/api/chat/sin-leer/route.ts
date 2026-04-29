import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

type ChatUnreadSnapshot = {
  estado: string;
  agenteId: string | null;
  leidoPorMesaAt: Date | string | null;
  leidoPorCreadorAt: Date | string | null;
  mensajes?: Array<{ autorId: string; createdAt: Date | string; autor?: { esMesa: boolean } | null }>;
};

function isUnreadForUser(conversacion: ChatUnreadSnapshot, userId: string, esMesa: boolean, esAdminOMod: boolean) {
  const last = conversacion.mensajes?.[0];
  if (!last) return false;

  if (esMesa || esAdminOMod) {
    if (conversacion.estado === "ABIERTA" && !conversacion.agenteId) return true;
    if (last.autor?.esMesa) return false;
    return !conversacion.leidoPorMesaAt || new Date(last.createdAt) > new Date(conversacion.leidoPorMesaAt);
  }

  if (last.autorId === userId) return false;
  return !conversacion.leidoPorCreadorAt || new Date(last.createdAt) > new Date(conversacion.leidoPorCreadorAt);
}

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
  const conversaciones = await prisma.chatConversacion.findMany({
    where: user?.esMesa || esAdminOMod
      ? { estado: { in: ["ABIERTA", "EN_CURSO"] } }
      : { creadorId: session.userId, estado: { in: ["ABIERTA", "EN_CURSO"] } },
    include: {
      mensajes: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { autorId: true, createdAt: true, autor: { select: { esMesa: true } } },
      },
    },
  });

  const count = conversaciones.filter((c) => isUnreadForUser(c, session.userId, user?.esMesa === true, esAdminOMod)).length;

  return NextResponse.json({ count });
}
