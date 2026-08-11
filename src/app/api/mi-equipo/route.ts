import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * GET /api/mi-equipo — Devuelve el equipo del coordinador (sus técnicos) + él mismo,
 * para poblar el selector de asignación. Un usuario que no coordina a nadie recibe
 * solo su propio registro (el front no muestra el control en ese caso).
 *
 * `esCoordinador` en `self` permite al front decidir si habilita el control de asignar.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const equipo = await prisma.user.findMany({
    where: { coordinadorId: session.userId, activo: true },
    select: { id: true, nombre: true, thNumero: true },
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json({
    self: { id: session.userId, nombre: session.nombre, esCoordinador: Boolean(session.esCoordinador) },
    equipo,
  });
}
