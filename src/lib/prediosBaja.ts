import { prisma } from "@/lib/prisma";

/**
 * Bajas de predios: los que nos sacaron del contrato y NO deben volver a Carrot.
 *
 * El problema que resuelve: borrar el predio no alcanza. El 24/05/2026 se borraron
 * ~1150 registros y el 02/06 una importacion masiva volvio a crear 1080 —entre ellos
 * los 68 de Santa Fe que nos habian quitado— porque el archivo de origen seguia
 * trayendolos y nada en la base decia que estuvieran de baja. Ademas volvieron con id
 * NUEVO, asi que la papelera (que guarda el id viejo) no servia ni para detectarlo.
 *
 * Por eso la baja se registra por CODIGO, que es lo unico que sobrevive al borrado.
 */

/** Codigos dados de baja y todavia vigentes (no reactivados). */
export async function codigosDadosDeBaja(): Promise<Set<string>> {
  const filas = await prisma.predioBaja.findMany({
    where: { reactivadoEn: null },
    select: { codigo: true },
  });
  return new Set(filas.map((f) => f.codigo));
}

/**
 * Registra la baja de uno o varios predios. Idempotente: si el codigo ya estaba de
 * baja se actualiza el motivo y, si venia reactivado, se vuelve a poner de baja.
 */
export async function darDeBaja(
  predios: Array<{ codigo: string | null; nombre?: string | null }>,
  motivo: string,
  usuarioId: string
) {
  const conCodigo = predios.filter((p) => p.codigo && p.codigo.trim());
  let registrados = 0;
  for (const p of conCodigo) {
    const codigo = p.codigo!.trim();
    await prisma.predioBaja.upsert({
      where: { codigo },
      update: { motivo, reactivadoEn: null, reactivadoPorId: null },
      create: { codigo, nombre: p.nombre ?? null, motivo, creadoPorId: usuarioId },
    });
    registrados++;
  }
  return { registrados, sinCodigo: predios.length - conCodigo.length };
}

/** Levanta la baja para que el predio pueda volver a entrar por importacion. */
export async function reactivar(codigos: string[], usuarioId: string) {
  const r = await prisma.predioBaja.updateMany({
    where: { codigo: { in: codigos }, reactivadoEn: null },
    data: { reactivadoEn: new Date(), reactivadoPorId: usuarioId },
  });
  return r.count;
}
