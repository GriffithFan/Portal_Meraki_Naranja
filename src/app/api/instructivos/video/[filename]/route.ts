import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { stat, open } from "fs/promises";
import path from "path";

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { filename } = await params;

  // Validar que no haya path traversal
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return NextResponse.json({ error: "Ruta no permitida" }, { status: 403 });
  }

  const uploadsDir = path.resolve(process.cwd(), "uploads", "instructivos");
  const filePath = path.resolve(uploadsDir, filename);

  // Double-check path traversal protection
  if (!filePath.startsWith(uploadsDir)) {
    return NextResponse.json({ error: "Ruta no permitida" }, { status: 403 });
  }

  try {
    const fileStat = await stat(filePath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const fileSize = fileStat.size;

    // Soporte descarga forzada via ?download=1
    const download = request.nextUrl.searchParams.get("download") === "1";
    const dispositionHeaders: Record<string, string> = {};
    if (download) {
      dispositionHeaders["Content-Disposition"] = `attachment; filename="${encodeURIComponent(filename)}"`;
    }

    // Soporte para Range requests (seek en video)
    const range = request.headers.get("range");

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${fileSize}` },
        });
      }

      const chunkSize = end - start + 1;
      const fileHandle = await open(filePath, "r");
      const buffer = Buffer.alloc(chunkSize);
      await fileHandle.read(buffer, 0, chunkSize, start);
      await fileHandle.close();

      return new NextResponse(buffer, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": contentType,
          "Cache-Control": "private, max-age=3600",
          ...dispositionHeaders,
        },
      });
    }

    // Sin Range: enviar archivo completo
    const fileHandle = await open(filePath, "r");
    const buffer = Buffer.alloc(fileSize);
    await fileHandle.read(buffer, 0, fileSize, 0);
    await fileHandle.close();

    return new NextResponse(buffer, {
      headers: {
        "Content-Length": String(fileSize),
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
        ...dispositionHeaders,
      },
    });
  } catch {
    return NextResponse.json({ error: "Video no encontrado" }, { status: 404 });
  }
}
