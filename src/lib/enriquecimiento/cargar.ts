import { prisma } from "@/lib/prisma";
import type { PredioActual } from "./aplicar";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Carga los predios actuales (por id) indexados por código, para el plan de apply. */
export async function cargarPrediosPorCodigo(predioIds: string[]): Promise<Map<string, PredioActual>> {
  const predios = await prisma.predio.findMany({
    where: { id: { in: predioIds } },
    select: {
      id: true, codigo: true, ciudad: true, direccion: true, cue: true, cuePredio: true,
      gpsPredio: true, latitud: true, longitud: true, telefono: true, lab: true,
      nombreInstitucion: true, ambito: true, provincia: true, fechaDesde: true, fechaHasta: true,
      lacR: true, notas: true, camposExtra: true, ultimoEnriquecimiento: true,
      estado: { select: { nombre: true } },
    },
  });
  const map = new Map<string, PredioActual>();
  for (const p of predios) {
    if (!p.codigo) continue;
    map.set(p.codigo, {
      id: p.id,
      codigo: p.codigo,
      estadoNombre: p.estado?.nombre ?? null,
      yaEnriquecido: p.ultimoEnriquecimiento != null,
      ciudad: p.ciudad,
      direccion: p.direccion,
      cue: p.cue,
      cuePredio: p.cuePredio,
      gpsPredio: p.gpsPredio,
      latitud: p.latitud,
      longitud: p.longitud,
      telefono: p.telefono,
      lab: p.lab,
      nombreInstitucion: p.nombreInstitucion,
      ambito: p.ambito,
      provincia: p.provincia,
      fechaDesde: p.fechaDesde,
      fechaHasta: p.fechaHasta,
      lacR: p.lacR,
      notas: p.notas,
      camposExtra: (p.camposExtra as Record<string, any> | null) ?? null,
    });
  }
  return map;
}
