import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();

  const allowed = ["ubicacion", "nombre", "tipo", "garage", "telefono", "provincia", "notas"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  for (const key of allowed) {
    if (body[key] !== undefined) {
      data[key] = typeof body[key] === "string" ? body[key].trim() || null : body[key];
    }
  }

  const updated = await prisma.hospedaje.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { id } = await params;

  const hospedaje = await prisma.hospedaje.findUnique({ where: { id } });
  if (hospedaje) {
    const { registrarEnPapelera } = await import("@/lib/papelera");
    await registrarEnPapelera("HOSPEDAJE", hospedaje.nombre, hospedaje as unknown as Record<string, unknown>, session.userId);
  }

  await prisma.hospedaje.update({ where: { id }, data: { activo: false } });
  return NextResponse.json({ ok: true });
}
