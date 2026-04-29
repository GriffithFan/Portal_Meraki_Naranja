import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { enviarPushYBandeja } from "@/lib/pushNotifications";

const REMINDER_MINUTES = 15;

type ChatUnreadSnapshot = {
  estado: string;
  agenteId: string | null;
  leidoPorMesaAt: Date | string | null;
  leidoPorCreadorAt: Date | string | null;
  mensajes?: Array<{
    contenido: string;
    autorId: string;
    createdAt: Date | string;
    autor?: { nombre: string; esMesa: boolean } | null;
  }>;
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

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { esMesa: true, rol: true },
  });

  const esMesa = user?.esMesa === true;
  const esAdminOMod = user?.rol === "ADMIN" || user?.rol === "MODERADOR";
  const since = new Date(Date.now() - REMINDER_MINUTES * 60 * 1000);

  const where = esMesa || esAdminOMod
    ? {
        estado: { in: ["ABIERTA", "EN_CURSO"] },
        OR: [
          { estado: "ABIERTA", agenteId: null },
          { agenteId: session.userId },
          { mensajes: { some: { autorId: session.userId } } },
        ],
      }
    : {
        creadorId: session.userId,
        estado: { in: ["ABIERTA", "EN_CURSO"] },
      };

  const conversaciones = await prisma.chatConversacion.findMany({
    where,
    include: {
      creador: { select: { nombre: true } },
      agente: { select: { nombre: true } },
      mensajes: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          contenido: true,
          createdAt: true,
          autorId: true,
          autor: { select: { nombre: true, esMesa: true } },
        },
      },
    },
  });

  let recordatorios = 0;
  let pendientes = 0;

  for (const conversacion of conversaciones) {
    if (!isUnreadForUser(conversacion, session.userId, esMesa, esAdminOMod)) continue;
    pendientes += 1;

    const recent = await prisma.notificacion.findFirst({
      where: {
        userId: session.userId,
        tipo: "CHAT_RECORDATORIO",
        entidad: "CHAT",
        entidadId: conversacion.id,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (recent) continue;

    const last = conversacion.mensajes[0];
    const remitente = last.autor?.esMesa ? "Mesa de Ayuda" : (conversacion.creador?.nombre || last.autor?.nombre || "Técnico");

    await enviarPushYBandeja(session.userId, {
      tipo: "CHAT_RECORDATORIO",
      titulo: "Chat pendiente sin leer",
      mensaje: `${remitente}: ${(last.contenido || "Mensaje pendiente").slice(0, 90)}`,
      enlace: "/dashboard/chat",
      entidad: "CHAT",
      entidadId: conversacion.id,
      tag: `chat-reminder-${conversacion.id}`,
    });
    recordatorios += 1;
  }

  return NextResponse.json({ recordatorios, pendientes });
}