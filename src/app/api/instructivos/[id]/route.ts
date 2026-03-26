import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
];
const ALLOWED_VIDEO_EXT = /\.(mp4|webm|ogg)$/i;
const MAX_VIDEO_SIZE = 200 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
const ALLOWED_IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif)$/i;
const MAX_IMAGE_SIZE = 25 * 1024 * 1024;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const instructivo = await prisma.instructivo.findUnique({
    where: { id },
    include: {
      creador: { select: { id: true, nombre: true } },
    },
  });

  if (!instructivo) {
    return NextResponse.json({ error: "Instructivo no encontrado" }, { status: 404 });
  }

  return NextResponse.json(instructivo);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.instructivo.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Instructivo no encontrado" }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const titulo = (formData.get("titulo") as string)?.trim();
    const contenido = (formData.get("contenido") as string)?.trim() || null;
    const categoria = (formData.get("categoria") as string)?.trim() || existing.categoria;
    const orden = parseInt(formData.get("orden") as string) || existing.orden;
    const video = formData.get("video") as File | null;
    const imagen = formData.get("imagen") as File | null;
    const removeVideo = formData.get("removeVideo") === "true";
    const removeImagen = formData.get("removeImagen") === "true";
    const youtubeUrl = (formData.get("youtubeUrl") as string)?.trim() || null;

    if (!titulo) {
      return NextResponse.json({ error: "El título es requerido" }, { status: 400 });
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const updateData: any = {
      titulo,
      contenido,
      categoria,
      orden,
      videoUrl: youtubeUrl,
    };

    // Si se sube un nuevo video, eliminar el anterior
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

      // Eliminar video anterior si existe
      if (existing.videoRuta) {
        await deleteUploadFile(existing.videoRuta);
      }

      const uploadsDir = path.join(process.cwd(), "uploads", "instructivos");
      await mkdir(uploadsDir, { recursive: true });

      const ext = path.extname(video.name);
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const filePath = path.join(uploadsDir, safeName);

      const buffer = Buffer.from(await video.arrayBuffer());
      await writeFile(filePath, buffer);

      updateData.videoNombre = video.name;
      updateData.videoRuta = `/uploads/instructivos/${safeName}`;
      updateData.videoTipo = video.type || ext.replace(".", "");
      updateData.videoSize = video.size;
    } else if (removeVideo && existing.videoRuta) {
      // Si se solicita eliminar el video sin reemplazar
      await deleteUploadFile(existing.videoRuta);
      updateData.videoNombre = null;
      updateData.videoRuta = null;
      updateData.videoTipo = null;
      updateData.videoSize = null;
    }

    // Manejo de imagen
    if (imagen && imagen.size > 0) {
      if (!ALLOWED_IMAGE_TYPES.includes(imagen.type) || !imagen.name.match(ALLOWED_IMAGE_EXT)) {
        return NextResponse.json(
          { error: "Solo se permiten imágenes JPG, PNG, WebP o GIF" },
          { status: 400 }
        );
      }

      if (imagen.size > MAX_IMAGE_SIZE) {
        return NextResponse.json(
          { error: "La imagen no puede superar 25MB" },
          { status: 400 }
        );
      }

      if (existing.imagenRuta) {
        await deleteUploadFile(existing.imagenRuta);
      }

      const imgDir = path.join(process.cwd(), "uploads", "instructivos");
      await mkdir(imgDir, { recursive: true });

      const imgExt = path.extname(imagen.name);
      const imgSafeName = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${imgExt}`;
      const imgPath = path.join(imgDir, imgSafeName);

      const imgBuffer = Buffer.from(await imagen.arrayBuffer());
      await writeFile(imgPath, imgBuffer);

      updateData.imagenNombre = imagen.name;
      updateData.imagenRuta = `/uploads/instructivos/${imgSafeName}`;
      updateData.imagenTipo = imagen.type;
      updateData.imagenSize = imagen.size;
    } else if (removeImagen && existing.imagenRuta) {
      await deleteUploadFile(existing.imagenRuta);
      updateData.imagenNombre = null;
      updateData.imagenRuta = null;
      updateData.imagenTipo = null;
      updateData.imagenSize = null;
    }

    const instructivo = await prisma.instructivo.update({
      where: { id },
      data: updateData,
      include: {
        creador: { select: { id: true, nombre: true } },
      },
    });

    return NextResponse.json(instructivo);
  } catch (error) {
    console.error("Error actualizando instructivo:", error);
    return NextResponse.json({ error: "Error al actualizar instructivo" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.instructivo.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Instructivo no encontrado" }, { status: 404 });
  }

  // Guardar en papelera antes de eliminar
  const { registrarEnPapelera } = await import("@/lib/papelera");
  await registrarEnPapelera("INSTRUCTIVO", existing.titulo, existing as unknown as Record<string, unknown>, session.userId);

  // Eliminar video del filesystem
  if (existing.videoRuta) {
    await deleteUploadFile(existing.videoRuta);
  }

  // Eliminar imagen del filesystem
  if (existing.imagenRuta) {
    await deleteUploadFile(existing.imagenRuta);
  }

  await prisma.instructivo.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

async function deleteUploadFile(fileRuta: string) {
  try {
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    const filePath = path.resolve(process.cwd(), fileRuta);
    // Path traversal protection
    if (!filePath.startsWith(uploadsDir)) return;
    await unlink(filePath);
  } catch {
    // Si el archivo ya no existe, ignorar
  }
}
