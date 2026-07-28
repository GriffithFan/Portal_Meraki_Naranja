import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronAuth } from "@/lib/cronAuth";
import { avisarAdminsFallo } from "@/lib/alertasAdmin";
import { readdir, stat, rm } from "fs/promises";
import path from "path";

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
 * Protegido por CRON_SECRET (Bearer token, timing-safe).
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

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

    // Cache de evidencias descomprimidas > 7 días (se re-genera al abrir el ZIP del chat).
    let cacheEvidenciasBorrados = 0;
    try {
      const cacheBase = path.resolve(process.cwd(), "uploads", "evidencias-cache");
      const hace7dias = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const dirs = await readdir(cacheBase, { withFileTypes: true }).catch(() => []);
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        const p = path.join(cacheBase, d.name);
        const s = await stat(p).catch(() => null);
        if (s && s.mtime < hace7dias) { await rm(p, { recursive: true, force: true }).catch(() => {}); cacheEvidenciasBorrados++; }
      }
    } catch { /* ignorar */ }

    const resumen = {
      notificacionesLeidas: notifLeidas.count,
      notificacionesAntiguas: notifAntiguas.count,
      actividadAntigua: actividadAntigua.count,
      monitoreosViejos: monitoreosViejos.count,
      cacheEvidenciasBorrados,
      totalEliminados:
        notifLeidas.count + notifAntiguas.count + actividadAntigua.count + monitoreosViejos.count,
    };

    console.log("[CRON Cleanup]", resumen);

    return NextResponse.json({ ok: true, ...resumen });
  } catch (error) {
    console.error("[CRON Cleanup] Error:", error);
    await avisarAdminsFallo({
      titulo: "Falló el cron de limpieza",
      mensaje: (error as Error)?.message?.slice(0, 300) || "Error en la limpieza periódica",
      enlace: "/dashboard",
      tag: "cron-cleanup",
    });
    return NextResponse.json({ error: "Error en limpieza" }, { status: 500 });
  }
}
