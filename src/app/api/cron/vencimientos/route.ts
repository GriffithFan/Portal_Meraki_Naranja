import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronAuth } from "@/lib/cronAuth";
import { enviarPushYBandeja } from "@/lib/pushNotifications";
import { analizarVencimientos } from "@/lib/vencimientos";

/* eslint-disable @typescript-eslint/no-explicit-any */

const LEONEL_EMAIL = "leonel@thnet.com";

/**
 * GET /api/cron/vencimientos
 *
 * Revisa los campos de vencimiento de las fichas de Personal (cualquier campo con
 * "vencimiento" en el nombre y una fecha próxima ≤30 días o pasada) y le avisa a
 * Leonel. Anti-spam: cada (ficha, campo, fecha, estado) alerta una sola vez.
 * Ejecutar 1 vez por día. Protegido por CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const leonel = await prisma.user.findFirst({ where: { email: LEONEL_EMAIL }, select: { id: true } });
    if (!leonel) {
      return NextResponse.json({ error: "Usuario Leonel no encontrado" }, { status: 404 });
    }

    const fichas = await prisma.fichaPersonal.findMany({ select: { id: true, nombre: true, secciones: true } });
    let avisados = 0;
    const detalle: string[] = [];

    for (const f of fichas) {
      const vencs = analizarVencimientos(f.secciones).filter((v) => v.estado !== "ok");
      for (const v of vencs) {
        const key = `${f.id}:${v.campoId}:${v.fechaISO}:${v.estado}`;
        // Dedupe: ¿ya se avisó exactamente esto?
        const ya = await prisma.notificacion.findFirst({
          where: { tipo: "VENCIMIENTO", entidad: "VENCIMIENTO", entidadId: key },
          select: { id: true },
        });
        if (ya) continue;

        const fechaTxt = new Date(v.fechaISO + "T00:00:00").toLocaleDateString("es-AR");
        const cuando = v.estado === "vencido"
          ? `venció el ${fechaTxt} (hace ${Math.abs(v.dias)} día${Math.abs(v.dias) === 1 ? "" : "s"})`
          : `vence el ${fechaTxt} (en ${v.dias} día${v.dias === 1 ? "" : "s"})`;

        await enviarPushYBandeja(leonel.id, {
          tipo: "VENCIMIENTO",
          titulo: v.estado === "vencido" ? "⚠️ Vencimiento vencido" : "Vencimiento próximo",
          mensaje: `${f.nombre}: "${v.label}" ${cuando}.`,
          enlace: "/dashboard/personal",
          entidad: "VENCIMIENTO",
          entidadId: key,
          tag: `venc-${f.id}-${v.campoId}`,
        });
        avisados++;
        detalle.push(`${f.nombre} · ${v.label} · ${v.estado}`);
      }
    }

    return NextResponse.json({ ok: true, fichas: fichas.length, avisados, detalle: detalle.slice(0, 50) });
  } catch (error) {
    console.error("[CRON Vencimientos] Error:", error);
    return NextResponse.json({ error: "Error al procesar vencimientos" }, { status: 500 });
  }
}
