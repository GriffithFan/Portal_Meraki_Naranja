import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { tieneAccesoFichas } from "@/lib/fichasAccess";
import { validateAndReadUpload } from "@/lib/uploadSecurity";
import { writeFile, mkdir, unlink, readFile } from "fs/promises";
import path from "path";

const MIME_POR_EXT: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
};

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB

async function guard() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  if (!tieneAccesoFichas(session.email)) return { error: NextResponse.json({ error: "Acceso denegado" }, { status: 403 }) };
  return { session };
}

// Sirve la foto de perfil (para el <img>). Requiere sesión con acceso a fichas.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g.error) return g.error;

  const { id } = await params;
  const ficha = await prisma.fichaPersonal.findUnique({ where: { id }, select: { fotoUrl: true } });
  if (!ficha?.fotoUrl) return NextResponse.json({ error: "Sin foto" }, { status: 404 });

  try {
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    const filePath = path.resolve(process.cwd(), ficha.fotoUrl.replace(/^\/+/, ""));
    if (!filePath.startsWith(uploadsDir)) return NextResponse.json({ error: "Ruta no permitida" }, { status: 403 });
    const buf = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": MIME_POR_EXT[ext] || "application/octet-stream",
        "Content-Length": String(buf.length),
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
  }
}

// Sube/reemplaza la foto de perfil de la ficha.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g.error) return g.error;

  const { id } = await params;
  const ficha = await prisma.fichaPersonal.findUnique({ where: { id }, select: { id: true, fotoUrl: true } });
  if (!ficha) return NextResponse.json({ error: "Ficha no encontrada" }, { status: 404 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Imagen requerida" }, { status: 400 });

    const validation = await validateAndReadUpload({
      file,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
      allowedExtensions: ALLOWED_EXTENSIONS,
      maxSizeBytes: MAX_FILE_SIZE,
      label: "imagen",
    });
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    const dir = path.join(process.cwd(), "uploads", "personal", "fotos");
    await mkdir(dir, { recursive: true });
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${validation.extension}`;
    await writeFile(path.join(dir, safeName), validation.buffer);
    const fotoUrl = `/uploads/personal/fotos/${safeName}`;

    // Borrar la foto anterior del disco.
    if (ficha.fotoUrl) {
      const uploadsDir = path.resolve(process.cwd(), "uploads");
      const prev = path.resolve(process.cwd(), ficha.fotoUrl.replace(/^\/+/, ""));
      if (prev.startsWith(uploadsDir)) await unlink(prev).catch(() => {});
    }

    await prisma.fichaPersonal.update({ where: { id }, data: { fotoUrl } });
    return NextResponse.json({ fotoUrl }, { status: 201 });
  } catch (error) {
    console.error("Error subiendo foto de ficha:", error);
    return NextResponse.json({ error: "Error al subir la imagen" }, { status: 500 });
  }
}

// Quita la foto de perfil.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g.error) return g.error;

  const { id } = await params;
  const ficha = await prisma.fichaPersonal.findUnique({ where: { id }, select: { id: true, fotoUrl: true } });
  if (!ficha) return NextResponse.json({ error: "Ficha no encontrada" }, { status: 404 });

  if (ficha.fotoUrl) {
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    const prev = path.resolve(process.cwd(), ficha.fotoUrl.replace(/^\/+/, ""));
    if (prev.startsWith(uploadsDir)) await unlink(prev).catch(() => {});
  }
  await prisma.fichaPersonal.update({ where: { id }, data: { fotoUrl: null } });
  return NextResponse.json({ ok: true });
}
