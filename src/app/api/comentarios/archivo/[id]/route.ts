import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

const SAFE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".zip": "application/zip",
};

/**
 * GET /api/comentarios/archivo/[id] — Servir un adjunto de comentario.
 * ?inline=true para previsualizar (fotos/videos); por defecto descarga (zip).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const archivo = await prisma.comentarioArchivo.findUnique({
    where: { id },
    select: {
      archivoUrl: true,
      archivoNombre: true,
      archivoTipo: true,
      comentario: { select: { predioId: true } },
    },
  });

  if (!archivo?.archivoUrl) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }

  // IDOR: un técnico solo accede a adjuntos de predios asignados/creados por él
  const predioId = archivo.comentario?.predioId;
  if (!isModOrAdmin(session.rol) && predioId) {
    const [asignacion, predio] = await Promise.all([
      prisma.asignacion.findFirst({ where: { predioId, userId: session.userId } }),
      prisma.predio.findUnique({ where: { id: predioId }, select: { creadorId: true } }),
    ]);
    if (!asignacion && predio?.creadorId !== session.userId) {
      return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    }
  }

  try {
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    const cleanUrl = archivo.archivoUrl.replace(/^\/+/, "");
    const filePath = path.resolve(process.cwd(), cleanUrl);
    // Protección contra path traversal
    if (!filePath.startsWith(uploadsDir)) {
      return NextResponse.json({ error: "Ruta no permitida" }, { status: 403 });
    }

    const fileBuffer = await readFile(filePath);

    const ext = path.extname(archivo.archivoUrl).toLowerCase();
    const storedMime = archivo.archivoTipo?.split(";")[0]?.trim();
    const safeContentType = storedMime || SAFE_MIME[ext] || "application/octet-stream";

    const inline = request.nextUrl.searchParams.get("inline") === "true";
    const disposition = inline ? "inline" : "attachment";
    const fileName = archivo.archivoNombre || `archivo${ext}`;

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": safeContentType,
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(fileName)}"`,
        "Content-Length": String(fileBuffer.length),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Archivo no encontrado en el servidor" }, { status: 404 });
  }
}
