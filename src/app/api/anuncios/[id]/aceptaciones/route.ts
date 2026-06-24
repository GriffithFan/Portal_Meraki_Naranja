import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { getDestinatariosAnuncio } from "@/lib/anuncios";

export const dynamic = "force-dynamic";

/**
 * GET /api/anuncios/[id]/aceptaciones — (Admin/Mod)
 * Quiénes ya aceptaron el anuncio y quiénes faltan, dentro de la audiencia.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { id } = await params;
  const anuncio = await prisma.anuncio.findUnique({
    where: { id },
    select: { id: true, rolesDestino: true, usuariosDestino: true, autorId: true },
  });
  if (!anuncio) return NextResponse.json({ error: "Anuncio no encontrado" }, { status: 404 });

  // Audiencia (excluye al autor) + lecturas (= aceptaciones)
  const [audienciaIds, lecturas] = await Promise.all([
    getDestinatariosAnuncio(anuncio.rolesDestino, anuncio.usuariosDestino, anuncio.autorId),
    prisma.anuncioLectura.findMany({
      where: { anuncioId: id },
      select: { userId: true, createdAt: true, user: { select: { id: true, nombre: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const aceptadoPor = new Map(lecturas.map((l) => [l.userId, l]));
  const aceptaron = lecturas
    .filter((l) => audienciaIds.includes(l.userId))
    .map((l) => ({ id: l.user.id, nombre: l.user.nombre, aceptadoAt: l.createdAt }));

  const pendientesIds = audienciaIds.filter((uid) => !aceptadoPor.has(uid));
  const pendientesUsers = pendientesIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: pendientesIds } }, select: { id: true, nombre: true } })
    : [];

  return NextResponse.json({
    total: audienciaIds.length,
    aceptaron,
    pendientes: pendientesUsers.map((u) => ({ id: u.id, nombre: u.nombre })),
  }, { headers: { "Cache-Control": "no-store" } });
}
