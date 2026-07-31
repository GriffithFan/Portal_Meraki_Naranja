import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
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
  const data: any = {};
  if (typeof body?.pregunta === "string") data.pregunta = body.pregunta.trim().slice(0, 2000);
  if (typeof body?.respuesta === "string") data.respuesta = body.respuesta.trim().slice(0, 6000);
  if (typeof body?.categoria === "string") data.categoria = (body.categoria.trim() || "General").slice(0, 60);
  if (typeof body?.palabrasClave === "string") data.palabrasClave = body.palabrasClave.slice(0, 300) || null;
  if (typeof body?.activo === "boolean") data.activo = body.activo;

  try {
    const s = await prisma.situacion.update({ where: { id: params.id }, data });
    return NextResponse.json(s);
  } catch {
    return NextResponse.json({ error: "No se encontró la situación" }, { status: 404 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  try {
    await prisma.situacion.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se encontró la situación" }, { status: 404 });
  }
}
