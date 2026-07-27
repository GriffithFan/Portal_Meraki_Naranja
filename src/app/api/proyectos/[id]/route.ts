import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { tieneAccesoFichas } from "@/lib/fichasAccess";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function guardAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  if (!tieneAccesoFichas(session.email) || session.rol !== "ADMIN") {
    return { error: NextResponse.json({ error: "Solo un administrador puede gestionar proyectos" }, { status: 403 }) };
  }
  return { session };
}

// Renombrar / reordenar / activar-desactivar un proyecto del catálogo.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin();
  if (g.error) return g.error;

  const { id } = await params;
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const data: any = {};
  if (typeof body?.nombre === "string") {
    const nombre = body.nombre.trim().slice(0, 80);
    if (!nombre) return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
    const dup = await prisma.proyecto.findFirst({ where: { nombre, id: { not: id } }, select: { id: true } });
    if (dup) return NextResponse.json({ error: "Ya existe un proyecto con ese nombre" }, { status: 409 });
    data.nombre = nombre;
  }
  if (typeof body?.orden === "number") data.orden = body.orden;
  if (typeof body?.activo === "boolean") data.activo = body.activo;

  const proyecto = await prisma.proyecto.update({
    where: { id },
    data,
    select: { id: true, nombre: true, orden: true, activo: true },
  });
  return NextResponse.json(proyecto);
}

// Borrar un proyecto del catálogo (se quita de todas las fichas que lo tuvieran).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin();
  if (g.error) return g.error;

  const { id } = await params;
  try {
    await prisma.proyecto.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "No se pudo borrar el proyecto" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
