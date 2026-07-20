import { parsearExcelExtractor } from "./parseExcel";
import { cargarPrediosPorCodigo } from "./cargar";
import { planificarEnriquecimiento, type ResultadoPlan } from "./aplicar";
import type { AlcanceSpec } from "./alcance";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ParSnapshot { predioId: string; codigo: string; incidencia: string }

/**
 * Parsea el Excel subido, carga los predios del snapshot del job y arma el plan.
 * Compartido por previsualizar (dry-run) y aplicar. El match se hace contra el
 * snapshot del job, no contra toda la BD, para no salirse del alcance elegido.
 */
export async function procesarSubida(
  buffer: Buffer,
  pares: ParSnapshot[],
  alcance: AlcanceSpec
): Promise<{ plan: ResultadoPlan; prediosPorCodigo: Awaited<ReturnType<typeof cargarPrediosPorCodigo>> }> {
  const { filas, comentariosPorCodigo } = parsearExcelExtractor(buffer);

  const idsSnapshot = pares.map((p) => p.predioId);
  const codigosSnapshot = new Set(pares.map((p) => String(p.codigo)));
  const prediosPorCodigo = await cargarPrediosPorCodigo(idsSnapshot);

  // Solo filas cuyo predio está en el snapshot del job (respeta el alcance).
  const filasEnAlcance = filas.filter((f) => codigosSnapshot.has(String(f["Numero_Predio"] || "").trim()));

  const plan = planificarEnriquecimiento(filasEnAlcance, prediosPorCodigo, comentariosPorCodigo, {
    excluirConforme: alcance.excluirConforme !== false, // default seguro: excluir CONFORME
    excluirYaEnriquecidos: Boolean(alcance.excluirYaEnriquecidos),
  });

  return { plan, prediosPorCodigo };
}

/** Resumen serializable del plan (para la UI y para guardar en el job). */
export function resumenDePlan(plan: ResultadoPlan) {
  return {
    prediosAActualizar: plan.cambios.length,
    detallePorCampo: plan.stats,
    conflictos: plan.conflictos,
    gpsOmitido: plan.gpsOmitido,
    sinVerificar: plan.sinVerificar.length,
    salteadosConforme: plan.salteadosConforme.length,
    salteadosYaEnriquecidos: plan.salteadosYaEnriquecidos.length,
    sinMatch: plan.sinMatch.length,
  };
}
