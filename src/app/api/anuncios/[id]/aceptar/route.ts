import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * POST /api/anuncios/[id]/aceptar
 * Registra la aceptación del anuncio bloqueante por el usuario actual
 * (crea su AnuncioLectura). Idempotente.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const anuncio = await prisma.anuncio.findUnique({ where: { id }, select: { id: true } });
  if (!anuncio) return NextResponse.json({ error: "Anuncio no encontrado" }, { status: 404 });

  await prisma.anuncioLectura.createMany({
    data: [{ anuncioId: id, userId: session.userId }],
    skipDuplicates: true,
  });

  return NextResponse.json({ ok: true });
}
