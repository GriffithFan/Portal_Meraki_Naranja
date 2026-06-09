import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * POST /api/anuncios/marcar-leidos
 * Marca como leídos (para el usuario actual) todos los anuncios activos y no
 * expirados. Se llama al abrir el tablero: detiene las re-notificaciones push
 * de esos anuncios para este usuario.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const ahora = new Date();
  const activos = await prisma.anuncio.findMany({
    where: {
      activo: true,
      OR: [{ fechaExpiracion: null }, { fechaExpiracion: { gt: ahora } }],
    },
    select: { id: true },
  });

  if (activos.length === 0) return NextResponse.json({ marcados: 0 });

  const res = await prisma.anuncioLectura.createMany({
    data: activos.map((a) => ({ anuncioId: a.id, userId: session.userId })),
    skipDuplicates: true,
  });

  return NextResponse.json({ marcados: res.count });
}
