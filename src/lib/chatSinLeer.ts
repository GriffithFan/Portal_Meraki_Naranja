import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Cuenta las conversaciones con actividad pendiente para un usuario.
 *
 * Vive acá y no dentro de la ruta porque lo usan dos: el endpoint `/api/chat/sin-leer`
 * (la primera lectura y el fallback) y el stream que empuja el número cuando algo cambia.
 * Que hubiera dos copias de esta regla es la forma de que el badge y el stream terminen
 * mostrando números distintos.
 *
 * Se cuenta en la base y no trayendo las conversaciones a JavaScript: el
 * `CROSS JOIN LATERAL` con `LIMIT 1` saca el último mensaje de cada conversación por el
 * índice `(conversacionId, createdAt)`, en vez de recorrer ChatMensaje entera.
 *
 * Una conversación SIN mensajes nunca cuenta como pendiente — de ahí el JOIN, no LEFT.
 */
export async function contarSinLeer(userId: string, esMesaOAdmin: boolean): Promise<number> {
  // El orden importa: para Mesa, una conversación ABIERTA sin agente cuenta SIEMPRE,
  // aunque el último mensaje sea de Mesa.
  const condicion = esMesaOAdmin
    ? Prisma.sql`
        (c."estado" = 'ABIERTA' AND c."agenteId" IS NULL)
        OR (
          ult."esMesa" = false
          AND (c."leidoPorMesaAt" IS NULL OR ult."createdAt" > c."leidoPorMesaAt")
        )`
    : Prisma.sql`
        c."creadorId" = ${userId}
        AND ult."autorId" <> ${userId}
        AND (c."leidoPorCreadorAt" IS NULL OR ult."createdAt" > c."leidoPorCreadorAt")`;

  const filas = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS n
    FROM "ChatConversacion" c
    CROSS JOIN LATERAL (
      SELECT m."autorId", m."createdAt", u."esMesa"
      FROM "ChatMensaje" m
      JOIN "User" u ON u."id" = m."autorId"
      WHERE m."conversacionId" = c."id"
      ORDER BY m."createdAt" DESC
      LIMIT 1
    ) ult
    WHERE c."estado" IN ('ABIERTA', 'EN_CURSO')
      AND (${condicion})
  `);

  return Number(filas[0]?.n ?? 0);
}

/** ¿Este usuario ve la bandeja de Mesa (todas las conversaciones) o solo las suyas? */
export async function esMesaOAdmin(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { esMesa: true, rol: true } });
  return u?.esMesa === true || u?.rol === "ADMIN" || u?.rol === "MODERADOR";
}
