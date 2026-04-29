import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { sanitizeSearch } from "@/lib/sanitize";
import { getAllEquipoVariants } from "@/utils/equipoUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function buildPredioVisibilityWhere(session: { rol: string; userId: string; nombre: string }) {
  if (isModOrAdmin(session.rol)) return {};

  const delegaciones = await prisma.delegacion.findMany({
    where: { delegadoId: session.userId, activo: true },
    select: { delegadorId: true },
  });
  const idsVisibles = [session.userId, ...delegaciones.map((delegacion) => delegacion.delegadorId)];
  const equipoMatch = getAllEquipoVariants(session.nombre);
  return {
    OR: [
      { asignaciones: { some: { userId: { in: idsVisibles } } } },
      { creadorId: { in: idsVisibles } },
      { equipoAsignado: equipoMatch.length > 0
        ? { in: equipoMatch, mode: "insensitive" as const }
        : { equals: session.nombre, mode: "insensitive" as const } },
    ],
  };
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const query = sanitizeSearch(new URL(request.url).searchParams.get("q"), 80);
  if (query.length < 2) {
    return NextResponse.json({ query, results: [], resumen: { predios: 0, stock: 0, chats: 0, actas: 0, instructivos: 0, total: 0 } });
  }

  const predioSearchWhere = {
    OR: [
      { nombre: { contains: query, mode: "insensitive" as const } },
      { codigo: { contains: query, mode: "insensitive" as const } },
      { incidencias: { contains: query, mode: "insensitive" as const } },
      { cue: { contains: query, mode: "insensitive" as const } },
      { provincia: { contains: query, mode: "insensitive" as const } },
      { equipoAsignado: { contains: query, mode: "insensitive" as const } },
      { nombreInstitucion: { contains: query, mode: "insensitive" as const } },
    ],
  };
  const predioWhere: any = await buildPredioVisibilityWhere(session);
  predioWhere.AND = predioWhere.AND ? [...predioWhere.AND, predioSearchWhere] : [predioSearchWhere];

  const stockWhere = {
    OR: [
      { nombre: { contains: query, mode: "insensitive" as const } },
      { modelo: { contains: query, mode: "insensitive" as const } },
      { marca: { contains: query, mode: "insensitive" as const } },
      { numeroSerie: { contains: query, mode: "insensitive" as const } },
      { etiqueta: { contains: query, mode: "insensitive" as const } },
      { proveedor: { contains: query, mode: "insensitive" as const } },
    ],
  };

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { esMesa: true, rol: true },
  });
  const chatVisibilityWhere = user?.esMesa || isModOrAdmin(user?.rol || session.rol) ? {} : { creadorId: session.userId };
  const chatSearchWhere = {
    OR: [
      { asunto: { contains: query, mode: "insensitive" as const } },
      { creador: { nombre: { contains: query, mode: "insensitive" as const } } },
      { agente: { nombre: { contains: query, mode: "insensitive" as const } } },
      { mensajes: { some: { contenido: { contains: query, mode: "insensitive" as const } } } },
    ],
  };
  const chatWhere: any = chatVisibilityWhere;
  chatWhere.AND = chatWhere.AND ? [...chatWhere.AND, chatSearchWhere] : [chatSearchWhere];

  const actaWhere = {
    OR: [
      { nombre: { contains: query, mode: "insensitive" as const } },
      { descripcion: { contains: query, mode: "insensitive" as const } },
      { archivoNombre: { contains: query, mode: "insensitive" as const } },
      { predio: { nombre: { contains: query, mode: "insensitive" as const } } },
    ],
  };

  const instructivoWhere = {
    activo: true,
    OR: [
      { titulo: { contains: query, mode: "insensitive" as const } },
      { contenido: { contains: query, mode: "insensitive" as const } },
      { categoria: { contains: query, mode: "insensitive" as const } },
      { videoNombre: { contains: query, mode: "insensitive" as const } },
      { pdfNombre: { contains: query, mode: "insensitive" as const } },
    ],
  };

  const [predios, prediosTotal, equipos, stockTotal, chats, chatsTotal, actas, actasTotal, instructivos, instructivosTotal] = await Promise.all([
    prisma.predio.findMany({
      where: predioWhere,
      select: {
        id: true,
        nombre: true,
        codigo: true,
        incidencias: true,
        provincia: true,
        equipoAsignado: true,
        prioridad: true,
        estado: { select: { nombre: true, color: true } },
        espacio: { select: { nombre: true } },
      },
      orderBy: [{ prioridad: "desc" }, { updatedAt: "desc" }],
      take: 4,
    }),
    prisma.predio.count({ where: predioWhere }),
    prisma.equipo.findMany({
      where: stockWhere,
      select: {
        id: true,
        nombre: true,
        modelo: true,
        numeroSerie: true,
        estado: true,
        ubicacion: true,
        etiqueta: true,
        asignado: { select: { nombre: true } },
        predio: { select: { nombre: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 4,
    }),
    prisma.equipo.count({ where: stockWhere }),
    prisma.chatConversacion.findMany({
      where: chatWhere,
      select: {
        id: true,
        asunto: true,
        estado: true,
        updatedAt: true,
        creador: { select: { nombre: true } },
        agente: { select: { nombre: true } },
        mensajes: { orderBy: { createdAt: "desc" }, take: 1, select: { contenido: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 3,
    }),
    prisma.chatConversacion.count({ where: chatWhere }),
    prisma.acta.findMany({
      where: actaWhere,
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        archivoNombre: true,
        archivoTipo: true,
        predio: { select: { nombre: true } },
        subidoPor: { select: { nombre: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    prisma.acta.count({ where: actaWhere }),
    prisma.instructivo.findMany({
      where: instructivoWhere,
      select: {
        id: true,
        titulo: true,
        contenido: true,
        categoria: true,
        videoNombre: true,
        pdfNombre: true,
        creador: { select: { nombre: true } },
      },
      orderBy: [{ categoria: "asc" }, { orden: "asc" }, { createdAt: "desc" }],
      take: 3,
    }),
    prisma.instructivo.count({ where: instructivoWhere }),
  ]);

  const results = [
    ...predios.map((predio) => {
      const searchValue = predio.codigo || predio.nombre;
      const params = new URLSearchParams({ search: searchValue });
      if (predio.codigo) params.set("open", predio.codigo);
      return {
        id: predio.id,
        type: "PREDIO",
        title: predio.codigo ? `${predio.codigo} · ${predio.nombre}` : predio.nombre,
        subtitle: [predio.incidencias, predio.provincia, predio.equipoAsignado, predio.espacio?.nombre].filter(Boolean).join(" · "),
        badge: predio.estado?.nombre || predio.prioridad,
        href: `/dashboard/tareas?${params.toString()}`,
      };
    }),
    ...equipos.map((equipo) => {
      const searchValue = equipo.numeroSerie || equipo.modelo || equipo.nombre;
      const params = new URLSearchParams({ search: searchValue });
      return {
        id: equipo.id,
        type: "STOCK",
        title: equipo.numeroSerie ? `${equipo.nombre} · ${equipo.numeroSerie}` : equipo.nombre,
        subtitle: [equipo.modelo, equipo.estado?.replace(/_/g, " "), equipo.asignado?.nombre || equipo.ubicacion || equipo.predio?.nombre, equipo.etiqueta].filter(Boolean).join(" · "),
        badge: equipo.estado?.replace(/_/g, " ") || "Stock",
        href: `/dashboard/stock?${params.toString()}`,
      };
    }),
    ...chats.map((chat) => ({
      id: chat.id,
      type: "CHAT",
      title: chat.asunto || `Consulta de ${chat.creador?.nombre || "usuario"}`,
      subtitle: [chat.mensajes?.[0]?.contenido, chat.agente?.nombre ? `Agente: ${chat.agente.nombre}` : null].filter(Boolean).join(" · "),
      badge: chat.estado?.replace(/_/g, " "),
      href: `/dashboard/chat?${new URLSearchParams({ search: query }).toString()}`,
    })),
    ...actas.map((acta) => ({
      id: acta.id,
      type: "ACTA",
      title: acta.nombre,
      subtitle: [acta.descripcion, acta.predio?.nombre, acta.archivoNombre].filter(Boolean).join(" · "),
      badge: acta.archivoTipo || "Acta",
      href: `/dashboard/actas?${new URLSearchParams({ search: query }).toString()}`,
    })),
    ...instructivos.map((instructivo) => ({
      id: instructivo.id,
      type: "INSTRUCTIVO",
      title: instructivo.titulo,
      subtitle: [instructivo.categoria, instructivo.videoNombre || instructivo.pdfNombre, instructivo.contenido?.slice(0, 90)].filter(Boolean).join(" · "),
      badge: instructivo.categoria,
      href: `/dashboard/instructivo?${new URLSearchParams({ search: query }).toString()}`,
    })),
  ].slice(0, 14);

  return NextResponse.json({
    query,
    results,
    resumen: {
      predios: prediosTotal,
      stock: stockTotal,
      chats: chatsTotal,
      actas: actasTotal,
      instructivos: instructivosTotal,
      total: prediosTotal + stockTotal + chatsTotal + actasTotal + instructivosTotal,
    },
  });
}
