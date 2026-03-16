import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { stockUpdateSchema, parseBody, isErrorResponse } from "@/lib/validation";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const equipo = await prisma.equipo.findUnique({
    where: { id },
    include: {
      predio: { select: { id: true, nombre: true } },
      comentarios: {
        include: { usuario: { select: { nombre: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!equipo) {
    return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
  }

  return NextResponse.json(equipo);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const data = await parseBody(request, stockUpdateSchema);
    if (isErrorResponse(data)) return data;

    const { nombre, descripcion, numeroSerie, modelo, marca, cantidad, estado, categoria, ubicacion, predioId, notas } = data;

    const existing = await prisma.equipo.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
    }

    const equipo = await prisma.equipo.update({
      where: { id },
      data: {
        ...(nombre !== undefined && { nombre }),
        ...(descripcion !== undefined && { descripcion }),
        ...(numeroSerie !== undefined && { numeroSerie: numeroSerie || null }),
        ...(modelo !== undefined && { modelo }),
        ...(marca !== undefined && { marca }),
        ...(cantidad !== undefined && { cantidad: parseInt(String(cantidad)) }),
        ...(estado !== undefined && { estado }),
        ...(categoria !== undefined && { categoria }),
        ...(ubicacion !== undefined && { ubicacion }),
        ...(predioId !== undefined && { predioId: predioId || null }),
        ...(notas !== undefined && { notas }),
      },
    });

    const desc =
      estado && estado !== existing.estado
        ? `Equipo "${equipo.nombre}" cambió estado: ${existing.estado} → ${estado}`
        : `Equipo "${equipo.nombre}" actualizado`;

    await prisma.actividad.create({
      data: {
        accion: estado && estado !== existing.estado ? "CAMBIO_ESTADO" : "ACTUALIZAR",
        descripcion: desc,
        entidad: "EQUIPO",
        entidadId: equipo.id,
        userId: session.userId,
      },
    });

    return NextResponse.json(equipo);
  } catch (error) {
    console.error("Error actualizando equipo:", error);
    return NextResponse.json({ error: "Error al actualizar equipo" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const equipo = await prisma.equipo.findUnique({ where: { id } });
    if (!equipo) {
      return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
    }

    await prisma.equipo.delete({ where: { id } });

    await prisma.actividad.create({
      data: {
        accion: "ELIMINAR",
        descripcion: `Equipo "${equipo.nombre}" eliminado del stock`,
        entidad: "EQUIPO",
        entidadId: id,
        userId: session.userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error eliminando equipo:", error);
    return NextResponse.json({ error: "Error al eliminar equipo" }, { status: 500 });
  }
}
