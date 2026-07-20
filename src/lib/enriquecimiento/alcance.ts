import { prisma } from "@/lib/prisma";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Especificación del alcance a enriquecer, elegido en la UI.
export interface AlcanceSpec {
  espacioId?: string | null;
  incluyeSubcarpetas?: boolean;
  filtros?: {
    estados?: string[]; // estadoId[]
    provincia?: string;
    ciudad?: string;
    tecnicoId?: string;
  };
  excluirYaEnriquecidos?: boolean;
  excluirConforme?: boolean;
}

export interface PredioAlcance {
  id: string;
  codigo: string | null;
  incidencia: string | null;
  estadoNombre: string | null;
  yaEnriquecido: boolean;
  // Snapshot de campos de origen para el Excel de entrada (fallbacks del extractor).
  ciudad: string | null;
  fechaDesde: Date | null;
  fechaHasta: Date | null;
  asignados: string;
}

/**
 * Devuelve el id del espacio y, si corresponde, el de todas sus subcarpetas
 * (recursivo por parentId). Sin espacioId devuelve [] (= todos los espacios).
 */
export async function resolverEspacioIds(
  espacioId: string | null | undefined,
  incluyeSubcarpetas: boolean | undefined
): Promise<string[] | null> {
  if (!espacioId) return null; // null = sin filtro de espacio (todos)
  if (!incluyeSubcarpetas) return [espacioId];

  const todos = await prisma.espacioTrabajo.findMany({ select: { id: true, parentId: true } });
  const hijosPorPadre = new Map<string, string[]>();
  for (const e of todos) {
    if (!e.parentId) continue;
    const arr = hijosPorPadre.get(e.parentId) || [];
    arr.push(e.id);
    hijosPorPadre.set(e.parentId, arr);
  }
  const resultado: string[] = [];
  const pila = [espacioId];
  const visto = new Set<string>();
  while (pila.length) {
    const actual = pila.pop()!;
    if (visto.has(actual)) continue;
    visto.add(actual);
    resultado.push(actual);
    for (const hijo of hijosPorPadre.get(actual) || []) pila.push(hijo);
  }
  return resultado;
}

/** Construye el `where` de Prisma para los predios del alcance. */
export async function construirWhere(alcance: AlcanceSpec): Promise<any> {
  const where: any = {};
  const espacioIds = await resolverEspacioIds(alcance.espacioId, alcance.incluyeSubcarpetas);
  if (espacioIds) where.espacioId = { in: espacioIds };

  const f = alcance.filtros || {};
  if (f.estados && f.estados.length > 0) where.estadoId = { in: f.estados };
  if (f.provincia) where.provincia = f.provincia;
  if (f.ciudad) where.ciudad = f.ciudad;
  if (f.tecnicoId) where.asignaciones = { some: { userId: f.tecnicoId } };

  // NOT anidado incluye a los predios con estado null (no matchean el nested).
  if (alcance.excluirConforme) where.NOT = { estado: { nombre: "CONFORME" } };
  if (alcance.excluirYaEnriquecidos) where.ultimoEnriquecimiento = null;

  return where;
}

/** Resuelve la lista de predios del alcance con los campos necesarios. */
export async function resolverPrediosAlcance(alcance: AlcanceSpec): Promise<PredioAlcance[]> {
  const where = await construirWhere(alcance);
  const predios = await prisma.predio.findMany({
    where,
    select: {
      id: true,
      codigo: true,
      incidencias: true,
      ciudad: true,
      fechaDesde: true,
      fechaHasta: true,
      ultimoEnriquecimiento: true,
      estado: { select: { nombre: true } },
      asignaciones: { select: { usuario: { select: { nombre: true } } } },
    },
    take: 20000,
  });

  return predios.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    incidencia: extraerIncidencia(p.incidencias),
    estadoNombre: p.estado?.nombre ?? null,
    yaEnriquecido: p.ultimoEnriquecimiento != null,
    ciudad: p.ciudad,
    fechaDesde: p.fechaDesde,
    fechaHasta: p.fechaHasta,
    asignados: p.asignaciones.map((a) => a.usuario?.nombre).filter(Boolean).join(", "),
  }));
}

/** Extrae el primer NI-... de un campo de incidencias (puede traer varios/ruido). */
export function extraerIncidencia(valor: string | null): string | null {
  if (!valor) return null;
  const m = valor.match(/NI-\d+/i);
  return m ? m[0].toUpperCase() : null;
}
