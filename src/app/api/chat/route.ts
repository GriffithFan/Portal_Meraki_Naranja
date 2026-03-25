import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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

  // Verificar si el usuario es Mesa
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { esMesa: true },
  });

  /* eslint-disable @typescript-eslint/no-explicit-any */
  let where: any;

  if (user?.esMesa) {
    // Mesa ve: conversations sin asignar (ABIERTA) + las que tomó (EN_CURSO/CERRADA)
    where = {
      OR: [
        { estado: "ABIERTA", agenteId: null },
        { agenteId: session.userId },
      ],
    };
    if (estado) {
      if (estado === "ABIERTA") {
        where = { estado: "ABIERTA", agenteId: null };
      } else {
        where = { estado, agenteId: session.userId };
      }
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
        select: { contenido: true, createdAt: true, autorId: true },
      },
      _count: { select: { mensajes: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(conversaciones);
}

/**
 * POST /api/chat — Técnico crea nueva conversación
 * Body: { asunto: string, mensaje: string }
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const body = await request.json();
    const { asunto, mensaje } = body;

    if (!asunto?.trim() || !mensaje?.trim()) {
      return NextResponse.json(
        { error: "Asunto y mensaje son requeridos" },
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
        asunto: asunto.trim().slice(0, 200),
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
      const { enviarPushYBandeja } = await import("@/lib/pushNotifications");
      await Promise.allSettled(
        usuariosMesa.map((u) =>
          enviarPushYBandeja(u.id, {
            tipo: "CHAT",
            titulo: "Nueva consulta en Mesa de Ayuda",
            mensaje: `${session.nombre}: ${asunto.trim().slice(0, 80)}`,
            enlace: "/dashboard/chat",
            entidad: "CHAT",
            entidadId: conversacion.id,
          })
        )
      );
    }

    return NextResponse.json(conversacion, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
