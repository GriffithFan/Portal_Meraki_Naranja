import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/prisma";
import type { PlanCambio, PredioActual } from "./aplicar";
import type { PredioAlcance } from "./alcance";

/* eslint-disable @typescript-eslint/no-explicit-any */

const execFileAsync = promisify(execFile);

/** Backup best-effort de la base antes de escribir (no bloquea si falla / no existe). */
export async function backupBestEffort(): Promise<void> {
  try {
    await execFileAsync("bash", ["scripts/backup-production.sh"], {
      cwd: process.env.APP_DIR || "/var/www/carrot",
      env: { ...process.env, DB_ONLY: "1" },
      timeout: 90000,
    });
  } catch (e) {
    console.error("[enriquecimiento] backup best-effort falló (se continúa):", (e as Error).message);
  }
}

/**
 * Aplica un plan de cambios a la BD en una transacción, marcando cada predio con
 * la corrida (`ultimoEnriquecimiento`/`enriquecimientoJobId`) y devolviendo los
 * valores previos por predio para poder revertir. Compartido por el flujo manual
 * (Fase 1) y el automático (Fase 2). NO toca estado ni asignados.
 */
export async function aplicarCambiosEnDB(
  jobId: string,
  cambios: PlanCambio[],
  prediosPorCodigo: Map<string, PredioActual>
): Promise<{ aplicados: number; cambiosPrevios: Record<string, any> }> {
  const cambiosPrevios: Record<string, any> = {};
  const ahora = new Date();

  await prisma.$transaction(async (tx) => {
    for (const c of cambios) {
      const data: Record<string, any> = { ...c.upd };
      const previos: Record<string, any> = { ...c.cambiosPrevios };
      if (Object.keys(c.extra).length > 0) {
        const actual = prediosPorCodigo.get(c.codigo);
        const baseExtra = actual?.camposExtra && typeof actual.camposExtra === "object" ? actual.camposExtra : {};
        previos.camposExtra = actual?.camposExtra ?? null; // objeto completo para revertir
        data.camposExtra = { ...baseExtra, ...c.extra };
      }
      data.ultimoEnriquecimiento = ahora;
      data.enriquecimientoJobId = jobId;
      data.fechaActualizacion = ahora;
      cambiosPrevios[c.predioId] = previos;
      await tx.predio.update({ where: { id: c.predioId }, data });
    }
  }, { timeout: 180000 });

  return { aplicados: cambios.length, cambiosPrevios };
}

/** Filas del Excel de entrada (Predio + Incidencia + contexto Origen_*). */
export function filasEntradaDesdePredios(predios: PredioAlcance[]) {
  const fechaAR = (d: Date | null) =>
    d ? `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}` : "";
  return predios
    .filter((p) => p.codigo && p.incidencia)
    .map((p) => ({
      Predio: p.codigo,
      Incidencia: p.incidencia,
      Origen_Departamento: p.ciudad || "",
      Origen_DESDE: fechaAR(p.fechaDesde),
      Origen_HASTA: fechaAR(p.fechaHasta),
      Origen_Asignados: p.asignados || "",
    }));
}
