import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/cron/cleanup
 *
 * Limpieza periódica de datos antiguos para mantener rendimiento con 50+ usuarios.
 * - Notificaciones leídas > 30 días → eliminadas
 * - Notificaciones no leídas > 90 días → eliminadas
 * - Actividad > 180 días → eliminada
 * - MonitoreoPostCambio completados > 30 días → eliminados
 *
 * Ejecutar diariamente a las 03:00.
 * Protegido por CRON_SECRET (Bearer token).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const now = new Date();
    const hace30dias = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const hace90dias = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const hace180dias = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    const [notifLeidas, notifAntiguas, actividadAntigua, monitoreosViejos] = await Promise.all([
      // Notificaciones leídas > 30 días
      prisma.notificacion.deleteMany({
        where: { leida: true, createdAt: { lt: hace30dias } },
      }),
      // Notificaciones no leídas > 90 días
      prisma.notificacion.deleteMany({
        where: { leida: false, createdAt: { lt: hace90dias } },
      }),
      // Actividad > 180 días
      prisma.actividad.deleteMany({
        where: { createdAt: { lt: hace180dias } },
      }),
      // Monitoreos completados > 30 días
      prisma.monitoreoPostCambio.deleteMany({
        where: { completado: true, createdAt: { lt: hace30dias } },
      }),
    ]);

    const resumen = {
      notificacionesLeidas: notifLeidas.count,
      notificacionesAntiguas: notifAntiguas.count,
      actividadAntigua: actividadAntigua.count,
      monitoreosViejos: monitoreosViejos.count,
      totalEliminados:
        notifLeidas.count + notifAntiguas.count + actividadAntigua.count + monitoreosViejos.count,
    };

    console.log("[CRON Cleanup]", resumen);

    return NextResponse.json({ ok: true, ...resumen });
  } catch (error) {
    console.error("[CRON Cleanup] Error:", error);
    return NextResponse.json({ error: "Error en limpieza" }, { status: 500 });
  }
}
