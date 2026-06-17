import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { tieneAccesoFichas } from "@/lib/fichasAccess";
import { normalizeFichaBody } from "@/lib/fichaPersonal";
import { unlink } from "fs/promises";
import path from "path";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function guard() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  if (!tieneAccesoFichas(session.email)) return { error: NextResponse.json({ error: "Acceso denegado" }, { status: 403 }) };
  return { session };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g.error) return g.error;

  const { id } = await params;
  const ficha = await prisma.fichaPersonal.findUnique({
    where: { id },
    include: { archivos: { orderBy: { createdAt: "desc" } } },
  });
  if (!ficha) return NextResponse.json({ error: "Ficha no encontrada" }, { status: 404 });

  return NextResponse.json(ficha);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g.error) return g.error;

  const { id } = await params;
  const existing = await prisma.fichaPersonal.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Ficha no encontrada" }, { status: 404 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const data = normalizeFichaBody(body);
  if (!data.nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });

  const ficha = await prisma.fichaPersonal.update({
    where: { id },
    data,
    include: { archivos: { orderBy: { createdAt: "desc" } } },
  });
  return NextResponse.json(ficha);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g.error) return g.error;

  const { id } = await params;
  const ficha = await prisma.fichaPersonal.findUnique({
    where: { id },
    include: { archivos: { select: { ruta: true } } },
  });
  if (!ficha) return NextResponse.json({ error: "Ficha no encontrada" }, { status: 404 });

  // Borrar los archivos físicos del disco (la relación se borra en cascada).
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  for (const a of ficha.archivos) {
    try {
      const filePath = path.resolve(process.cwd(), a.ruta.replace(/^\/+/, ""));
      if (filePath.startsWith(uploadsDir)) await unlink(filePath).catch(() => {});
    } catch { /* ignorar */ }
  }

  await prisma.fichaPersonal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
