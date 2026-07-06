import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
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
 *
 * Sirve por streaming (sin cargar el archivo entero en memoria) y soporta
 * HTTP Range: imprescindible para que iOS/Android reproduzcan video/audio
 * y permitan adelantar/retroceder sin descargar todo el archivo.
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
    // Quitar / inicial si existe para que path.resolve sea relativo al cwd
    const cleanUrl = mensaje.archivoUrl.replace(/^\/+/, "");
    const filePath = path.resolve(process.cwd(), cleanUrl);

    // Path traversal protection
    if (!filePath.startsWith(uploadsDir)) {
      return NextResponse.json({ error: "Ruta no permitida" }, { status: 403 });
    }

    const stats = await stat(filePath);

    const ext = path.extname(mensaje.archivoUrl).toLowerCase();
    // Preferir el MIME tipo guardado en la DB (más preciso para .webm audio vs video)
    const storedMime = mensaje.archivoTipo?.split(";")[0]?.trim();
    const safeContentType = storedMime || SAFE_MIME[ext] || "application/octet-stream";

    const inline = request.nextUrl.searchParams.get("inline") === "true";
    const disposition = inline ? "inline" : "attachment";
    const fileName = mensaje.archivoNombre || `archivo${ext}`;

    const baseHeaders: Record<string, string> = {
      "Content-Type": safeContentType,
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(fileName)}"`,
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
      // El nombre de archivo en disco es único e inmutable: cachear fuerte
      // para que el celular no re-descargue las mismas fotos en cada vista.
      "Cache-Control": "private, max-age=31536000, immutable",
    };

    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      let start = match?.[1] ? parseInt(match[1], 10) : NaN;
      let end = match?.[2] ? parseInt(match[2], 10) : NaN;

      if (match && !match[1] && match[2]) {
        // Sufijo "bytes=-N": últimos N bytes
        start = Math.max(0, stats.size - parseInt(match[2], 10));
        end = stats.size - 1;
      }
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= stats.size) end = stats.size - 1;

      if (!match || start > end || start >= stats.size) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${stats.size}` },
        });
      }

      const stream = createReadStream(filePath, { start, end });
      return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${end}/${stats.size}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }

    const stream = createReadStream(filePath);
    return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
      headers: {
        ...baseHeaders,
        "Content-Length": String(stats.size),
      },
    });
  } catch {
    return NextResponse.json({ error: "Archivo no encontrado en el servidor" }, { status: 404 });
  }
}
