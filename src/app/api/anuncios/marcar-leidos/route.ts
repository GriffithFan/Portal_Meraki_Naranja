import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { buildAnuncioVisibleWhere } from "@/lib/anuncios";

/**
 * POST /api/anuncios/marcar-leidos
 * Marca como leídos (para el usuario actual) todos los anuncios que ese
 * usuario puede ver (activos, no expirados, dirigidos a su rol o a todos).
 * Se llama al abrir el tablero: detiene las re-notificaciones push.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const ahora = new Date();
  const gestor = isModOrAdmin(session.rol);
  // Los anuncios bloqueantes (requiereAceptacion) NO se marcan al abrir el tablero:
  // su lectura solo se crea cuando el destinatario acepta el popup.
  const where = gestor
    ? { activo: true, requiereAceptacion: false, OR: [{ fechaExpiracion: null }, { fechaExpiracion: { gt: ahora } }] }
    : { ...buildAnuncioVisibleWhere(session.rol, session.userId, ahora), requiereAceptacion: false };

  const activos = await prisma.anuncio.findMany({ where, select: { id: true } });

  if (activos.length === 0) return NextResponse.json({ marcados: 0 });

  const res = await prisma.anuncioLectura.createMany({
    data: activos.map((a) => ({ anuncioId: a.id, userId: session.userId })),
    skipDuplicates: true,
  });

  return NextResponse.json({ marcados: res.count });
}
