import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { readFile } from "fs/promises";
import path from "path";

const SAFE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".zip": "application/zip",
};

/**
 * GET /api/chat/archivo/[id] — Descargar archivo de un mensaje de chat
 * ?inline=true para mostrar en el navegador (imágenes, audio, video)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;

  const mensaje = await prisma.chatMensaje.findUnique({
    where: { id },
    select: {
      archivoUrl: true,
      archivoNombre: true,
      archivoTipo: true,
      conversacion: {
        select: { creadorId: true, agenteId: true },
      },
    },
  });

  if (!mensaje?.archivoUrl) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }

  // Verificar acceso: creador, agente, o usuario Mesa
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { esMesa: true },
  });

  const esCreador = mensaje.conversacion.creadorId === session.userId;
  const esAgente = mensaje.conversacion.agenteId === session.userId;
  const esMesa = user?.esMesa === true;

  if (!esCreador && !esAgente && !esMesa) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    const filePath = path.resolve(process.cwd(), mensaje.archivoUrl);

    // Path traversal protection
    if (!filePath.startsWith(uploadsDir)) {
      return NextResponse.json({ error: "Ruta no permitida" }, { status: 403 });
    }

    const fileBuffer = await readFile(filePath);

    const ext = path.extname(mensaje.archivoUrl).toLowerCase();
    const safeContentType = SAFE_MIME[ext] || "application/octet-stream";

    const inline = request.nextUrl.searchParams.get("inline") === "true";
    const disposition = inline ? "inline" : "attachment";
    const fileName = mensaje.archivoNombre || `archivo${ext}`;

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
