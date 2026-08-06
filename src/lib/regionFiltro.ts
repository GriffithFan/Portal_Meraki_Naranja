import { prisma } from "@/lib/prisma";
import { regionDePartido } from "@/lib/regionesBA";

/**
 * Helpers de filtrado por REGIÓN educativa de BA para las listas/exports de tareas.
 * La región sale del partido del predio (Predio.ciudad); acá se resuelven los
 * partidos REALES presentes en la BD para no depender de la ortografía del mapa.
 */

/** Parsea el query param `regiones` (coma-separado) a números válidos 1-25. */
export function parseRegionesParam(v: string | null): number[] {
  return (v || "")
    .split(",").map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 25);
}

/**
 * Partidos (valores de Predio.ciudad) de BA que caen en las regiones dadas.
 * Consulta las ciudades distintas de predios BA y las mapea con regionDePartido,
 * así el filtro matchea los datos reales aunque el mapa tenga variantes de nombre.
 */
export async function partidosDeRegiones(regiones: number[]): Promise<string[]> {
  if (!regiones.length) return [];
  const sel = new Set(regiones);
  const filas = await prisma.predio.findMany({
    where: { codigo: { startsWith: "6" } },
    select: { ciudad: true },
    distinct: ["ciudad"],
  });
  return filas
    .map((c) => c.ciudad)
    .filter((c): c is string => !!c && sel.has(regionDePartido(c) ?? -1));
}
