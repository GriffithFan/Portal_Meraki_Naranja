import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { stockUpdateSchema, parseBody, isErrorResponse } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

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

    const { nombre, descripcion, numeroSerie, modelo, marca, cantidad, estado, categoria, ubicacion, predioId, notas, fecha, asignadoId, etiqueta, etiquetaColor, proveedor, camposExtra } = data;

    const existing = await prisma.equipo.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
    }

    const updateData: Prisma.EquipoUncheckedUpdateInput = {};
    if (nombre !== undefined) updateData.nombre = nombre;
    if (descripcion !== undefined) updateData.descripcion = descripcion;
    if (numeroSerie !== undefined) updateData.numeroSerie = numeroSerie || null;
    if (modelo !== undefined) updateData.modelo = modelo;
    if (marca !== undefined) updateData.marca = marca;
    if (cantidad !== undefined) updateData.cantidad = parseInt(String(cantidad));
    if (estado !== undefined) updateData.estado = estado;
    if (categoria !== undefined) updateData.categoria = categoria;
    if (ubicacion !== undefined) updateData.ubicacion = ubicacion;
    if (predioId !== undefined) updateData.predioId = predioId || null;
    if (notas !== undefined) updateData.notas = notas;
    if (fecha !== undefined) updateData.fecha = fecha || null;
    if (asignadoId !== undefined) updateData.asignadoId = asignadoId || null;
    if (etiqueta !== undefined) updateData.etiqueta = etiqueta || null;
    if (etiquetaColor !== undefined) updateData.etiquetaColor = etiquetaColor || null;
    if (proveedor !== undefined) updateData.proveedor = proveedor || null;
    if (camposExtra !== undefined) updateData.camposExtra = camposExtra as Prisma.InputJsonValue;

    const equipo = await prisma.equipo.update({
      where: { id },
      data: updateData,
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

    // Guardar en papelera antes de eliminar
    const { registrarEnPapelera } = await import("@/lib/papelera");
    await registrarEnPapelera("EQUIPO", equipo.nombre, equipo as unknown as Record<string, unknown>, session.userId);

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
