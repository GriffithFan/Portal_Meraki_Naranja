import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sanitizeSearch } from "@/lib/sanitize";
import { publicarCambioChat } from "@/lib/chatBus";

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
  const search = sanitizeSearch(searchParams.get("search"), 140);

  // Verificar si el usuario es Mesa o Admin/Mod
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { esMesa: true, rol: true },
  });

  const esAdminOMod = user?.rol === "ADMIN" || user?.rol === "MODERADOR";

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const andClauses: any[] = [];

  if (!(user?.esMesa || esAdminOMod)) {
    // Técnico solo ve sus propias conversaciones
    andClauses.push({ creadorId: session.userId });
  }

  if (estado) {
    andClauses.push({ estado });
  }

  if (search) {
    andClauses.push({
      OR: [
        { creador: { nombre: { contains: search, mode: "insensitive" } } },
        { agente: { nombre: { contains: search, mode: "insensitive" } } },
        {
          mensajes: {
            some: {
              OR: [
                { contenido: { contains: search, mode: "insensitive" } },
                { archivoNombre: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        },
      ],
    });
  }

  const where = andClauses.length > 0 ? { AND: andClauses } : {};

  // Paginado. Antes esto traia TODAS las conversaciones sin limite; con 622 ya eran
  // 437 KB por llamada y crece para siempre. `limit` deja pedir mas desde el front.
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "60", 10) || 60, 1), 200);
  const cursor = searchParams.get("cursor");

  const conversaciones = await prisma.chatConversacion.findMany({
    where,
    include: {
      creador: { select: { id: true, nombre: true } },
      agente: { select: { id: true, nombre: true } },
      mensajes: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { contenido: true, createdAt: true, autorId: true, eliminadoAt: true, autor: { select: { esMesa: true, nombre: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hayMas = conversaciones.length > limit;
  const pagina = hayMas ? conversaciones.slice(0, limit) : conversaciones;

  // Cantidad de mensajes en UNA sola consulta agrupada, en vez de `_count` dentro del
  // include. Ese _count es una subconsulta por fila: con 622 conversaciones eran 622
  // conteos sobre ChatMensaje en cada llamada, y de ahi salian los miles de millones
  // de filas leidas que mostraba pg_stat_user_tables.
  const conteos = pagina.length
    ? await prisma.chatMensaje.groupBy({
        by: ["conversacionId"],
        where: { conversacionId: { in: pagina.map((c) => c.id) } },
        _count: { _all: true },
      })
    : [];
  const conteoPorConv = new Map(conteos.map((c) => [c.conversacionId, c._count._all]));

  return NextResponse.json({
    conversaciones: pagina.map((c) => ({
      ...c,
      _count: { mensajes: conteoPorConv.get(c.id) ?? 0 },
      noLeida: isUnreadForUser(c, session.userId, user?.esMesa === true, esAdminOMod),
    })),
    hayMas,
    proximoCursor: hayMas ? pagina[pagina.length - 1]?.id ?? null : null,
  });
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

    // El técnico puede abrir una consulta nueva cuando quiera (varios temas en
    // paralelo). Tope blando para evitar spam accidental: máx. de hilos abiertos.
    const abiertas = await prisma.chatConversacion.count({
      where: { creadorId: session.userId, estado: { in: ["ABIERTA", "EN_CURSO"] } },
    });
    if (abiertas >= 15) {
      return NextResponse.json(
        { error: "Tenés demasiadas consultas abiertas. Esperá a que Mesa cierre algunas." },
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
    // Avisar al bus: es lo que hace saltar el contador de no leidos de Mesa sin que
    // nadie tenga que preguntar. Faltaba justamente aca —una consulta NUEVA es el caso
    // que Mesa mas necesita ver— porque el bus solo se publicaba al escribir mensajes
    // en conversaciones que ya existian.
    publicarCambioChat(conversacion.id, { tipo: "conversacion-nueva" });

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
