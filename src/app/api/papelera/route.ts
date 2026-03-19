import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/papelera — Listar elementos eliminados
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const tipo = request.nextUrl.searchParams.get("tipo"); // filtro opcional
  const where: any = {};
  if (tipo) where.tipo = tipo;

  const items = await prisma.papeleraItem.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      eliminadoPor: { select: { id: true, nombre: true } },
    },
  });

  return NextResponse.json({ items });
}

// DELETE /api/papelera?id=xxx — Eliminar permanentemente de la papelera
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get("id");
  const all = request.nextUrl.searchParams.get("all");

  if (all === "true") {
    const { count } = await prisma.papeleraItem.deleteMany();
    return NextResponse.json({ ok: true, count });
  }

  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  const item = await prisma.papeleraItem.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  await prisma.papeleraItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// PATCH /api/papelera?id=xxx — Restaurar elemento
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  const item = await prisma.papeleraItem.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const datos = item.datos as any;

  try {
    switch (item.tipo) {
      case "PREDIO": {
        // Restaurar con los campos básicos (sin relaciones)
        const { id: _id, createdAt, updatedAt, equipos, etiquetas, comentarios, asignaciones, tareas, actas, monitoreos, estado, espacio, creador, ...rest } = datos;
        void _id; void createdAt; void updatedAt; void equipos; void etiquetas; void comentarios; void asignaciones; void tareas; void actas; void monitoreos; void estado; void espacio; void creador;
        await prisma.predio.create({ data: rest });
        break;
      }
      case "EQUIPO": {
        const { id: _id, createdAt, updatedAt, comentarios, asignaciones, predio, ...rest } = datos;
        void _id; void createdAt; void updatedAt; void comentarios; void asignaciones; void predio;
        await prisma.equipo.create({ data: rest });
        break;
      }
      case "CALENDARIO": {
        const { id: _id, createdAt, updatedAt, creador, asignado, predio, ...rest } = datos;
        void _id; void createdAt; void updatedAt; void creador; void asignado; void predio;
        await prisma.tareaCalendario.create({ data: rest });
        break;
      }
      case "ACTA": {
        const { id: _id, createdAt, updatedAt, predio, subidoPor, ...rest } = datos;
        void _id; void createdAt; void updatedAt; void predio; void subidoPor;
        await prisma.acta.create({ data: rest });
        break;
      }
      case "INSTRUCTIVO": {
        const { id: _id, createdAt, updatedAt, creador, ...rest } = datos;
        void _id; void createdAt; void updatedAt; void creador;
        await prisma.instructivo.create({ data: rest });
        break;
      }
      case "HOSPEDAJE": {
        const { id: _id, createdAt, updatedAt, ...rest } = datos;
        void _id; void createdAt; void updatedAt;
        await prisma.hospedaje.create({ data: rest });
        break;
      }
      case "FACTURACION": {
        const { id: _id, createdAt, generadoPor, ...rest } = datos;
        void _id; void createdAt; void generadoPor;
        await prisma.reporteFacturacion.create({ data: rest });
        break;
      }
      default:
        return NextResponse.json({ error: `Tipo "${item.tipo}" no soporta restauración` }, { status: 400 });
    }

    // Eliminar de la papelera tras restaurar
    await prisma.papeleraItem.delete({ where: { id } });

    await prisma.actividad.create({
      data: {
        accion: "RESTAURAR",
        descripcion: `"${item.nombre}" restaurado desde papelera`,
        entidad: item.tipo,
        entidadId: id,
        userId: session.userId,
      },
    });

    return NextResponse.json({ ok: true, restored: item.tipo });
  } catch (error: any) {
    console.error("Error restaurando:", error);
    return NextResponse.json({ error: "Error al restaurar: " + (error.message || "desconocido") }, { status: 500 });
  }
}
