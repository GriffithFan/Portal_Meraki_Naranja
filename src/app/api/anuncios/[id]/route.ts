import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { esCategoriaValida, sanitizeRolesDestino } from "@/lib/anunciosConfig";

const PRIORIDADES = ["BAJA", "MEDIA", "ALTA", "URGENTE"];

/** PATCH /api/anuncios/[id] — edita un anuncio (solo Admin/Mod). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};

  if (typeof body.titulo === "string") {
    const t = body.titulo.trim();
    if (!t) return NextResponse.json({ error: "El título no puede quedar vacío" }, { status: 400 });
    data.titulo = t;
  }
  if (typeof body.contenido === "string") {
    const c = body.contenido.trim();
    if (!c) return NextResponse.json({ error: "El contenido no puede quedar vacío" }, { status: 400 });
    data.contenido = c;
  }
  if (typeof body.prioridad === "string" && PRIORIDADES.includes(body.prioridad)) {
    data.prioridad = body.prioridad;
    data.requiereAceptacion = body.prioridad === "URGENTE"; // "Muy alta" → bloqueante
  }
  if (esCategoriaValida(body.categoria)) data.categoria = body.categoria;
  if (body.rolesDestino !== undefined) data.rolesDestino = sanitizeRolesDestino(body.rolesDestino);
  if (body.usuariosDestino !== undefined) {
    data.usuariosDestino = Array.isArray(body.usuariosDestino)
      ? Array.from(new Set(body.usuariosDestino.filter((v: unknown): v is string => typeof v === "string" && v.length > 0)))
      : [];
  }
  if (typeof body.fijado === "boolean") data.fijado = body.fijado;
  if (typeof body.activo === "boolean") data.activo = body.activo;
  if (typeof body.notificar === "boolean") data.notificar = body.notificar;
  if (body.intervaloHoras !== undefined) data.intervaloHoras = Math.max(1, Math.min(168, Number(body.intervaloHoras) || 1));
  if (body.fechaPublicacion !== undefined) {
    const d = body.fechaPublicacion ? new Date(body.fechaPublicacion) : null;
    data.fechaPublicacion = d && !isNaN(d.getTime()) ? d : null;
  }
  if (body.fechaExpiracion !== undefined) {
    const d = body.fechaExpiracion ? new Date(body.fechaExpiracion) : null;
    data.fechaExpiracion = d && !isNaN(d.getTime()) ? d : null;
  }

  const updated = await prisma.anuncio.update({
    where: { id },
    data,
    include: { autor: { select: { id: true, nombre: true } } },
  });

  return NextResponse.json(updated);
}

/** DELETE /api/anuncios/[id] — elimina un anuncio (solo Admin/Mod). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { id } = await params;
  await prisma.anuncio.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
