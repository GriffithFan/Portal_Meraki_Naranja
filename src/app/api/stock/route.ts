import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { sanitizeSearch } from "@/lib/sanitize";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const estado = searchParams.get("estado");
  const categoria = searchParams.get("categoria");
  const buscar = sanitizeSearch(searchParams.get("buscar"));

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const where: any = {};
  if (estado) where.estado = estado;
  if (categoria) where.categoria = categoria;
  if (buscar) {
    where.OR = [
      { nombre: { contains: buscar, mode: "insensitive" } },
      { marca: { contains: buscar, mode: "insensitive" } },
      { modelo: { contains: buscar, mode: "insensitive" } },
      { numeroSerie: { contains: buscar, mode: "insensitive" } },
    ];
  }

  const [equipos, total] = await Promise.all([
    prisma.equipo.findMany({
      where,
      include: {
        predio: { select: { id: true, nombre: true } },
        _count: { select: { comentarios: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.equipo.count({ where }),
  ]);

  const categorias = await prisma.equipo.findMany({
    select: { categoria: true },
    distinct: ["categoria"],
    where: { categoria: { not: null } },
  });

  return NextResponse.json({
    equipos,
    total,
    categorias: categorias.map((c) => c.categoria).filter(Boolean),
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { nombre, descripcion, numeroSerie, modelo, marca, cantidad, estado, categoria, ubicacion, predioId, notas } = body;

    if (!nombre) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    }

    if (numeroSerie) {
      const existing = await prisma.equipo.findUnique({ where: { numeroSerie } });
      if (existing) {
        return NextResponse.json({ error: "El número de serie ya existe" }, { status: 409 });
      }
    }

    const equipo = await prisma.equipo.create({
      data: {
        nombre,
        descripcion,
        numeroSerie: numeroSerie || null,
        modelo,
        marca,
        cantidad: cantidad ? parseInt(cantidad) : 1,
        estado: estado || "DISPONIBLE",
        categoria,
        ubicacion,
        predioId: predioId || null,
        notas,
      },
    });

    await prisma.actividad.create({
      data: {
        accion: "CREAR",
        descripcion: `Equipo "${nombre}" agregado al stock`,
        entidad: "EQUIPO",
        entidadId: equipo.id,
        userId: session.userId,
      },
    });

    return NextResponse.json(equipo, { status: 201 });
  } catch (error) {
    console.error("Error creando equipo:", error);
    return NextResponse.json({ error: "Error al crear equipo" }, { status: 500 });
  }
}
