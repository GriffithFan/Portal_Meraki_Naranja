import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { comentarioSchema, parseBody, isErrorResponse } from "@/lib/validation";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { sanitizeFileName, validateAndReadUpload } from "@/lib/uploadSecurity";

export const runtime = "nodejs";

// Fotos, videos y zip (lo que un técnico adjunta a una nota)
const ALLOWED_MIME = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/quicktime", "video/webm",
  "application/zip", "application/x-zip-compressed",
];
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "mp4", "mov", "webm", "zip"];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB por archivo
const MAX_FILES = 10;

const COMENTARIO_INCLUDE = {
  usuario: { select: { id: true, nombre: true, rol: true } },
  archivos: {
    select: { id: true, archivoNombre: true, archivoTipo: true, archivoTamanio: true, createdAt: true },
    orderBy: { createdAt: "asc" as const },
  },
};

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const predioId = searchParams.get("predioId");
  const equipoId = searchParams.get("equipoId");

  if (!predioId && !equipoId) {
    return NextResponse.json({ error: "Se requiere predioId o equipoId" }, { status: 400 });
  }

  const comentarios = await prisma.comentario.findMany({
    where: predioId ? { predioId } : { equipoId },
    include: COMENTARIO_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ comentarios });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const contentType = request.headers.get("content-type") || "";

  // ── Multipart: comentario con archivos adjuntos (fotos / videos / zip) ──
  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const files = formData
        .getAll("file")
        .filter((entry): entry is File => entry instanceof File && entry.size > 0);
      const contenido = ((formData.get("contenido") as string) || "").trim();
      const predioId = (formData.get("predioId") as string | null) || null;
      const equipoId = (formData.get("equipoId") as string | null) || null;

      if (!predioId && !equipoId) {
        return NextResponse.json({ error: "Se requiere predioId o equipoId" }, { status: 400 });
      }
      if (files.length === 0 && !contenido) {
        return NextResponse.json({ error: "El comentario está vacío" }, { status: 400 });
      }
      if (files.length > MAX_FILES) {
        return NextResponse.json({ error: `Máximo ${MAX_FILES} archivos por nota` }, { status: 400 });
      }

      // Validar todos los archivos (firma por magic-bytes) antes de escribir nada
      const validated = [];
      for (const file of files) {
        const validation = await validateAndReadUpload({
          file,
          allowedMimeTypes: ALLOWED_MIME,
          allowedExtensions: ALLOWED_EXTENSIONS,
          maxSizeBytes: MAX_FILE_SIZE,
          label: "archivo",
        });
        if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
        validated.push({ file, ...validation });
      }

      const uploadsDir = path.join(process.cwd(), "uploads", "comentarios");
      await mkdir(uploadsDir, { recursive: true });

      const archivosData = [];
      for (let i = 0; i < validated.length; i++) {
        const v = validated[i];
        const safeName = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${v.extension}`;
        await writeFile(path.join(uploadsDir, safeName), v.buffer);
        archivosData.push({
          archivoUrl: `uploads/comentarios/${safeName}`,
          archivoNombre: sanitizeFileName(v.file.name),
          archivoTipo: v.mime,
          archivoTamanio: v.file.size,
        });
      }

      const comentario = await prisma.comentario.create({
        data: {
          contenido,
          userId: session.userId,
          predioId,
          equipoId,
          archivos: { create: archivosData },
        },
        include: COMENTARIO_INCLUDE,
      });

      await prisma.actividad.create({
        data: {
          accion: "COMENTARIO",
          descripcion: archivosData.length
            ? `Nota con ${archivosData.length} archivo(s) adjunto(s)`
            : "Nuevo comentario añadido",
          entidad: predioId ? "PREDIO" : "EQUIPO",
          entidadId: predioId || equipoId || "",
          userId: session.userId,
          metadata: { contenido: contenido.substring(0, 100), archivos: archivosData.length },
        },
      });

      return NextResponse.json(comentario, { status: 201 });
    } catch (error) {
      console.error("Error creando comentario con archivos:", error);
      return NextResponse.json({ error: "Error al subir los archivos" }, { status: 500 });
    }
  }

  // ── JSON: comentario de solo texto (compat) ──
  try {
    const data = await parseBody(request, comentarioSchema);
    if (isErrorResponse(data)) return data;

    const { contenido, predioId, equipoId } = data;

    const comentario = await prisma.comentario.create({
      data: {
        contenido: contenido.trim(),
        userId: session.userId,
        predioId: predioId || null,
        equipoId: equipoId || null,
      },
      include: COMENTARIO_INCLUDE,
    });

    await prisma.actividad.create({
      data: {
        accion: "COMENTARIO",
        descripcion: `Nuevo comentario añadido`,
        entidad: predioId ? "PREDIO" : "EQUIPO",
        entidadId: predioId || equipoId || "",
        userId: session.userId,
        metadata: { contenido: contenido.substring(0, 100) },
      },
    });

    return NextResponse.json(comentario, { status: 201 });
  } catch (error) {
    console.error("Error creando comentario:", error);
    return NextResponse.json({ error: "Error al crear comentario" }, { status: 500 });
  }
}
