import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Situaciones curadas del asistente (solo ADMIN, en pruebas). */
export async function GET() {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  const situaciones = await prisma.situacion.findMany({
    orderBy: [{ activo: "desc" }, { categoria: "asc" }, { updatedAt: "desc" }],
    include: { creador: { select: { nombre: true } } },
  });
  return NextResponse.json(situaciones);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const pregunta = String(body?.pregunta || "").trim();
  const respuesta = String(body?.respuesta || "").trim();
  if (!pregunta || !respuesta) {
    return NextResponse.json({ error: "Pregunta y respuesta son requeridas" }, { status: 400 });
  }
  const s = await prisma.situacion.create({
    data: {
      pregunta: pregunta.slice(0, 2000),
      respuesta: respuesta.slice(0, 6000),
      categoria: (String(body?.categoria || "General").trim() || "General").slice(0, 60),
      palabrasClave: body?.palabrasClave ? String(body.palabrasClave).slice(0, 300) : null,
      activo: body?.activo !== false,
      origenChatId: body?.origenChatId ? String(body.origenChatId) : null,
      creadoPorId: session.userId,
    },
  });
  return NextResponse.json(s, { status: 201 });
}
