import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIME: Record<string, string[]> = {
  image: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
  audio: ["audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "audio/mp4"],
  zip: ["application/zip", "application/x-zip-compressed"],
};

const ALL_ALLOWED = Object.values(ALLOWED_MIME).flat();

const SAFE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|mp4|mov|webm|mp3|ogg|wav|zip)$/i;

export const runtime = "nodejs";

/**
 * POST /api/chat/upload — Subir archivo adjunto a una conversación de chat
 * FormData: file, conversacionId, mensaje? (texto opcional)
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const conversacionId = formData.get("conversacionId") as string | null;
    const mensaje = (formData.get("mensaje") as string)?.trim() || "";

    if (!file) {
      return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
    }

    if (!conversacionId) {
      return NextResponse.json({ error: "conversacionId requerido" }, { status: 400 });
    }

    // Validar tipo MIME (ignorar parámetros como codecs=opus)
    const baseMime = file.type.split(";")[0].trim().toLowerCase();
    if (!ALL_ALLOWED.includes(baseMime)) {
      return NextResponse.json(
        { error: "Tipo de archivo no permitido. Permitidos: imágenes, video, audio, zip" },
        { status: 400 }
      );
    }

    // Validar extensión
    if (!file.name.match(SAFE_EXTENSIONS)) {
      return NextResponse.json({ error: "Extensión de archivo no permitida" }, { status: 400 });
    }

    // Validar tamaño
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "El archivo no puede superar 25MB" }, { status: 400 });
    }

    // Verificar que la conversación existe y el usuario tiene acceso
    const conversacion = await prisma.chatConversacion.findUnique({
      where: { id: conversacionId },
      select: { id: true, estado: true, creadorId: true, agenteId: true },
    });

    if (!conversacion) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }

    if (conversacion.estado === "CERRADA") {
      return NextResponse.json({ error: "Conversación cerrada" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { esMesa: true },
    });

    const esCreador = conversacion.creadorId === session.userId;
    const esAgente = conversacion.agenteId === session.userId;
    const esMesa = user?.esMesa === true;

    if (!esCreador && !esAgente && !esMesa) {
      return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    }

    // Guardar archivo
    const uploadsDir = path.join(process.cwd(), "uploads", "chat");
    await mkdir(uploadsDir, { recursive: true });

    const ext = path.extname(file.name).toLowerCase();
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const filePath = path.join(uploadsDir, safeName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Crear mensaje con archivo
    const nuevoMensaje = await prisma.chatMensaje.create({
      data: {
        contenido: mensaje || file.name,
        conversacionId,
        autorId: session.userId,
        archivoUrl: `uploads/chat/${safeName}`,
        archivoNombre: file.name.replace(/[^a-zA-Z0-9._\-() áéíóúñÁÉÍÓÚÑ]/g, "_").slice(0, 200),
        archivoTipo: file.type,
        archivoTamanio: file.size,
      },
      include: {
        autor: { select: { id: true, nombre: true, esMesa: true } },
      },
    });

    // Actualizar timestamp
    await prisma.chatConversacion.update({
      where: { id: conversacionId },
      data: { updatedAt: new Date() },
    });

    // Notificar
    const { enviarPushYBandeja } = await import("@/lib/pushNotifications");
    const remitente = esCreador ? session.nombre : "Mesa de Ayuda";
    const tipoArchivo = file.type.startsWith("image/")
      ? "📷 Imagen"
      : file.type.startsWith("video/")
      ? "🎬 Video"
      : file.type.startsWith("audio/")
      ? "🎙️ Audio"
      : "📎 Archivo";
    const pushPayload = {
      tipo: "CHAT",
      titulo: "Nuevo archivo en chat",
      mensaje: `${remitente}: ${tipoArchivo}`,
      enlace: "/dashboard/chat",
      entidad: "CHAT",
      entidadId: conversacionId,
      tag: `chat-${conversacionId}`,
    };

    if (esCreador && !conversacion.agenteId) {
      // Conversación ABIERTA sin agente — notificar a Mesa
      const usuariosMesa = await prisma.user.findMany({
        where: { esMesa: true, activo: true, id: { not: session.userId } },
        select: { id: true },
      });
      await Promise.allSettled(
        usuariosMesa.map((u) => enviarPushYBandeja(u.id, pushPayload))
      );
    } else {
      const destinatarioId = esCreador ? conversacion.agenteId : conversacion.creadorId;
      if (destinatarioId) {
        await enviarPushYBandeja(destinatarioId, pushPayload);
      }
    }

    return NextResponse.json(nuevoMensaje, { status: 201 });
  } catch (error) {
    console.error("[chat/upload] Error:", error);
    return NextResponse.json({ error: "Error al subir archivo" }, { status: 500 });
  }
}
