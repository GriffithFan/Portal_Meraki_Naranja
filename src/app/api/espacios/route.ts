import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/espacios — Listar árbol de espacios con conteos
export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const espacios = await prisma.espacioTrabajo.findMany({
    where: { activo: true },
    include: {
      _count: { select: { predios: true, hijos: true } },
    },
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
  });

  // Construir árbol
  const map = new Map<string, any>();
  const roots: any[] = [];

  for (const e of espacios) {
    map.set(e.id, { ...e, children: [] });
  }

  for (const e of espacios) {
    const node = map.get(e.id);
    if (e.parentId && map.has(e.parentId)) {
      map.get(e.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }

  return NextResponse.json({ espacios: roots });
}

// POST /api/espacios — Crear espacio
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  try {
    const { nombre, descripcion, color, icono, parentId } = await request.json();

    if (!nombre?.trim())
      return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

    // Calcular siguiente orden
    const maxOrden = await prisma.espacioTrabajo.aggregate({
      where: { parentId: parentId || null },
      _max: { orden: true },
    });

    const espacio = await prisma.espacioTrabajo.create({
      data: {
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        color: color || "#3b82f6",
        icono: icono || "folder",
        parentId: parentId || null,
        orden: (maxOrden._max.orden ?? -1) + 1,
        creadorId: session.userId,
      },
    });

    return NextResponse.json(espacio, { status: 201 });
  } catch (error) {
    console.error("Error creando espacio:", error);
    return NextResponse.json({ error: "Error al crear espacio" }, { status: 500 });
  }
}
