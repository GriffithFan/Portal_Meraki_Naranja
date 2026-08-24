import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronAuth } from "@/lib/cronAuth";
import { pausaFinDeSemana } from "@/lib/pausaFinDeSemana";
import { resolverPrediosAlcance, type AlcanceSpec } from "@/lib/enriquecimiento/alcance";
import { ejecutarExtraccion } from "@/lib/enriquecimiento/ejecutar";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Cron diario (16hs): enriquece TODOS los predios NO CONFORME. Desde ~13hs nos
// avisan si un predio NO CONFORME ya tiene cronograma nuevo y activo; el
// enriquecimiento actualiza LAC-R (No→Si) y la fecha del cronograma sin que
// nadie tenga que hacerlo a mano. Reusa la misma Fase 2 que "Enriquecer ahora".
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
    // Una sola corrida a la vez (comparte la sesión de Chrome del extractor).
    const enCurso = await prisma.enriquecimientoJob.findFirst({ where: { estado: "EJECUTANDO" } });
    if (enCurso) {
      const edadMin = (Date.now() - enCurso.createdAt.getTime()) / 60000;
      if (edadMin < 30) {
        return NextResponse.json({ ok: true, skipped: "ya hay un enriquecimiento en curso" });
      }
      await prisma.enriquecimientoJob.update({
        where: { id: enCurso.id },
        data: { estado: "ERROR", resumen: { error: "Corrida interrumpida (probable reinicio del servidor)." } as any },
      });
    }

    // Estado(s) NO CONFORME (por nombre, robusto ante id).
    const estadosNC = await prisma.estadoConfig.findMany({
      where: { nombre: { equals: "NO CONFORME", mode: "insensitive" } },
      select: { id: true },
    });
    if (estadosNC.length === 0) {
      return NextResponse.json({ ok: false, error: "No existe el estado NO CONFORME" }, { status: 500 });
    }

    // Alcance: todos los NO CONFORME, SIN excluir ya-enriquecidos (queremos re-chequear
    // a diario si apareció un cronograma nuevo).
    const alcance: AlcanceSpec = {
      filtros: { estados: estadosNC.map((e) => e.id) },
      excluirYaEnriquecidos: false,
      excluirConforme: false,
    };

    const predios = await resolverPrediosAlcance(alcance);
    const conPar = predios.filter((p) => p.codigo && p.incidencia);
    if (conPar.length === 0) {
      return NextResponse.json({ ok: true, pares: 0, mensaje: "Sin predios NO CONFORME con incidencia" });
    }

    // Job automático: sin creador humano → se referencia un admin como responsable (FK obligatoria).
    const admin = await prisma.user.findFirst({ where: { rol: "ADMIN", activo: true }, select: { id: true } });
    if (!admin) {
      return NextResponse.json({ ok: false, error: "No hay un admin para referenciar el job" }, { status: 500 });
    }

    const paresSnapshot = conPar.map((p) => ({ predioId: p.id, codigo: p.codigo, incidencia: p.incidencia }));
    const job = await prisma.enriquecimientoJob.create({
      data: {
        estado: "EJECUTANDO",
        alcance: { ...alcance, origen: "cron-16hs-no-conforme" } as any,
        paresSnapshot: paresSnapshot as any,
        resumen: { progreso: { fase: "En cola (cron NO CONFORME)", hechos: 0, total: paresSnapshot.length } } as any,
        creadoPorId: admin.id,
      },
    });

    // Fire-and-forget: el runner scrapea + aplica en background.
    ejecutarExtraccion(job.id, conPar, alcance).catch((e) =>
      console.error("[cron enriquecer-no-conforme] runner no manejado:", (e as Error).message)
    );

    return NextResponse.json({ ok: true, jobId: job.id, pares: paresSnapshot.length });
  } catch (e) {
    console.error("[cron enriquecer-no-conforme] error:", (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
