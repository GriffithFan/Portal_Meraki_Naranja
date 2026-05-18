import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sanitizeSearch } from "@/lib/sanitize";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = sanitizeSearch(searchParams.get("q"), 80);
  const estado = sanitizeSearch(searchParams.get("estado"), 20);

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { esMesa: true, rol: true },
  });

  const esSoporte = user?.esMesa === true || user?.rol === "ADMIN" || user?.rol === "MODERADOR";
  const estadoFiltro = ["ABIERTA", "EN_CURSO", "CERRADA"].includes(estado) ? estado : null;

  const mensajes = await prisma.chatMensaje.findMany({
    where: {
      OR: [
        { contenido: { contains: q, mode: "insensitive" } },
        { archivoNombre: { contains: q, mode: "insensitive" } },
      ],
      conversacion: {
        ...(esSoporte ? {} : { creadorId: session.userId }),
        ...(estadoFiltro ? { estado: estadoFiltro } : {}),
      },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      contenido: true,
      archivoNombre: true,
      archivoTipo: true,
      createdAt: true,
      autorId: true,
      autor: { select: { id: true, nombre: true, esMesa: true } },
      conversacion: {
        select: {
          id: true,
          estado: true,
          creadorId: true,
          agenteId: true,
          updatedAt: true,
          cerradoAt: true,
          creador: { select: { id: true, nombre: true } },
          agente: { select: { id: true, nombre: true } },
          _count: { select: { mensajes: true } },
          mensajes: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { contenido: true, createdAt: true, autorId: true, autor: { select: { esMesa: true, nombre: true } } },
          },
        },
      },
    },
  });

  const results = mensajes.map((mensaje) => {
    const autorEsMesa = mensaje.autor.esMesa || mensaje.autorId !== session.userId;
    const autor = !esSoporte && autorEsMesa
      ? { id: mensaje.autorId === session.userId ? session.userId : "mesa", nombre: mensaje.autorId === session.userId ? session.nombre : "Mesa de Ayuda", esMesa: mensaje.autor.esMesa }
      : mensaje.autor;

    const conversacion = !esSoporte
      ? {
          ...mensaje.conversacion,
          agente: mensaje.conversacion.agente ? { id: "mesa", nombre: "Mesa de Ayuda" } : null,
        }
      : mensaje.conversacion;

    return {
      id: mensaje.id,
      contenido: mensaje.contenido,
      archivoNombre: mensaje.archivoNombre,
      archivoTipo: mensaje.archivoTipo,
      createdAt: mensaje.createdAt,
      autor,
      conversacion,
    };
  });

  return NextResponse.json({ results });
}