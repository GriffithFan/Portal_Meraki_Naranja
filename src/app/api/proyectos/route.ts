import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { tieneAccesoFichas } from "@/lib/fichasAccess";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Catálogo global de proyectos (para el multi-select de Personal).
// Leer: cualquiera con acceso a fichas. Crear: solo ADMIN.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!tieneAccesoFichas(session.email)) return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  const proyectos = await prisma.proyecto.findMany({
    where: { activo: true },
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    select: { id: true, nombre: true, orden: true },
  });
  return NextResponse.json({ proyectos });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!tieneAccesoFichas(session.email) || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo un administrador puede crear proyectos" }, { status: 403 });
  }

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim().slice(0, 80) : "";
  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });

  const existe = await prisma.proyecto.findUnique({ where: { nombre }, select: { id: true } });
  if (existe) return NextResponse.json({ error: "Ya existe un proyecto con ese nombre" }, { status: 409 });

  const max = await prisma.proyecto.aggregate({ _max: { orden: true } });
  const proyecto = await prisma.proyecto.create({
    data: { nombre, orden: (max._max.orden ?? 0) + 1 },
    select: { id: true, nombre: true, orden: true },
  });
  return NextResponse.json(proyecto, { status: 201 });
}
