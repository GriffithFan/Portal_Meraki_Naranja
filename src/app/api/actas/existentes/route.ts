import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Tope por consulta: una carga masiva de más de 500 archivos no es un caso real. */
const MAX_NOMBRES = 500;

/**
 * Dice cuáles de estos nombres ya existen como acta.
 *
 * Existe para la carga masiva, que antes se descargaba la tabla entera —2486 actas,
 * cinco requests— nada más que para armar un mapa de nombres en el navegador y ver si
 * había repetidos. Ahora pregunta solo por los archivos que se están por subir.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: { nombres?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const nombres = Array.isArray(body.nombres)
    ? body.nombres.filter((n): n is string => typeof n === "string" && n.trim().length > 0)
        .map((n) => n.trim())
        .slice(0, MAX_NOMBRES)
    : [];
  if (!nombres.length) return NextResponse.json({ existentes: [] });

  // `nombre` no es único ni case-insensitive en la base, así que se compara en Node
  // sobre el resultado; la consulta igual va acotada a los nombres pedidos.
  const encontradas = await prisma.acta.findMany({
    where: { nombre: { in: nombres, mode: "insensitive" } },
    select: {
      id: true, nombre: true, archivoNombre: true, archivoSize: true,
      createdAt: true, version: true,
    },
  });

  return NextResponse.json({ existentes: encontradas });
}
