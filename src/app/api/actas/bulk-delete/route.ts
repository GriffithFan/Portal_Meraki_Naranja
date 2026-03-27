import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { unlink } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const body = await request.json();
  const ids: string[] = body.ids;

  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) {
    return NextResponse.json({ error: "IDs inválidos" }, { status: 400 });
  }

  // Validar que todos son strings no vacíos
  if (!ids.every((id) => typeof id === "string" && id.length > 0)) {
    return NextResponse.json({ error: "IDs inválidos" }, { status: 400 });
  }

  const actas = await prisma.acta.findMany({ where: { id: { in: ids } } });

  // Borrar archivos del disco
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  for (const acta of actas) {
    try {
      const filePath = path.resolve(process.cwd(), acta.archivoRuta);
      if (filePath.startsWith(uploadsDir)) {
        await unlink(filePath).catch(() => {});
      }
    } catch { /* ignorar */ }
  }

  await prisma.acta.deleteMany({ where: { id: { in: ids } } });

  await prisma.actividad.create({
    data: {
      accion: "ELIMINAR",
      descripcion: `${actas.length} acta(s) eliminadas en lote`,
      entidad: "ACTA",
      entidadId: actas[0]?.id || "bulk",
      userId: session.userId,
    },
  });

  return NextResponse.json({ ok: true, deleted: actas.length });
}
