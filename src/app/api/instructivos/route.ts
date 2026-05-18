import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { sanitizeFileName, validateAndReadUpload } from "@/lib/uploadSecurity";

// Incrementar límite para upload de videos
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
];
const ALLOWED_VIDEO_EXT = ["mp4", "webm", "ogg"];
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
const ALLOWED_IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif"];
const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25MB

const ALLOWED_PDF_TYPES = ["application/pdf"];
const ALLOWED_PDF_EXT = ["pdf"];
const MAX_PDF_SIZE = 50 * 1024 * 1024; // 50MB

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const categoria = searchParams.get("categoria");

  const where: { activo: boolean; categoria?: string } = { activo: true };
  if (categoria && categoria !== "Todas") where.categoria = categoria;

  const instructivos = await prisma.instructivo.findMany({
    where,
    include: {
      creador: { select: { id: true, nombre: true } },
    },
    orderBy: [{ categoria: "asc" }, { orden: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ instructivos });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const titulo = (formData.get("titulo") as string)?.trim();
    const contenido = (formData.get("contenido") as string)?.trim() || null;
    const categoria = (formData.get("categoria") as string)?.trim() || "General";
    const orden = parseInt(formData.get("orden") as string) || 0;
    const video = formData.get("video") as File | null;
    const imagen = formData.get("imagen") as File | null;
    const pdf = formData.get("pdf") as File | null;
    const youtubeUrl = (formData.get("youtubeUrl") as string)?.trim() || null;

    if (!titulo) {
      return NextResponse.json({ error: "El título es requerido" }, { status: 400 });
    }

    let videoData: {
      videoNombre?: string;
      videoRuta?: string;
      videoTipo?: string;
      videoSize?: number;
    } = {};

    if (video && video.size > 0) {
      const validation = await validateAndReadUpload({
        file: video,
        allowedMimeTypes: ALLOWED_VIDEO_TYPES,
        allowedExtensions: ALLOWED_VIDEO_EXT,
        maxSizeBytes: MAX_VIDEO_SIZE,
        label: "video",
      });
      if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

      const uploadsDir = path.join(process.cwd(), "uploads", "instructivos");
      await mkdir(uploadsDir, { recursive: true });

      const ext = `.${validation.extension}`;
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const filePath = path.join(uploadsDir, safeName);

      await writeFile(filePath, validation.buffer);

      videoData = {
        videoNombre: sanitizeFileName(video.name),
        videoRuta: `/uploads/instructivos/${safeName}`,
        videoTipo: validation.mime,
        videoSize: video.size,
      };
    }

    let imagenData: {
      imagenNombre?: string;
      imagenRuta?: string;
      imagenTipo?: string;
      imagenSize?: number;
    } = {};

    if (imagen && imagen.size > 0) {
      const validation = await validateAndReadUpload({
        file: imagen,
        allowedMimeTypes: ALLOWED_IMAGE_TYPES,
        allowedExtensions: ALLOWED_IMAGE_EXT,
        maxSizeBytes: MAX_IMAGE_SIZE,
        label: "imagen",
      });
      if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

      const imgDir = path.join(process.cwd(), "uploads", "instructivos");
      await mkdir(imgDir, { recursive: true });

      const imgExt = `.${validation.extension}`;
      const imgSafeName = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${imgExt}`;
      const imgPath = path.join(imgDir, imgSafeName);

      await writeFile(imgPath, validation.buffer);

      imagenData = {
        imagenNombre: sanitizeFileName(imagen.name),
        imagenRuta: `/uploads/instructivos/${imgSafeName}`,
        imagenTipo: validation.mime,
        imagenSize: imagen.size,
      };
    }

    let pdfData: {
      pdfNombre?: string;
      pdfRuta?: string;
      pdfTipo?: string;
      pdfSize?: number;
    } = {};

    if (pdf && pdf.size > 0) {
      const validation = await validateAndReadUpload({
        file: pdf,
        allowedMimeTypes: ALLOWED_PDF_TYPES,
        allowedExtensions: ALLOWED_PDF_EXT,
        maxSizeBytes: MAX_PDF_SIZE,
        label: "PDF",
      });
      if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

      const pdfDir = path.join(process.cwd(), "uploads", "instructivos");
      await mkdir(pdfDir, { recursive: true });

      const pdfSafeName = `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
      const pdfPath = path.join(pdfDir, pdfSafeName);

      await writeFile(pdfPath, validation.buffer);

      pdfData = {
        pdfNombre: sanitizeFileName(pdf.name),
        pdfRuta: `/uploads/instructivos/${pdfSafeName}`,
        pdfTipo: validation.mime,
        pdfSize: pdf.size,
      };
    }

    const instructivo = await prisma.instructivo.create({
      data: {
        titulo,
        contenido,
        categoria,
        orden,
        creadoPorId: session.userId,
        videoUrl: youtubeUrl || null,
        ...videoData,
        ...imagenData,
        ...pdfData,
      },
      include: {
        creador: { select: { id: true, nombre: true } },
      },
    });

    return NextResponse.json(instructivo, { status: 201 });
  } catch (error) {
    console.error("Error creando instructivo:", error);
    return NextResponse.json({ error: "Error al crear instructivo" }, { status: 500 });
  }
}
