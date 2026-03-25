import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// Incrementar límite para upload de videos
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
];
const ALLOWED_VIDEO_EXT = /\.(mp4|webm|ogg)$/i;
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB

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
      if (!ALLOWED_VIDEO_TYPES.includes(video.type) || !video.name.match(ALLOWED_VIDEO_EXT)) {
        return NextResponse.json(
          { error: "Solo se permiten videos MP4, WebM u OGG" },
          { status: 400 }
        );
      }

      if (video.size > MAX_VIDEO_SIZE) {
        return NextResponse.json(
          { error: "El video no puede superar 200MB" },
          { status: 400 }
        );
      }

      const uploadsDir = path.join(process.cwd(), "uploads", "instructivos");
      await mkdir(uploadsDir, { recursive: true });

      const ext = path.extname(video.name);
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const filePath = path.join(uploadsDir, safeName);

      const buffer = Buffer.from(await video.arrayBuffer());
      await writeFile(filePath, buffer);

      videoData = {
        videoNombre: video.name,
        videoRuta: `/uploads/instructivos/${safeName}`,
        videoTipo: video.type || ext.replace(".", ""),
        videoSize: video.size,
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
