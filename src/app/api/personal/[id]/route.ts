import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { tieneAccesoFichas } from "@/lib/fichasAccess";
import { sanitizarSecciones } from "@/lib/personalSecciones";
import { Prisma } from "@prisma/client";
import { unlink } from "fs/promises";
import path from "path";

const TIPOS = ["TECNICO", "CONTRATISTA"];

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
    include: {
      archivos: { orderBy: { createdAt: "desc" } },
      proyectos: { select: { id: true, nombre: true }, orderBy: { orden: "asc" } },
    },
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

  const nombre = typeof body?.nombre === "string" ? body.nombre.trim().slice(0, 200) : "";
  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });

  const data: any = { nombre };
  if (TIPOS.includes(body?.tipo)) data.tipo = body.tipo;
  if (Array.isArray(body?.secciones)) {
    data.secciones = sanitizarSecciones(body.secciones) as unknown as Prisma.InputJsonValue;
  }
  if (typeof body?.notasGenerales === "string") {
    data.notasGenerales = body.notasGenerales.slice(0, 5000) || null;
  }
  // Vinculo con el usuario de Carrot. Se carga a mano porque las fichas usan el nombre
  // legal completo y los usuarios apodos: cruzarlos por nombre no funciona (de 35 fichas
  // solo 2 coincidian). Sirve para mostrar la foto del tecnico en el mapa de ubicaciones.
  // "" o null desvincula. Es @unique: si el usuario ya esta tomado por otra ficha, falla.
  if (body?.userId !== undefined) {
    const uid = typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : null;
    if (uid) {
      const yaTomado = await prisma.fichaPersonal.findFirst({
        where: { userId: uid, id: { not: id } },
        select: { nombre: true },
      });
      if (yaTomado) {
        return NextResponse.json(
          { error: `Ese usuario ya esta vinculado a la ficha de "${yaTomado.nombre}"` },
          { status: 409 }
        );
      }
    }
    data.userId = uid;
  }

  // Multi-select de proyectos (reemplaza el set completo).
  if (Array.isArray(body?.proyectoIds)) {
    const ids: string[] = body.proyectoIds.filter((x: any) => typeof x === "string");
    data.proyectos = { set: ids.map((pid) => ({ id: pid })) };
  }

  const ficha = await prisma.fichaPersonal.update({
    where: { id },
    data,
    include: {
      archivos: { orderBy: { createdAt: "desc" } },
      proyectos: { select: { id: true, nombre: true }, orderBy: { orden: "asc" } },
    },
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
  const rutas = [...ficha.archivos.map((a) => a.ruta), ficha.fotoUrl].filter(Boolean) as string[];
  for (const ruta of rutas) {
    try {
      const filePath = path.resolve(process.cwd(), ruta.replace(/^\/+/, ""));
      if (filePath.startsWith(uploadsDir)) await unlink(filePath).catch(() => {});
    } catch { /* ignorar */ }
  }

  await prisma.fichaPersonal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
