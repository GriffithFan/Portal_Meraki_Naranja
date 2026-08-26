import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { tieneAccesoFichas } from "@/lib/fichasAccess";
import { plantillaSecciones } from "@/lib/personalSecciones";
import { Prisma } from "@prisma/client";

/* eslint-disable @typescript-eslint/no-explicit-any */

const TIPOS = ["TECNICO", "CONTRATISTA"];

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!tieneAccesoFichas(session.email)) return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  const fichas = await prisma.fichaPersonal.findMany({
    orderBy: { nombre: "asc" },
    select: {
      id: true, tipo: true, nombre: true, fotoUrl: true, secciones: true, updatedAt: true, userId: true,
      proyectos: { select: { id: true, nombre: true }, orderBy: { orden: "asc" } },
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

  const nombre = typeof body?.nombre === "string" ? body.nombre.trim().slice(0, 200) : "";
  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  const tipo = TIPOS.includes(body?.tipo) ? body.tipo : "TECNICO";
  const proyectoIds: string[] = Array.isArray(body?.proyectoIds) ? body.proyectoIds.filter((x: any) => typeof x === "string") : [];

  const ficha = await prisma.fichaPersonal.create({
    data: {
      nombre,
      tipo,
      // Ficha nueva arranca con las secciones estándar ya puestas (solo completar valores).
      secciones: plantillaSecciones() as unknown as Prisma.InputJsonValue,
      ...(proyectoIds.length ? { proyectos: { connect: proyectoIds.map((id) => ({ id })) } } : {}),
    },
    include: { archivos: true, proyectos: { select: { id: true, nombre: true } } },
  });
  return NextResponse.json(ficha, { status: 201 });
}
