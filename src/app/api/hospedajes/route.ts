import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const hospedajes = await prisma.hospedaje.findMany({
    where: { activo: true },
    orderBy: [{ provincia: "asc" }, { ubicacion: "asc" }, { nombre: "asc" }],
  });

  return NextResponse.json({ hospedajes });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const body = await request.json();
  const { ubicacion, nombre, tipo, garage, telefono, provincia, notas } = body;

  if (!ubicacion?.trim() || !nombre?.trim())
    return NextResponse.json({ error: "Ubicación y nombre son obligatorios" }, { status: 400 });

  const hospedaje = await prisma.hospedaje.create({
    data: {
      ubicacion: ubicacion.trim(),
      nombre: nombre.trim(),
      tipo: tipo?.trim() || null,
      garage: garage?.trim() || null,
      telefono: telefono ? String(telefono).trim() : null,
      provincia: provincia?.trim() || null,
      notas: notas?.trim() || null,
    },
  });

  return NextResponse.json(hospedaje, { status: 201 });
}
