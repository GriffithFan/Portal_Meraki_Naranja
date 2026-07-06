import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { buildAnuncioVisibleWhere } from "@/lib/anuncios";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";

/**
 * GET /api/anuncios/novedades
 * Novedades NO bloqueantes para el usuario actual (los bloqueantes van por
 * /pendientes):
 *  - `noLeidos`: cantidad de anuncios visibles que aún no leyó → badge del sidebar.
 *  - `avisos`: los de prioridad ALTA/URGENTE sin leer → toast no invasivo en la topbar.
 * El set de "leídos" se alinea con /marcar-leidos (que se llama al abrir el tablero),
 * por eso el badge se limpia cuando el usuario entra a Anuncios.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const ahora = new Date();
  const gestor = isModOrAdmin(session.rol);
  const baseWhere: any = gestor
    ? { activo: true, requiereAceptacion: false, OR: [{ fechaExpiracion: null }, { fechaExpiracion: { gt: ahora } }] }
    : { ...buildAnuncioVisibleWhere(session.rol, session.userId, ahora), requiereAceptacion: false };

  const where: any = {
    ...baseWhere,
    autorId: { not: session.userId },            // no avisarle al propio autor
    lecturas: { none: { userId: session.userId } }, // aún no leído/aceptado
  };

  const [noLeidos, avisos] = await Promise.all([
    prisma.anuncio.count({ where }),
    prisma.anuncio.findMany({
      where: { ...where, prioridad: { in: ["ALTA", "URGENTE"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true, titulo: true, contenido: true, prioridad: true, categoria: true,
        createdAt: true, autor: { select: { nombre: true } },
      },
    }),
  ]);

  return NextResponse.json({ noLeidos, avisos }, { headers: { "Cache-Control": "no-store" } });
}
