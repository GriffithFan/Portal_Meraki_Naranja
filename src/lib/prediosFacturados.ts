import { prisma } from "@/lib/prisma";

/**
 * Predios que ya se facturaron, para no contarlos dos veces.
 *
 * El problema que resuelve: si un predio YA FACTURADO vuelve a CONFORME —porque
 * alguien lo pasa a INSTALADO y lo devuelve a CONFORME— se genera una transicion
 * nueva y el ranking y el indicador lo cuentan otra vez, en una semana en la que
 * nadie lo trabajo. Paso el 21/08/2026 con dos predios ya facturados la semana
 * anterior.
 *
 * La regla: un predio que ya entro en un reporte de facturacion de una semana
 * ANTERIOR no vuelve a sumar. Si se re-conforma dentro de la misma semana en que se
 * facturo, o antes de facturarse, sigue contando normal — ahi no hay duplicacion.
 */

/** Los ids de predio que trae el `resumen` de un reporte (ver lib/facturacion.ts). */
function idsDelResumen(resumen: unknown): string[] {
  if (!Array.isArray(resumen)) return [];
  const ids: string[] = [];
  for (const grupo of resumen as Array<{ tareas?: Array<{ id?: string }> }>) {
    for (const t of grupo?.tareas ?? []) if (t?.id) ids.push(t.id);
  }
  return ids;
}

/**
 * Mapa `predioId -> fecha de corte del reporte mas VIEJO que lo facturo`.
 *
 * Con la fecha se decide por evento: una transicion a CONFORME posterior a esa fecha
 * es una re-conformidad y no suma; una anterior o de la misma semana, si.
 */
export async function prediosFacturadosHasta(): Promise<Map<string, Date>> {
  const reportes = await prisma.reporteFacturacion.findMany({
    select: { fechaHasta: true, resumen: true },
    orderBy: { fechaHasta: "asc" },
  });
  const mapa = new Map<string, Date>();
  for (const r of reportes) {
    for (const id of idsDelResumen(r.resumen)) {
      // Se queda con el primero: si se facturo dos veces, manda la vez mas vieja.
      if (!mapa.has(id)) mapa.set(id, r.fechaHasta);
    }
  }
  return mapa;
}

/**
 * true si este evento de conformidad es una REPETICION de algo ya facturado y por lo
 * tanto no debe contarse.
 *
 * Se compara contra el cierre del reporte que lo facturo: se descuenta solo lo que
 * ocurrio DESPUES de esa facturacion.
 */
export function yaFueFacturado(
  facturados: Map<string, Date>,
  predioId: string,
  fechaDelEvento: Date
): boolean {
  const cierre = facturados.get(predioId);
  return cierre != null && fechaDelEvento > cierre;
}

/**
 * Saca de un lote de predios los que YA entraron en un reporte de facturacion previo.
 *
 * Es la misma regla que `yaFueFacturado`, pero para el reporte de facturacion: si un
 * predio ya facturado vuelve a CONFORME (alguien lo mueve de estado, o el
 * enriquecimiento lo re-confirma), su `fechaActualizacion` se corre y volveria a caer
 * dentro del periodo del reporte siguiente. Se cobraria dos veces el mismo trabajo.
 *
 * Devuelve tambien los excluidos para poder dejarlos en el log: que un predio no se
 * facture no puede pasar en silencio.
 */
export async function quitarYaFacturados<T extends { id: string; fechaActualizacion: Date | null }>(
  predios: T[]
): Promise<{ incluidos: T[]; excluidos: T[] }> {
  const facturados = await prediosFacturadosHasta();
  const incluidos: T[] = [];
  const excluidos: T[] = [];
  for (const p of predios) {
    const fecha = p.fechaActualizacion;
    if (fecha && yaFueFacturado(facturados, p.id, fecha)) excluidos.push(p);
    else incluidos.push(p);
  }
  return { incluidos, excluidos };
}
