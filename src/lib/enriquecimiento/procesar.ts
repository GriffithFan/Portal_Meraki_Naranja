import { parsearExcelExtractor, type ErrorExtraccion } from "./parseExcel";
import { cargarPrediosPorCodigo, resolverConformeEstadoId } from "./cargar";
import { planificarEnriquecimiento, type ResultadoPlan } from "./aplicar";
import { obtenerRegionesEstrictas } from "./regionesEstrictas";
import type { AlcanceSpec } from "./alcance";
import { coordenadasCompartidas } from "@/lib/gpsPredio";

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
): Promise<{ plan: ResultadoPlan; prediosPorCodigo: Awaited<ReturnType<typeof cargarPrediosPorCodigo>>; errores: ErrorExtraccion[] }> {
  const { filas, comentariosPorCodigo, errores } = parsearExcelExtractor(buffer);

  const idsSnapshot = pares.map((p) => p.predioId);
  const codigosSnapshot = new Set(pares.map((p) => String(p.codigo)));
  const prediosPorCodigo = await cargarPrediosPorCodigo(idsSnapshot);
  const conformeEstadoId = await resolverConformeEstadoId();
  // Coordenadas que comparten predios de localidades distintas: son relleno, no
  // ubicacion. Se pasan para que el enriquecimiento las trate como vacias y las pise.
  const coordsCompartidas = await coordenadasCompartidas();
  const regionesEstrictas = await obtenerRegionesEstrictas();

  // Solo filas cuyo predio está en el snapshot del job (respeta el alcance).
  const filasEnAlcance = filas.filter((f) => codigosSnapshot.has(String(f["Numero_Predio"] || "").trim()));

  const plan = planificarEnriquecimiento(filasEnAlcance, prediosPorCodigo, comentariosPorCodigo, {
    excluirConforme: alcance.excluirConforme !== false, // default seguro: excluir CONFORME
    excluirYaEnriquecidos: Boolean(alcance.excluirYaEnriquecidos),
    conformeEstadoId,
      coordsCompartidas,
    regionesEstrictas,
  });

  return { plan, prediosPorCodigo, errores };
}

/** Resumen serializable del plan (para la UI y para guardar en el job). */
export function resumenDePlan(plan: ResultadoPlan, errores: ErrorExtraccion[] = []) {
  return {
    prediosAActualizar: plan.cambios.length,
    detallePorCampo: plan.stats,
    conflictos: plan.conflictos,
    gpsOmitido: plan.gpsOmitido,
    lacRSi: plan.stats.lacRSi || 0,
    lacRNo: plan.stats.lacRNo || 0,
    // Errores/problemas a revisar: fallas de extracción + predios no verificados.
    erroresExtraccion: errores.slice(0, 100),
    sinVerificar: plan.sinVerificar.length,
    sinVerificarCodigos: plan.sinVerificar.slice(0, 100),
    salteadosConforme: plan.salteadosConforme.length,
    salteadosYaEnriquecidos: plan.salteadosYaEnriquecidos.length,
    sinMatch: plan.sinMatch.length,
    // NO CONFORME que Salesforce ya cerro: se listan para que un admin decida
    // (no se mueven solos). Ver aplicar.ts.
    noConformeCerrados: plan.noConformeCerrados,
  };
}
