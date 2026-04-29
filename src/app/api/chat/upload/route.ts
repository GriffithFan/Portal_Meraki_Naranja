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
    const files = formData.getAll("file").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const conversacionId = formData.get("conversacionId") as string | null;
    const mensaje = (formData.get("mensaje") as string)?.trim() || "";

    if (files.length === 0) {
      return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
    }

    if (files.length > 10) {
      return NextResponse.json({ error: "Máximo 10 archivos por envío" }, { status: 400 });
    }

    if (!conversacionId) {
      return NextResponse.json({ error: "conversacionId requerido" }, { status: 400 });
    }

    for (const file of files) {
      const baseMime = file.type.split(";")[0].trim().toLowerCase();
      if (!ALL_ALLOWED.includes(baseMime)) {
        return NextResponse.json(
          { error: `Tipo de archivo no permitido: ${file.name}` },
          { status: 400 }
        );
      }
      if (!file.name.match(SAFE_EXTENSIONS)) {
        return NextResponse.json({ error: `Extensión de archivo no permitida: ${file.name}` }, { status: 400 });
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `${file.name} supera 25MB` }, { status: 400 });
      }
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

    const uploadsDir = path.join(process.cwd(), "uploads", "chat");
    await mkdir(uploadsDir, { recursive: true });

    const mensajesCreados = [];
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const ext = path.extname(file.name).toLowerCase();
      const safeName = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const filePath = path.join(uploadsDir, safeName);
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);

      const nuevoMensaje = await prisma.chatMensaje.create({
        data: {
          contenido: mensaje && files.length === 1 ? mensaje : file.name,
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
      mensajesCreados.push(nuevoMensaje);
    }

    // Actualizar timestamp
    await prisma.chatConversacion.update({
      where: { id: conversacionId },
      data: { updatedAt: new Date() },
    });

    // Notificar (fire-and-forget: no debe bloquear la respuesta)
    import("@/lib/pushNotifications").then(async ({ enviarPushYBandeja }) => {
      try {
        const remitente = esCreador ? session.nombre : "Mesa de Ayuda";
        const tipoArchivo = files.length > 1
          ? `📎 ${files.length} archivos`
          : files[0].type.startsWith("image/")
          ? "📷 Imagen"
          : files[0].type.startsWith("video/")
          ? "🎬 Video"
          : files[0].type.startsWith("audio/")
          ? "🎙️ Audio"
          : "📎 Archivo";
        const pushPayload = {
          tipo: "CHAT",
          titulo: "Nuevo archivo en chat",
          mensaje: `${remitente}: ${tipoArchivo}`,
          enlace: "/dashboard/chat",
          entidad: "CHAT",
          entidadId: conversacionId,
          tag: `chat-msg-${conversacionId}-${Date.now()}`,
        };

        if (esCreador && !conversacion.agenteId) {
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
      } catch (e) {
        console.error("[Chat/Upload] Error enviando notificación push:", e);
      }
    });

    return NextResponse.json(files.length === 1 ? mensajesCreados[0] : { mensajes: mensajesCreados }, { status: 201 });
  } catch (error) {
    console.error("[chat/upload] Error:", error);
    return NextResponse.json({ error: "Error al subir archivo" }, { status: 500 });
  }
}
