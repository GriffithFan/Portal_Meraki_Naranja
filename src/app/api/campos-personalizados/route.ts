import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { withPrivateCatalogCache } from "@/lib/cacheHeaders";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Obtener todos los campos personalizados activos
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const campos = await prisma.campoPersonalizado.findMany({
    where: { activo: true },
    orderBy: { orden: "asc" },
  });

  return withPrivateCatalogCache(NextResponse.json({ campos }));
}

// Crear uno o varios campos personalizados
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const body = await request.json();

  // Soporta crear uno solo o un array
  const items: { nombre: string; tipo?: string }[] = Array.isArray(body) ? body : [body];
  const created = [];

  for (const item of items) {
    if (!item.nombre?.trim()) continue;

    // Generar clave sanitizada
    const clave = item.nombre
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

    if (!clave) continue;

    // Verificar si ya existe
    const existing = await prisma.campoPersonalizado.findUnique({ where: { clave } });
    if (existing) {
      // Reactivar si estaba desactivado
      if (!existing.activo) {
        await prisma.campoPersonalizado.update({ where: { clave }, data: { activo: true } });
      }
      created.push(existing);
      continue;
    }

    const maxOrden = await prisma.campoPersonalizado.aggregate({ _max: { orden: true } });

    const campo = await prisma.campoPersonalizado.create({
      data: {
        clave,
        nombre: item.nombre.trim(),
        tipo: item.tipo || "text",
        orden: (maxOrden._max.orden ?? 0) + 1,
      },
    });
    created.push(campo);
  }

  return NextResponse.json(created.length === 1 ? created[0] : created);
}

// DELETE /api/campos-personalizados?clave=xxx — Soft-delete
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const clave = request.nextUrl.searchParams.get("clave");
  if (!clave) {
    return NextResponse.json({ error: "Clave requerida" }, { status: 400 });
  }

  const existing = await prisma.campoPersonalizado.findUnique({ where: { clave } });
  if (!existing) {
    return NextResponse.json({ error: "Campo no encontrado" }, { status: 404 });
  }

  await prisma.campoPersonalizado.update({
    where: { clave },
    data: { activo: false },
  });

  return NextResponse.json({ ok: true });
}

// PATCH /api/campos-personalizados?clave=xxx — Editar nombre/ancho
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const clave = request.nextUrl.searchParams.get("clave");
  if (!clave) {
    return NextResponse.json({ error: "Clave requerida" }, { status: 400 });
  }

  const body = await request.json();
  const data: Record<string, unknown> = {};
  if (body.nombre !== undefined) data.nombre = String(body.nombre).slice(0, 100);
  if (body.ancho !== undefined) data.ancho = Math.max(50, Math.min(500, Number(body.ancho) || 100));

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const updated = await prisma.campoPersonalizado.update({
    where: { clave },
    data,
  });

  return NextResponse.json(updated);
}
