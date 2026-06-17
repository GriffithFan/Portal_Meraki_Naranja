import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { tieneAccesoFichas } from "@/lib/fichasAccess";
import { normalizeFichaBody } from "@/lib/fichaPersonal";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!tieneAccesoFichas(session.email)) return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  const fichas = await prisma.fichaPersonal.findMany({
    orderBy: { nombre: "asc" },
    select: {
      id: true, tipo: true, nombre: true, dni: true, direccion: true, telefono: true,
      carnet: true, seguro: true, monotributo: true, autoModelo: true, autoPatente: true,
      autoTarjetaRed: true, proyecto: true, updatedAt: true,
      _count: { select: { archivos: true } },
    },
  });

  return NextResponse.json({ fichas });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!tieneAccesoFichas(session.email)) return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const data = normalizeFichaBody(body);
  if (!data.nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });

  const ficha = await prisma.fichaPersonal.create({ data });
  return NextResponse.json(ficha, { status: 201 });
}
