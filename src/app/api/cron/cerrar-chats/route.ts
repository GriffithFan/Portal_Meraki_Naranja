import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronAuth } from "@/lib/cronAuth";
import { enviarPushYBandeja } from "@/lib/pushNotifications";

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const ahora = new Date();
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";

  try {
    const conversaciones = await prisma.chatConversacion.findMany({
      where: { estado: { in: ["ABIERTA", "EN_CURSO"] } },
      select: { id: true, creadorId: true },
    });

    if (conversaciones.length === 0) {
      return NextResponse.json({ ok: true, cerradas: 0, message: "Sin chats abiertos" });
    }

    if (dryRun) {
      return NextResponse.json({ ok: true, dryRun: true, cerrarian: conversaciones.length, at: ahora.toISOString() });
    }

    const updated = await prisma.chatConversacion.updateMany({
      where: { id: { in: conversaciones.map((chat) => chat.id) } },
      data: { estado: "CERRADA", cerradoAt: ahora },
    });

    const destinatarios = new Map(conversaciones.map((chat) => [chat.creadorId, chat.id]));
    await Promise.allSettled(
      Array.from(destinatarios.entries()).map(([userId, chatId]) =>
        enviarPushYBandeja(userId, {
          tipo: "CHAT",
          titulo: "Consulta cerrada automáticamente",
          mensaje: "Mesa de Ayuda cerró las consultas abiertas por horario. Podés crear una nueva si lo necesitás.",
          enlace: "/dashboard/chat",
          entidad: "CHAT",
          entidadId: chatId,
          tag: `chat-auto-closed-${chatId}`,
        })
      )
    );

    console.log("[CRON Cerrar Chats]", { cerradas: updated.count, at: ahora.toISOString() });
    return NextResponse.json({ ok: true, cerradas: updated.count, at: ahora.toISOString() });
  } catch (error) {
    console.error("[CRON Cerrar Chats] Error:", error);
    return NextResponse.json({ error: "Error cerrando chats" }, { status: 500 });
  }
}