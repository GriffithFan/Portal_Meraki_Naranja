import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { tieneAccesoFichas, esSeccionValida } from "@/lib/fichasAccess";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { sanitizeFileName, validateAndReadUpload } from "@/lib/uploadSecurity";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const ALLOWED_EXTENSIONS = ["pdf", "zip", "jpg", "jpeg", "png", "webp", "gif", "docx", "doc"];
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!tieneAccesoFichas(session.email)) return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  const { id } = await params;
  const ficha = await prisma.fichaPersonal.findUnique({ where: { id }, select: { id: true, camposExtra: true } });
  if (!ficha) return NextResponse.json({ error: "Ficha no encontrada" }, { status: 404 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const seccionRaw = (formData.get("seccion") as string | null)?.trim() || "general";
    // Acepta una sección fija o una clave de campo personalizado de ESTA ficha.
    const clavesCustom = (ficha.camposExtra && typeof ficha.camposExtra === "object" && !Array.isArray(ficha.camposExtra))
      ? Object.keys(ficha.camposExtra as Record<string, any>)
      : [];
    const seccion = (esSeccionValida(seccionRaw) || clavesCustom.includes(seccionRaw)) ? seccionRaw : "general";

    if (!file) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });

    const validation = await validateAndReadUpload({
      file,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
      allowedExtensions: ALLOWED_EXTENSIONS,
      maxSizeBytes: MAX_FILE_SIZE,
      label: "archivo",
    });
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    const uploadsDir = path.join(process.cwd(), "uploads", "personal");
    await mkdir(uploadsDir, { recursive: true });

    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${validation.extension}`;
    await writeFile(path.join(uploadsDir, safeName), validation.buffer);

    const archivo = await prisma.fichaArchivo.create({
      data: {
        fichaId: id,
        seccion,
        nombre: sanitizeFileName(file.name),
        ruta: `/uploads/personal/${safeName}`,
        tipo: validation.mime,
        size: file.size,
        subidoPorId: session.userId,
      },
    });

    return NextResponse.json(archivo, { status: 201 });
  } catch (error) {
    console.error("Error subiendo archivo de ficha:", error);
    return NextResponse.json({ error: "Error al subir el archivo" }, { status: 500 });
  }
}
