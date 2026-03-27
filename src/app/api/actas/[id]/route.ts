import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { readFile, unlink } from "fs/promises";
import path from "path";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const acta = await prisma.acta.findUnique({ where: { id } });

  if (!acta) {
    return NextResponse.json({ error: "Acta no encontrada" }, { status: 404 });
  }

  // IDOR: técnicos solo pueden descargar actas de predios asignados/creados
  if (!isModOrAdmin(session.rol) && acta.predioId) {
    const asignacion = await prisma.asignacion.findFirst({
      where: { predioId: acta.predioId, userId: session.userId },
    });
    const predio = await prisma.predio.findUnique({
      where: { id: acta.predioId },
      select: { creadorId: true },
    });
    if (!asignacion && predio?.creadorId !== session.userId) {
      return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    }
  }

  try {
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    const filePath = path.resolve(process.cwd(), acta.archivoRuta);
    if (!filePath.startsWith(uploadsDir)) {
      return NextResponse.json({ error: "Ruta no permitida" }, { status: 403 });
    }
    const fileBuffer = await readFile(filePath);

    // Forzar Content-Type seguro
    const SAFE_MIME: Record<string, string> = {
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    const ext = path.extname(acta.archivoRuta).toLowerCase();
    const safeContentType = SAFE_MIME[ext] || "application/octet-stream";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": safeContentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(acta.archivoNombre)}"`,
        "Content-Length": String(fileBuffer.length),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Archivo no encontrado en el servidor" }, { status: 404 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  const acta = await prisma.acta.findUnique({ where: { id } });
  if (!acta) {
    return NextResponse.json({ error: "Acta no encontrada" }, { status: 404 });
  }

  // Borrar archivo del disco
  try {
    const filePath = path.resolve(process.cwd(), acta.archivoRuta);
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    if (filePath.startsWith(uploadsDir)) {
      await unlink(filePath).catch(() => {});
    }
  } catch { /* ignorar */ }

  await prisma.acta.delete({ where: { id } });

  await prisma.actividad.create({
    data: {
      accion: "ELIMINAR",
      descripcion: `Acta "${acta.nombre}" eliminada`,
      entidad: "ACTA",
      entidadId: id,
      userId: session.userId,
    },
  });

  return NextResponse.json({ ok: true });
}
