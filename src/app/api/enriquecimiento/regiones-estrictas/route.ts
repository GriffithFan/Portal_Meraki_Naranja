import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { obtenerRegionesEstrictas, guardarRegionesEstrictas } from "@/lib/enriquecimiento/regionesEstrictas";
import { REGIONES_BA, regionDePartido } from "@/lib/regionesBA";

export const dynamic = "force-dynamic";

// Conteo de predios de BA por región educativa (para mostrar el impacto en la UI).
async function conteosPorRegion(): Promise<Record<number, number>> {
  const grupos = await prisma.predio.groupBy({
    by: ["ciudad"],
    where: { codigo: { startsWith: "6" } },
    _count: { _all: true },
  });
  const out: Record<number, number> = {};
  for (const g of grupos) {
    const r = regionDePartido(g.ciudad);
    if (r != null) out[r] = (out[r] || 0) + g._count._all;
  }
  return out;
}

// GET — config actual + mapa de regiones + conteo de predios por región (solo ADMIN).
export async function GET() {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN")
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const [regiones, conteos] = await Promise.all([obtenerRegionesEstrictas(), conteosPorRegion()]);
  return NextResponse.json({ regiones, mapa: REGIONES_BA, conteos });
}

// POST — guardar la lista de regiones con LAC-R estricto por ventana (solo ADMIN).
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN")
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  let body: Record<string, unknown> = {};
  try { body = (await request.json()) as Record<string, unknown>; } catch { /* body vacío */ }
  const regiones = Array.isArray(body.regiones) ? (body.regiones as unknown[]).map(Number) : [];
  const guardadas = await guardarRegionesEstrictas(regiones, (session as { id?: string }).id ?? null);
  return NextResponse.json({ regiones: guardadas });
}
