import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * Registra un elemento en la papelera antes de eliminarlo.
 */
export async function registrarEnPapelera(
  tipo: string,
  nombre: string,
  datos: Record<string, unknown>,
  eliminadoPorId: string
) {
  await prisma.papeleraItem.create({
    data: { tipo, nombre, datos: datos as Prisma.InputJsonValue, eliminadoPorId },
  });
}
