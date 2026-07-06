import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { registrarError } from "@/lib/errorLog";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* Recibe errores capturados por el error boundary del front y los registra. */
export async function POST(request: Request) {
  const session = await getSession();
  // Aceptamos solo de usuarios autenticados (el boundary corre dentro del dashboard).
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: any = {};
  try { body = await request.json(); } catch { /* body vacío */ }

  await registrarError({
    nivel: "ERROR",
    origen: "CLIENTE",
    mensaje: String(body?.mensaje || "Error de cliente"),
    stack: body?.stack ? String(body.stack) : null,
    ruta: body?.ruta ? String(body.ruta) : null,
    userId: session.userId,
    userNombre: session.nombre,
    userAgent: request.headers.get("user-agent"),
    metadata: body?.digest ? { digest: String(body.digest) } : undefined,
  });

  return NextResponse.json({ ok: true });
}
