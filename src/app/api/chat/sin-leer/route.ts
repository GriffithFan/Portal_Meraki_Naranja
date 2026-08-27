import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * GET /api/chat/sin-leer — cuenta las conversaciones con actividad pendiente.
 *  - Técnico: las suyas con mensajes de Mesa que todavía no leyó.
 *  - Mesa / Admin / Moderador: las ABIERTAS sin tomar, más las que tienen mensajes
 *    del técnico sin responder.
 *
 * Lo llama el globo de Mesa de Ayuda, que está montado en todo el dashboard y consulta
 * en bucle. Antes traía TODAS las conversaciones con su último mensaje y las contaba en
 * JavaScript con un `.filter()`: cada usuario, cada pocos segundos, hacía que el servidor
 * leyera la tabla entera para devolver un número. Con 16 personas ya eran 1,3 millones de
 * recorridos completos sobre ChatConversacion.
 *
 * Ahora cuenta en la base y devuelve solo el número. El LATERAL con LIMIT 1 saca el
 * último mensaje de cada conversación usando el índice (conversacionId, createdAt) que ya
 * existe, en vez de recorrer ChatMensaje: es la forma que aguanta cuando el equipo crezca.
 *
 * Una conversación SIN mensajes nunca cuenta como pendiente — de ahí el JOIN (no LEFT).
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { esMesa: true, rol: true },
  });

  const esMesaOAdmin = user?.esMesa === true || user?.rol === "ADMIN" || user?.rol === "MODERADOR";

  // El orden de las condiciones replica el de la versión anterior: para Mesa, una
  // conversación ABIERTA sin agente cuenta SIEMPRE, aunque el último mensaje sea de Mesa.
  const condicion = esMesaOAdmin
    ? Prisma.sql`
        (c."estado" = 'ABIERTA' AND c."agenteId" IS NULL)
        OR (
          ult."esMesa" = false
          AND (c."leidoPorMesaAt" IS NULL OR ult."createdAt" > c."leidoPorMesaAt")
        )`
    : Prisma.sql`
        c."creadorId" = ${session.userId}
        AND ult."autorId" <> ${session.userId}
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

  return NextResponse.json({ count: Number(filas[0]?.n ?? 0) });
}
