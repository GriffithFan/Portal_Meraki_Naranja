import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
  const include = {
    creador: { select: { id: true, nombre: true } },
    agente: { select: { id: true, nombre: true } },
  } as const;

  // Bandeja de Mesa (?bandeja=1): TODAS las conversaciones activas + las últimas cerradas.
  // Con el corte por "las 60 más recientes" una conversación activa podía quedar afuera si
  // se habían cerrado muchas hace poco. Las activas son pocas (una por consulta en curso).
  const esVistaGlobal = user?.esMesa === true || esAdminOMod;
  const bandeja = searchParams.get("bandeja") === "1" && esVistaGlobal && !estado && !search && !cursor;

  let conversaciones;
  let hayMas: boolean;
  if (bandeja) {
    const [activas, cerradas] = await Promise.all([
      prisma.chatConversacion.findMany({ where: { estado: { in: ["ABIERTA", "EN_CURSO"] } }, include, orderBy: { updatedAt: "desc" }, take: 500 }),
      prisma.chatConversacion.findMany({ where: { estado: "CERRADA" }, include, orderBy: { updatedAt: "desc" }, take: limit + 1 }),
    ]);
    hayMas = cerradas.length > limit;
    conversaciones = [...activas, ...cerradas.slice(0, limit)];
  } else {
    const encontradas = await prisma.chatConversacion.findMany({
      where,
      include,
      orderBy: { updatedAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    hayMas = encontradas.length > limit;
    conversaciones = hayMas ? encontradas.slice(0, limit) : encontradas;
  }
  const paginaSinMensaje = conversaciones;

  // Último mensaje de cada conversación, UNA fila por conversación. Antes iba como
  // `include: { mensajes: { take: 1 } }`, pero Prisma resuelve ese `take` en memoria: pedía
  // TODOS los mensajes de las 60 conversaciones y se quedaba con uno. El 15/09/2026 eran
  // 3.908 mensajes con su texto para mostrar 61, cada 5 segundos por pestaña abierta.
  const ultimos = paginaSinMensaje.length
    ? await prisma.$queryRaw<Array<{ conversacionId: string; contenido: string; createdAt: Date; autorId: string; eliminadoAt: Date | null; esMesa: boolean; nombre: string }>>(Prisma.sql`
        SELECT c.id AS "conversacionId", m.contenido, m."createdAt", m."autorId", m."eliminadoAt", u."esMesa", u.nombre
        FROM unnest(${paginaSinMensaje.map((c) => c.id)}::text[]) AS c(id)
        CROSS JOIN LATERAL (
          SELECT x.contenido, x."createdAt", x."autorId", x."eliminadoAt"
          FROM "ChatMensaje" x
          WHERE x."conversacionId" = c.id
          ORDER BY x."createdAt" DESC
          LIMIT 1
        ) m
        JOIN "User" u ON u.id = m."autorId"
      `)
    : [];
  const ultimoPorConv = new Map(ultimos.map((m) => [m.conversacionId, m]));
  const pagina = paginaSinMensaje.map((c) => {
    const u = ultimoPorConv.get(c.id);
    return {
      ...c,
      mensajes: u
        ? [{ contenido: u.contenido, createdAt: u.createdAt, autorId: u.autorId, eliminadoAt: u.eliminadoAt, autor: { esMesa: u.esMesa, nombre: u.nombre } }]
        : [],
    };
  });

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

  // Para Mesa: cuánto hace que espera cada conversación activa y cuántos mensajes del
  // técnico quedaron sin responder. "Respuesta" es cualquier mensaje que NO sea del creador
  // (el técnico); los borrados no cuentan para ninguno de los dos lados. Lo usa la bandeja
  // para ordenar por quién espera hace más (ver lib/chatBandeja.ts).
  const idsActivas = esVistaGlobal ? pagina.filter((c) => c.estado !== "CERRADA").map((c) => c.id) : [];
  const esperas = idsActivas.length
    ? await prisma.$queryRaw<Array<{ conversacionId: string; pendientes: number; esperandoDesde: Date | null }>>(Prisma.sql`
        SELECT c.id AS "conversacionId", COALESCE(p.n, 0)::int AS pendientes, p.desde AS "esperandoDesde"
        FROM "ChatConversacion" c
        LEFT JOIN LATERAL (
          SELECT max(m."createdAt") AS ultimo
          FROM "ChatMensaje" m
          WHERE m."conversacionId" = c.id AND m."autorId" <> c."creadorId" AND m."eliminadoAt" IS NULL
        ) r ON true
        LEFT JOIN LATERAL (
          SELECT count(*) AS n, min(m."createdAt") AS desde
          FROM "ChatMensaje" m
          WHERE m."conversacionId" = c.id AND m."autorId" = c."creadorId" AND m."eliminadoAt" IS NULL
            AND (r.ultimo IS NULL OR m."createdAt" > r.ultimo)
        ) p ON true
        WHERE c.id = ANY(${idsActivas}::text[])
      `)
    : [];
  const esperaPorConv = new Map(esperas.map((e) => [e.conversacionId, e]));

  return NextResponse.json({
    conversaciones: pagina.map((c) => ({
      ...c,
      _count: { mensajes: conteoPorConv.get(c.id) ?? 0 },
      noLeida: isUnreadForUser(c, session.userId, user?.esMesa === true, esAdminOMod),
      ...(esVistaGlobal
        ? { pendientes: esperaPorConv.get(c.id)?.pendientes ?? 0, esperandoDesde: esperaPorConv.get(c.id)?.esperandoDesde ?? null }
        : {}),
    })),
    hayMas,
    proximoCursor: hayMas ? pagina[pagina.length - 1]?.id ?? null : null,
  });
}

/**
 * Mesa le escribe primero a un técnico. La conversación queda igual que una que abrió el
 * técnico y Mesa ya tomó: creador = el técnico (así la ve como suya y le llegan los avisos),
 * agente = quien escribe, EN_CURSO, y el primer mensaje es de Mesa.
 */
async function crearDesdeMesa(session: { userId: string; nombre: string }, tecnicoId: string, mensaje: string) {
  const mesa = await prisma.user.findUnique({ where: { id: session.userId }, select: { esMesa: true } });
  if (!mesa?.esMesa) {
    return NextResponse.json({ error: "Solo Mesa de Ayuda puede iniciar conversaciones con técnicos" }, { status: 403 });
  }
  const tecnico = await prisma.user.findUnique({ where: { id: tecnicoId }, select: { id: true, activo: true, esMesa: true } });
  if (!tecnico || !tecnico.activo || tecnico.esMesa || tecnico.id === session.userId) {
    return NextResponse.json({ error: "Técnico no válido" }, { status: 400 });
  }

  const ahora = new Date();
  const conversacion = await prisma.chatConversacion.create({
    data: {
      creadorId: tecnico.id,
      agenteId: session.userId,
      estado: "EN_CURSO",
      leidoPorMesaAt: ahora,
      mensajes: { create: { contenido: mensaje.slice(0, 2000), autorId: session.userId } },
    },
    include: {
      creador: { select: { id: true, nombre: true } },
      agente: { select: { id: true, nombre: true } },
      mensajes: true,
    },
  });

  publicarCambioChat(conversacion.id, { tipo: "conversacion-nueva" });

  // Aviso al técnico (fire-and-forget): el enlace abre esa conversación directamente.
  import("@/lib/pushNotifications").then(({ enviarPushYBandeja }) =>
    enviarPushYBandeja(tecnico.id, {
      tipo: "CHAT",
      titulo: "Mesa de Ayuda te escribió",
      mensaje: mensaje.slice(0, 80),
      enlace: `/dashboard/chat?id=${conversacion.id}`,
      entidad: "CHAT",
      entidadId: conversacion.id,
      tag: `chat-mesa-${conversacion.id}`,
    }).catch((e) => console.error("[Chat] Error avisando al técnico:", e))
  );

  return NextResponse.json(conversacion, { status: 201 });
}

/**
 * POST /api/chat — Crea una conversación nueva.
 * - Técnico: `{ mensaje }` abre una consulta a Mesa.
 * - Mesa: `{ mensaje, tecnicoId }` le escribe primero a un técnico.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const body = await request.json();
    const { mensaje, tecnicoId } = body;

    if (!mensaje?.trim()) {
      return NextResponse.json(
        { error: "Mensaje requerido" },
        { status: 400 }
      );
    }

    if (typeof tecnicoId === "string" && tecnicoId) {
      return await crearDesdeMesa(session, tecnicoId, mensaje.trim());
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
