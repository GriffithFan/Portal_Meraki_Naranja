import { NextRequest, NextResponse } from "next/server";
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
 * GET /api/chat — Lista conversaciones según rol:
 *  - Técnico: solo sus propias conversaciones
 *  - Mesa: conversaciones ABIERTA (sin asignar) + las asignadas a sí mismo
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const estado = searchParams.get("estado"); // ABIERTA, EN_CURSO, CERRADA

  // Verificar si el usuario es Mesa o Admin/Mod
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { esMesa: true, rol: true },
  });

  const esAdminOMod = user?.rol === "ADMIN" || user?.rol === "MODERADOR";

  /* eslint-disable @typescript-eslint/no-explicit-any */
  let where: any;

  if (user?.esMesa || esAdminOMod) {
    // Mesa y Admin/Mod ven TODAS las conversaciones (Admin/Mod en solo lectura)
    where = {};
    if (estado) {
      where.estado = estado;
    }
  } else {
    // Técnico solo ve sus propias conversaciones
    where = { creadorId: session.userId };
    if (estado) where.estado = estado;
  }

  const conversaciones = await prisma.chatConversacion.findMany({
    where,
    include: {
      creador: { select: { id: true, nombre: true } },
      agente: { select: { id: true, nombre: true } },
      mensajes: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { contenido: true, createdAt: true, autorId: true, autor: { select: { esMesa: true, nombre: true } } },
      },
      _count: { select: { mensajes: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(conversaciones.map((c) => ({
    ...c,
    noLeida: isUnreadForUser(c, session.userId, user?.esMesa === true, esAdminOMod),
  })));
}

/**
 * POST /api/chat — Técnico crea nueva conversación (chat en vivo)
 * Body: { mensaje: string }
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const body = await request.json();
    const { mensaje } = body;

    if (!mensaje?.trim()) {
      return NextResponse.json(
        { error: "Mensaje requerido" },
        { status: 400 }
      );
    }

    // Verificar que no tenga una conversación abierta/en_curso
    const activa = await prisma.chatConversacion.findFirst({
      where: {
        creadorId: session.userId,
        estado: { in: ["ABIERTA", "EN_CURSO"] },
      },
    });

    if (activa) {
      return NextResponse.json(
        { error: "Ya tenés una consulta activa. Esperá a que se cierre para crear otra." },
        { status: 409 }
      );
    }

    const conversacion = await prisma.chatConversacion.create({
      data: {
        creadorId: session.userId,
        mensajes: {
          create: {
            contenido: mensaje.trim().slice(0, 2000),
            autorId: session.userId,
          },
        },
      },
      include: {
        creador: { select: { id: true, nombre: true } },
        mensajes: true,
      },
    });

    // Notificar a usuarios Mesa que hay nueva consulta
    const usuariosMesa = await prisma.user.findMany({
      where: { esMesa: true, activo: true, id: { not: session.userId } },
      select: { id: true },
    });

    if (usuariosMesa.length > 0) {
      // Fire-and-forget: no bloquear respuesta
      import("@/lib/pushNotifications").then(async ({ enviarPushYBandeja }) => {
        try {
          await Promise.allSettled(
            usuariosMesa.map((u) =>
              enviarPushYBandeja(u.id, {
                tipo: "CHAT",
                titulo: "Nueva consulta en Mesa de Ayuda",
                mensaje: `${session.nombre}: ${mensaje.trim().slice(0, 80)}`,
                enlace: "/dashboard/chat",
                entidad: "CHAT",
                entidadId: conversacion.id,
                tag: `chat-new-${conversacion.id}`,
              })
            )
          );
        } catch (e) {
          console.error("[Chat] Error enviando notificaci\u00f3n nueva consulta:", e);
        }
      });
    }

    return NextResponse.json(conversacion, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
