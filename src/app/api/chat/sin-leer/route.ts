import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { contarSinLeer, esMesaOAdmin } from "@/lib/chatSinLeer";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/sin-leer — cuenta las conversaciones con actividad pendiente.
 *  - Técnico: las suyas con mensajes de Mesa que todavía no leyó.
 *  - Mesa / Admin / Moderador: las ABIERTAS sin tomar, más las que tienen mensajes
 *    del técnico sin responder.
 *
 * La regla vive en lib/chatSinLeer para que esta ruta y el stream que empuja el número
 * cuenten exactamente lo mismo.
 *
 * Sigue existiendo aunque haya stream: es la primera lectura y el respaldo para cuando
 * el navegador no soporta EventSource o la conexión se corta.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const mesa = await esMesaOAdmin(session.userId);
  const count = await contarSinLeer(session.userId, mesa);

  return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
}
