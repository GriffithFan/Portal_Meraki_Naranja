import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronAuth } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";

/** Días que se conservan de rastro. Pasado eso se borra. */
const DIAS_RETENCION = 30;

/**
 * Cron diario: borra el rastro de ubicación de más de 30 días.
 *
 * Dos motivos, los dos importantes. El legal: guardar la ubicación de una persona más
 * de lo que la operación necesita deja de ser proporcional. Y el práctico: son unas
 * 1.700 filas por día con 16 técnicos, y ya tuvimos un problema de disco en el VPS por
 * dejar que algo creciera sin límite.
 *
 * La retención vive acá y no solo en el crontab a propósito: el crontab no está en el
 * repo y se pierde si se reconstruye el servidor.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  try {
    const corte = new Date(Date.now() - DIAS_RETENCION * 24 * 60 * 60 * 1000);
    const { count } = await prisma.ubicacionTecnico.deleteMany({ where: { createdAt: { lt: corte } } });
    const quedan = await prisma.ubicacionTecnico.count();

    console.log(`[cron purgar-ubicaciones] borradas ${count} · quedan ${quedan} · corte ${corte.toISOString()}`);
    return NextResponse.json({ ok: true, borradas: count, quedan, corte: corte.toISOString(), diasRetencion: DIAS_RETENCION });
  } catch (e) {
    console.error("[cron purgar-ubicaciones] error:", (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
