import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { resolverPrediosAlcance, type AlcanceSpec } from "@/lib/enriquecimiento/alcance";

// POST /api/enriquecimiento/resolver-alcance — conteos del alcance (solo ADMIN, read-only)
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN")
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  let alcance: AlcanceSpec;
  try {
    alcance = (await request.json()) as AlcanceSpec;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Resolvemos el conjunto BASE (sin los toggles de exclusión) para poder mostrar
  // cuántos se saltarían por cada motivo.
  const base = await resolverPrediosAlcance({
    ...alcance,
    excluirConforme: false,
    excluirYaEnriquecidos: false,
  });

  const conforme = base.filter((p) => (p.estadoNombre || "").trim().toUpperCase() === "CONFORME");
  const yaEnriquecidos = base.filter((p) => p.yaEnriquecido);
  const sinIncidencia = base.filter((p) => !p.incidencia);

  // Efectivos = los que realmente se procesarían con los toggles actuales.
  const efectivos = base.filter((p) => {
    if (!p.incidencia) return false;
    if (alcance.excluirConforme && (p.estadoNombre || "").trim().toUpperCase() === "CONFORME") return false;
    if (alcance.excluirYaEnriquecidos && p.yaEnriquecido) return false;
    return true;
  });

  return NextResponse.json({
    prediosEnAlcance: base.length,
    conIncidencia: base.length - sinIncidencia.length,
    sinIncidencia: sinIncidencia.length,
    conforme: conforme.length,
    yaEnriquecidos: yaEnriquecidos.length,
    efectivos: efectivos.length,
  });
}
