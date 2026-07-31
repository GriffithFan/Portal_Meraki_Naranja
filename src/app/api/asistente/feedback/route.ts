import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Registra el voto 👍/👎 de una respuesta del asistente (solo ADMIN, en pruebas). */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  let body: { id?: string; voto?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const id = String(body?.id || "");
  const voto = body?.voto === 1 ? 1 : body?.voto === -1 ? -1 : 0;
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  try {
    await prisma.asistenteFeedback.update({ where: { id }, data: { voto } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se pudo registrar el voto" }, { status: 404 });
  }
}
