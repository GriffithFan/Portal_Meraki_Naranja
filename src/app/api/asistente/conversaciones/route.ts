import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Lista las conversaciones del asistente del usuario (solo ADMIN, en pruebas). */
export async function GET() {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  const conversaciones = await prisma.asistenteConversacion.findMany({
    where: { userId: session.userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      titulo: true,
      updatedAt: true,
      _count: { select: { mensajes: true } },
    },
    take: 100,
  });
  return NextResponse.json(conversaciones);
}
