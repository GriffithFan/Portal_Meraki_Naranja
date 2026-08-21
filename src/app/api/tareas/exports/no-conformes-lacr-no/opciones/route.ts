import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Valores disponibles para el desplegable de descarga LAC-R NO: que tecnicos,
 * provincias, departamentos y carpetas hay REALMENTE dentro del espacio elegido.
 * Se calcula sobre los predios del espacio para no ofrecer opciones que no
 * filtrarian nada (el catalogo completo de tecnicos son 27 y la mayoria no tiene
 * predios ahi).
 */
function normalizeText(value?: string | null) {
  return (value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function collectDescendants(espacioId: string, espacios: { id: string; parentId: string | null }[]) {
  const byParent = new Map<string, string[]>();
  for (const espacio of espacios) {
    if (!espacio.parentId) continue;
    byParent.set(espacio.parentId, [...(byParent.get(espacio.parentId) || []), espacio.id]);
  }
  const ids = new Set<string>([espacioId]);
  const stack = [...(byParent.get(espacioId) || [])];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || ids.has(id)) continue;
    ids.add(id);
    stack.push(...(byParent.get(id) || []));
  }
  return Array.from(ids);
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.rol !== "ADMIN") return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  const espacioId = request.nextUrl.searchParams.get("espacioId") || "";
  const includeSubspaces = request.nextUrl.searchParams.get("includeSubspaces") === "true";
  if (!espacioId) return NextResponse.json({ error: "espacioId requerido" }, { status: 400 });

  const espacios = await prisma.espacioTrabajo.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, parentId: true },
  });
  const scoped = includeSubspaces ? collectDescendants(espacioId, espacios) : [espacioId];

  const predios = await prisma.predio.findMany({
    where: { espacioId: { in: scoped } },
    select: {
      provincia: true, ciudad: true, espacioId: true,
      asignaciones: {
        where: { tipo: { in: ["TAREA", "TECNICO"] } },
        select: { usuario: { select: { id: true, nombre: true } } },
      },
    },
  });

  // Se cuenta cuantos predios toca cada valor, para mostrarlo al lado de la opcion.
  const tecnicos = new Map<string, { id: string; nombre: string; total: number }>();
  const provincias = new Map<string, { valor: string; etiqueta: string; total: number }>();
  const ciudades = new Map<string, { valor: string; etiqueta: string; total: number }>();
  const carpetas = new Map<string, { id: string; nombre: string; total: number }>();
  const nombreEspacio = new Map(espacios.map((e) => [e.id, e.nombre]));

  for (const predio of predios) {
    for (const a of predio.asignaciones) {
      if (!a.usuario) continue;
      const prev = tecnicos.get(a.usuario.id);
      tecnicos.set(a.usuario.id, { id: a.usuario.id, nombre: a.usuario.nombre || "?", total: (prev?.total || 0) + 1 });
    }
    // Provincia y departamento se agrupan por su forma normalizada: en los datos
    // conviven "Entre Rios" y "ENTRE RIOS" y serian dos opciones distintas.
    if (predio.provincia) {
      const clave = normalizeText(predio.provincia);
      const prev = provincias.get(clave);
      provincias.set(clave, { valor: clave, etiqueta: prev?.etiqueta || predio.provincia, total: (prev?.total || 0) + 1 });
    }
    if (predio.ciudad) {
      const clave = normalizeText(predio.ciudad);
      const prev = ciudades.get(clave);
      ciudades.set(clave, { valor: clave, etiqueta: prev?.etiqueta || predio.ciudad, total: (prev?.total || 0) + 1 });
    }
    if (predio.espacioId) {
      const prev = carpetas.get(predio.espacioId);
      carpetas.set(predio.espacioId, {
        id: predio.espacioId,
        nombre: nombreEspacio.get(predio.espacioId) || "?",
        total: (prev?.total || 0) + 1,
      });
    }
  }

  const porTotal = <T extends { total: number }>(a: T, b: T) => b.total - a.total;
  return NextResponse.json({
    totalPredios: predios.length,
    tecnicos: Array.from(tecnicos.values()).sort(porTotal),
    provincias: Array.from(provincias.values()).sort(porTotal),
    ciudades: Array.from(ciudades.values()).sort(porTotal),
    carpetas: Array.from(carpetas.values()).sort(porTotal),
  });
}
