import { prisma } from "@/lib/prisma";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Config de las REGIONES educativas de BA donde LAC-R = SI exige estar DENTRO de
 * la ventana del cronograma (no basta con "Activo"). Se guarda como una fila en
 * ConfiguracionVista (key-value genérico) para no requerir migración de schema.
 * Si no hay fila, aplica el DEFAULT {14, 15} — así la restricción rige aunque
 * nunca se haya guardado nada.
 */

const CLAVE = "lacr-regiones-estrictas";
export const REGIONES_ESTRICTAS_DEFAULT = [14, 15];

export async function obtenerRegionesEstrictas(): Promise<number[]> {
  try {
    const row = await prisma.configuracionVista.findUnique({ where: { clave: CLAVE } });
    const arr = (row?.config as any)?.regiones;
    if (Array.isArray(arr)) {
      const limpio = arr.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 25);
      // Solo se respeta lo guardado si es un array válido (puede ser [] = sin restricción).
      return Array.from(new Set(limpio)).sort((a, b) => a - b);
    }
  } catch { /* fallback al default */ }
  return [...REGIONES_ESTRICTAS_DEFAULT];
}

export async function guardarRegionesEstrictas(regiones: number[], userId?: string | null): Promise<number[]> {
  const limpio = Array.from(
    new Set((regiones || []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 25))
  ).sort((a, b) => a - b);
  await prisma.configuracionVista.upsert({
    where: { clave: CLAVE },
    create: { clave: CLAVE, config: { regiones: limpio } as any, updatedBy: userId ?? null },
    update: { config: { regiones: limpio } as any, updatedBy: userId ?? null },
  });
  return limpio;
}
