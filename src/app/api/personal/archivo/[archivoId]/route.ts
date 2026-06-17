import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { tieneAccesoFichas } from "@/lib/fichasAccess";
import { readFile, unlink } from "fs/promises";
import path from "path";

const SAFE_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
// Solo las imágenes se sirven inline (para el visor emergente); el resto se descarga.
const INLINE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ archivoId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!tieneAccesoFichas(session.email)) return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  const { archivoId } = await params;
  const archivo = await prisma.fichaArchivo.findUnique({ where: { id: archivoId } });
  if (!archivo) return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });

  try {
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    const filePath = path.resolve(process.cwd(), archivo.ruta.replace(/^\/+/, ""));
    if (!filePath.startsWith(uploadsDir)) {
      return NextResponse.json({ error: "Ruta no permitida" }, { status: 403 });
    }
    const fileBuffer = await readFile(filePath);

    const ext = path.extname(archivo.ruta).toLowerCase();
    const contentType = SAFE_MIME[ext] || "application/octet-stream";
    // ?dl=1 fuerza la descarga; si no, solo las imágenes se sirven inline (para el visor).
    const forzarDescarga = request.nextUrl.searchParams.get("dl") === "1";
    const disposition = (!forzarDescarga && INLINE_EXT.has(ext)) ? "inline" : "attachment";

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(archivo.nombre)}"`,
        "Content-Length": String(fileBuffer.length),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Archivo no encontrado en el servidor" }, { status: 404 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ archivoId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!tieneAccesoFichas(session.email)) return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  const { archivoId } = await params;
  const archivo = await prisma.fichaArchivo.findUnique({ where: { id: archivoId } });
  if (!archivo) return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });

  try {
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    const filePath = path.resolve(process.cwd(), archivo.ruta.replace(/^\/+/, ""));
    if (filePath.startsWith(uploadsDir)) await unlink(filePath).catch(() => {});
  } catch { /* ignorar */ }

  await prisma.fichaArchivo.delete({ where: { id: archivoId } });
  return NextResponse.json({ ok: true });
}
