import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// DELETE /api/estados/[id] — Soft-delete (desactivar)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const { id } = await params;

  const estado = await prisma.estadoConfig.findUnique({ where: { id } });
  if (!estado) {
    return NextResponse.json({ error: "Estado no encontrado" }, { status: 404 });
  }

  // Desasociar predios de este estado antes de eliminar
  await prisma.predio.updateMany({
    where: { estadoId: id },
    data: { estadoId: null },
  });

  await prisma.estadoConfig.update({
    where: { id },
    data: { activo: false },
  });

  return NextResponse.json({ ok: true });
}

// PATCH /api/estados/[id] — Editar nombre/color
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.nombre !== undefined) data.nombre = String(body.nombre).slice(0, 100);
  if (body.color !== undefined) data.color = String(body.color).slice(0, 20);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const updated = await prisma.estadoConfig.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}
