import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/tecnicos — A quién le puede escribir Mesa.
 *
 * Usuarios activos que no son Mesa, con sus conversaciones abiertas: así, antes de abrir
 * una nueva, Mesa ve si ya hay una en curso con esa persona y puede seguir ahí.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!session.esMesa) return NextResponse.json({ error: "Solo Mesa de Ayuda" }, { status: 403 });

  const usuarios = await prisma.user.findMany({
    where: { activo: true, esMesa: false, rol: { in: ["TECNICO", "MODERADOR"] } },
    select: {
      id: true,
      nombre: true,
      rol: true,
      chatsCreados: {
        where: { estado: { in: ["ABIERTA", "EN_CURSO"] } },
        select: { id: true, estado: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      },
    },
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json({
    tecnicos: usuarios.map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol, activas: u.chatsCreados })),
  });
}
