import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * Verifica la autenticación Bearer para endpoints CRON.
 * Usa timingSafeEqual para prevenir timing attacks.
 * Retorna null si la auth es válida, o un NextResponse con error.
 */
export function verifyCronAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const provided = authHeader.slice(7);

  // Comparación en tiempo constante para prevenir timing attacks
  try {
    const a = Buffer.from(cronSecret, "utf-8");
    const b = Buffer.from(provided, "utf-8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return null; // Auth válida
}
