import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronAuth } from "@/lib/cronAuth";
import { pausaFinDeSemana } from "@/lib/pausaFinDeSemana";
import { resolverPrediosAlcance, type AlcanceSpec } from "@/lib/enriquecimiento/alcance";
import { ejecutarExtraccion } from "@/lib/enriquecimiento/ejecutar";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Cron diario 6am (ART): enriquecimiento TOTAL de todos los predios NO CONFORME +
// resto del pipeline (todo menos CONFORME, que nunca se toca). Refresca LAC-R con
// la nueva norma (activo Y en fecha DESDE–HASTA), fechas de cronograma y cualquier
// dato faltante, para no quedar nunca desactualizado. Reusa la Fase 2 del extractor.
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  // Sábado y domingo no se enriquece: traería conformidades del fin de semana que
  // nadie revisó y quedarían contadas en el ranking y la facturación. El guard vive
  // en el código (y no solo en el crontab) para que sobreviva a un redeploy.
  const pausa = pausaFinDeSemana();
  if (pausa.pausado) {
    return NextResponse.json({ ok: true, skipped: "pausa de fin de semana", motivo: pausa.motivo, ahora: pausa.art });
  }

  try {
    const enCurso = await prisma.enriquecimientoJob.findFirst({ where: { estado: "EJECUTANDO" } });
    if (enCurso) {
      const edadMin = (Date.now() - enCurso.createdAt.getTime()) / 60000;
      if (edadMin < 60) {
        return NextResponse.json({ ok: true, skipped: "ya hay un enriquecimiento en curso" });
      }
      await prisma.enriquecimientoJob.update({
        where: { id: enCurso.id },
        data: { estado: "ERROR", resumen: { error: "Corrida interrumpida (probable reinicio del servidor)." } as any },
      });
    }

    // Alcance: TODO el pipeline (excluye CONFORME), sin excluir ya-enriquecidos
    // (el objetivo es refrescar a diario). Sin filtro de estado ni espacio.
    const alcance: AlcanceSpec = { excluirConforme: true, excluirYaEnriquecidos: false };

    const predios = await resolverPrediosAlcance(alcance);
    const conPar = predios.filter((p) => p.codigo && p.incidencia);
    if (conPar.length === 0) {
      return NextResponse.json({ ok: true, pares: 0, mensaje: "Sin predios con incidencia para enriquecer" });
    }

    const admin = await prisma.user.findFirst({ where: { rol: "ADMIN", activo: true }, select: { id: true } });
    if (!admin) return NextResponse.json({ ok: false, error: "No hay un admin para referenciar el job" }, { status: 500 });

    const paresSnapshot = conPar.map((p) => ({ predioId: p.id, codigo: p.codigo, incidencia: p.incidencia }));
    const job = await prisma.enriquecimientoJob.create({
      data: {
        estado: "EJECUTANDO",
        alcance: { ...alcance, origen: "cron-6am-total" } as any,
        paresSnapshot: paresSnapshot as any,
        resumen: { progreso: { fase: "En cola (cron total 6am)", hechos: 0, total: paresSnapshot.length } } as any,
        creadoPorId: admin.id,
      },
    });

    ejecutarExtraccion(job.id, conPar, alcance).catch((e) =>
      console.error("[cron enriquecer-total] runner no manejado:", (e as Error).message)
    );

    return NextResponse.json({ ok: true, jobId: job.id, pares: paresSnapshot.length });
  } catch (e) {
    console.error("[cron enriquecer-total] error:", (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
