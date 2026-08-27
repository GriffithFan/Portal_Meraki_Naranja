import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { suscribirChatGlobal } from "@/lib/chatBus";
import { contarSinLeer, esMesaOAdmin } from "@/lib/chatSinLeer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/chat/sin-leer/stream — empuja el contador de no leídos cuando algo cambia.
 *
 * Reemplaza al bucle: antes cada navegador preguntaba cada pocos segundos "¿hay algo
 * nuevo?", y la respuesta era "no" casi siempre. Eso escala con la CANTIDAD DE GENTE
 * conectada, no con el trabajo real — con 16 personas ya eran 1,3 millones de recorridos
 * sobre ChatConversacion, y a 100 sería seis veces eso para el mismo chat.
 *
 * Ahora el servidor avisa. Se manda el número al conectar y después solo cuando el bus
 * dice que el chat cambió, así el costo pasa a ser proporcional a los mensajes que se
 * escriben de verdad.
 *
 * Dos cuidados:
 *  - **Se agrupan los eventos.** Si entran cinco mensajes juntos no se recalcula cinco
 *    veces: se espera un momento y se cuenta una sola vez.
 *  - **Solo se manda si el número cambió.** Un mensaje en una conversación ajena mueve
 *    el bus pero no el contador de este usuario, y mandarlo igual sería tráfico al pedo.
 */

/** Ventana para juntar eventos seguidos antes de recontar. */
const AGRUPAR_MS = 400;

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("No autenticado", { status: 401 });

  const mesa = await esMesaOAdmin(session.userId);
  const encoder = new TextEncoder();
  let unsub: () => void = () => {};
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let agrupador: ReturnType<typeof setTimeout> | null = null;
  let ultimo = -1;
  let cerrado = false;

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (chunk: string) => {
        if (cerrado) return;
        try { controller.enqueue(encoder.encode(chunk)); } catch { cerrado = true; }
      };
      const send = (event: string, data: unknown) => enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      const recontarYMandar = async (forzar = false) => {
        if (cerrado) return;
        try {
          const n = await contarSinLeer(session.userId, mesa);
          if (forzar || n !== ultimo) {
            ultimo = n;
            send("contador", { count: n });
          }
        } catch { /* si falla una cuenta, el cliente sigue con el ultimo valor */ }
      };

      // Primer número apenas conecta: el cliente no tiene que pedirlo aparte.
      recontarYMandar(true);

      unsub = suscribirChatGlobal(() => {
        if (agrupador) return;
        agrupador = setTimeout(() => { agrupador = null; recontarYMandar(); }, AGRUPAR_MS);
      });

      // Heartbeat cada 25 s: mantiene viva la conexión a través de nginx.
      heartbeat = setInterval(() => enqueue(`: ping\n\n`), 25000);

      request.signal.addEventListener("abort", () => {
        cerrado = true;
        if (heartbeat) clearInterval(heartbeat);
        if (agrupador) clearTimeout(agrupador);
        unsub();
        try { controller.close(); } catch { /* ya cerrado */ }
      });
    },
    cancel() {
      cerrado = true;
      if (heartbeat) clearInterval(heartbeat);
      if (agrupador) clearTimeout(agrupador);
      unsub();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Le dice a nginx que NO bufferee el stream, sin tocar su configuración.
      "X-Accel-Buffering": "no",
    },
  });
}
