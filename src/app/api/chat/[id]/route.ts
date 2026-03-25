import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/chat/[id] — Obtener conversación con todos sus mensajes
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { esMesa: true },
  });

  const conversacion = await prisma.chatConversacion.findUnique({
    where: { id },
    include: {
      creador: { select: { id: true, nombre: true } },
      agente: { select: { id: true, nombre: true } },
      mensajes: {
        orderBy: { createdAt: "asc" },
        include: {
          autor: { select: { id: true, nombre: true, esMesa: true } },
        },
      },
    },
  });

  if (!conversacion) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  // Verificar acceso: creador, agente, o cualquier usuario Mesa
  const esCreador = conversacion.creadorId === session.userId;
  const esAgente = conversacion.agenteId === session.userId;
  const esMesa = user?.esMesa === true;
  const puedeVer = esCreador || esAgente || esMesa;

  if (!puedeVer) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  // Para técnicos: anonimizar los nombres de Mesa
  if (!esMesa) {
    const anonimizado = {
      ...conversacion,
      agente: conversacion.agente ? { id: "mesa", nombre: "Mesa de Ayuda" } : null,
      mensajes: conversacion.mensajes.map((m: any) => ({
        ...m,
        autor: m.autor.esMesa || m.autorId !== session.userId
          ? { id: m.autorId === session.userId ? session.userId : "mesa", nombre: m.autorId === session.userId ? session.nombre : "Mesa de Ayuda", esMesa: m.autor.esMesa }
          : m.autor,
      })),
    };
    return NextResponse.json(anonimizado);
  }

  return NextResponse.json(conversacion);
}

/**
 * POST /api/chat/[id] — Enviar mensaje en conversación
 * Body: { mensaje: string }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const { mensaje } = body;

    if (!mensaje?.trim()) {
      return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
    }

    const conversacion = await prisma.chatConversacion.findUnique({
      where: { id },
      select: { id: true, estado: true, creadorId: true, agenteId: true },
    });

    if (!conversacion) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }

    if (conversacion.estado === "CERRADA") {
      return NextResponse.json({ error: "Esta conversación ya está cerrada" }, { status: 400 });
    }

    // Verificar acceso
    const esCreador = conversacion.creadorId === session.userId;
    const esAgente = conversacion.agenteId === session.userId;

    if (!esCreador && !esAgente) {
      return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    }

    const nuevoMensaje = await prisma.chatMensaje.create({
      data: {
        contenido: mensaje.trim().slice(0, 2000),
        conversacionId: id,
        autorId: session.userId,
      },
      include: {
        autor: { select: { id: true, nombre: true, esMesa: true } },
      },
    });

    // Actualizar timestamp de conversación
    await prisma.chatConversacion.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    // Notificar a la otra parte
    const destinatarioId = esCreador ? conversacion.agenteId : conversacion.creadorId;
    if (destinatarioId) {
      const { enviarPushYBandeja } = await import("@/lib/pushNotifications");
      const remitente = esCreador ? session.nombre : "Mesa de Ayuda";
      await enviarPushYBandeja(destinatarioId, {
        tipo: "CHAT",
        titulo: "Nuevo mensaje en chat",
        mensaje: `${remitente}: ${mensaje.trim().slice(0, 80)}`,
        enlace: "/dashboard/chat",
        entidad: "CHAT",
        entidadId: id,
      });
    }

    return NextResponse.json(nuevoMensaje, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * PATCH /api/chat/[id] — Acciones sobre conversación:
 *  - { accion: "tomar" } — Mesa toma una conversación ABIERTA
 *  - { accion: "cerrar" } — Mesa cierra la conversación
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const { accion } = body;

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { esMesa: true },
    });

    if (!user?.esMesa) {
      return NextResponse.json({ error: "Solo usuarios Mesa" }, { status: 403 });
    }

    const conversacion = await prisma.chatConversacion.findUnique({
      where: { id },
    });

    if (!conversacion) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }

    if (accion === "tomar") {
      if (conversacion.estado !== "ABIERTA") {
        return NextResponse.json({ error: "Solo se pueden tomar conversaciones abiertas" }, { status: 400 });
      }

      const updated = await prisma.chatConversacion.update({
        where: { id },
        data: { agenteId: session.userId, estado: "EN_CURSO" },
      });

      // Notificar al técnico
      const { enviarPushYBandeja } = await import("@/lib/pushNotifications");
      await enviarPushYBandeja(conversacion.creadorId, {
        tipo: "CHAT",
        titulo: "Tu consulta fue tomada",
        mensaje: "Mesa de Ayuda está atendiendo tu consulta.",
        enlace: "/dashboard/chat",
        entidad: "CHAT",
        entidadId: id,
      });

      return NextResponse.json(updated);
    }

    if (accion === "cerrar") {
      if (conversacion.agenteId !== session.userId) {
        return NextResponse.json({ error: "Solo el agente asignado puede cerrar" }, { status: 403 });
      }

      const updated = await prisma.chatConversacion.update({
        where: { id },
        data: { estado: "CERRADA", cerradoAt: new Date() },
      });

      // Notificar al técnico
      const { enviarPushYBandeja } = await import("@/lib/pushNotifications");
      await enviarPushYBandeja(conversacion.creadorId, {
        tipo: "CHAT",
        titulo: "Consulta cerrada",
        mensaje: "Mesa de Ayuda cerró tu consulta. Podés crear una nueva si lo necesitás.",
        enlace: "/dashboard/chat",
        entidad: "CHAT",
        entidadId: id,
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
