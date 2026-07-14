import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { anuncioAudienceWhere } from "@/lib/anuncios";

export const dynamic = "force-dynamic";

/**
 * GET /api/anuncios/pendientes
 * Anuncios bloqueantes ("Muy alta") que el usuario actual debe aceptar:
 * activos, ya publicados, no expirados, dirigidos a él y aún sin aceptar.
 * El front muestra un popup persistente hasta que acepte.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const ahora = new Date();
  const anuncios = await prisma.anuncio.findMany({
    where: {
      activo: true,
      requiereAceptacion: true,
      autorId: { not: session.userId }, // el autor no se bloquea con su propio anuncio
      AND: [
        { OR: [{ fechaPublicacion: null }, { fechaPublicacion: { lte: ahora } }] },
        // NOTA: a propósito NO se filtra por fechaExpiracion. Un anuncio bloqueante
        // debe seguir apareciendo hasta que CADA destinatario lo acepte, aunque haya
        // expirado (la expiración solo corta el push/visibilidad en el tablero). Para
        // dejar de bloquear, el autor lo desactiva (activo=false) o lo elimina.
        anuncioAudienceWhere(session.userId, session.rol),
        { lecturas: { none: { userId: session.userId } } }, // aún no aceptado
      ],
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      titulo: true,
      contenido: true,
      categoria: true,
      createdAt: true,
      autor: { select: { nombre: true } },
    },
  });

  return NextResponse.json(
    { anuncios },
    { headers: { "Cache-Control": "no-store" } }
  );
}
