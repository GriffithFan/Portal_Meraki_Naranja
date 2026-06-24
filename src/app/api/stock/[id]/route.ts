import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

    const { nombre, descripcion, numeroSerie, modelo, marca, cantidad, estado, categoria, ubicacion, predioId, notas, fecha, asignadoId, etiqueta, etiquetaColor, proveedor, camposExtra } = data;

    const existing = await prisma.equipo.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
    }

    const today = new Date().toISOString().split("T")[0];
    const updateData: Prisma.EquipoUncheckedUpdateInput = {
        fecha: fecha !== undefined ? (fecha || null) : today,
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
        ...(asignadoId !== undefined && { asignadoId: asignadoId || null }),
        ...(etiqueta !== undefined && { etiqueta: etiqueta || null }),
        ...(etiquetaColor !== undefined && { etiquetaColor: etiquetaColor || null }),
        ...(proveedor !== undefined && { proveedor: proveedor || null }),
        ...(camposExtra !== undefined && { camposExtra: camposExtra as Prisma.InputJsonValue }),
    };

    const equipo = await prisma.equipo.update({
      where: { id },
      data: updateData,
    });

    // Resolver nombres de relaciones para el log
    const [asigOld, asigNew, predOld, predNew] = await Promise.all([
      existing.asignadoId ? prisma.user.findUnique({ where: { id: existing.asignadoId }, select: { nombre: true } }) : Promise.resolve(null),
      asignadoId ? prisma.user.findUnique({ where: { id: asignadoId }, select: { nombre: true } }) : Promise.resolve(null),
      existing.predioId ? prisma.predio.findUnique({ where: { id: existing.predioId }, select: { nombre: true } }) : Promise.resolve(null),
      predioId ? prisma.predio.findUnique({ where: { id: predioId }, select: { nombre: true } }) : Promise.resolve(null),
    ]);

    // Construir descripción detallada de cambios
    const FIELD_LABELS: Record<string, string> = {
      nombre: "Nombre", descripcion: "Descripción", numeroSerie: "Serial", modelo: "Modelo",
      marca: "Marca", cantidad: "Cantidad", estado: "Estado", categoria: "Categoría",
      ubicacion: "Ubicación", predioId: "Predio", notas: "Notas", fecha: "Fecha",
      asignadoId: "Asignado", etiqueta: "Etiqueta", proveedor: "Proveedor",
    };
    const changes: string[] = [];
    for (const [key, newVal] of Object.entries(updateData)) {
      const oldVal = (existing as any)[key];
      const newStr = String(newVal ?? "").trim();
      const oldStr = String(oldVal ?? "").trim();
      if (newStr !== oldStr && FIELD_LABELS[key]) {
        if (key === "asignadoId") {
          const oldName = asigOld?.nombre || (oldStr ? "Sin asignar" : "—");
          const newName = asigNew?.nombre || (newStr ? "Sin asignar" : "—");
          changes.push(`Asignado: ${oldName} → ${newName}`);
          continue;
        }
        if (key === "predioId") {
          const oldName = predOld?.nombre || (oldStr ? oldStr.slice(0, 8) + "…" : "—");
          const newName = predNew?.nombre || (newStr ? newStr.slice(0, 8) + "…" : "—");
          changes.push(`Predio: ${oldName} → ${newName}`);
          continue;
        }
        changes.push(`${FIELD_LABELS[key]}: ${oldStr || "—"} → ${newStr || "—"}`);
      }
    }
    const accion = estado && estado !== existing.estado ? "CAMBIO_ESTADO" : "ACTUALIZAR";
    const desc = changes.length > 0
      ? `Equipo "${equipo.nombre}" modificado — ${changes.join("; ")}`
      : `Equipo "${equipo.nombre}" actualizado`;

    await prisma.actividad.create({
      data: {
        accion,
        descripcion: desc,
        entidad: "EQUIPO",
        entidadId: equipo.id,
        userId: session.userId,
      },
    });

    return NextResponse.json(equipo);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ya existe otro equipo con ese número de serie" }, { status: 409 });
    }
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
