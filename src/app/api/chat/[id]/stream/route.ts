import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { suscribirChat } from "@/lib/chatBus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// SSE: notifica en tiempo real los cambios de una conversación. El cliente, al
// recibir un evento, hace su fetch incremental (?since=) habitual — así el SSE
// es puramente aditivo y el polling sigue como fallback si el stream se corta.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("No autenticado", { status: 401 });

  const { id } = await params;

  // Mismo criterio de acceso que GET /api/chat/[id].
  const [user, conversacion] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId }, select: { esMesa: true } }),
    prisma.chatConversacion.findUnique({ where: { id }, select: { creadorId: true, agenteId: true } }),
  ]);
  if (!conversacion) return new Response("Conversación no encontrada", { status: 404 });
  const puedeVer =
    conversacion.creadorId === session.userId ||
    conversacion.agenteId === session.userId ||
    user?.esMesa === true ||
    session.rol === "ADMIN" ||
    session.rol === "MODERADOR";
  if (!puedeVer) return new Response("Sin acceso", { status: 403 });

  const encoder = new TextEncoder();
  let unsub: () => void = () => {};
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (chunk: string) => {
        try { controller.enqueue(encoder.encode(chunk)); } catch { /* stream cerrado */ }
      };
      const send = (event: string, data: unknown) => enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      send("ready", { ok: true });

      unsub = suscribirChat(id, (data) => send("cambio", data));

      // Heartbeat cada 25s para mantener viva la conexión a través de nginx.
      heartbeat = setInterval(() => enqueue(`: ping\n\n`), 25000);

      // Cerrar limpio cuando el cliente aborta (cierra el EventSource / navega).
      request.signal.addEventListener("abort", () => {
        if (heartbeat) clearInterval(heartbeat);
        unsub();
        try { controller.close(); } catch { /* ya cerrado */ }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsub();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Clave: le dice a nginx que NO bufferee el stream (sin tocar la config de nginx).
      "X-Accel-Buffering": "no",
    },
  });
}
