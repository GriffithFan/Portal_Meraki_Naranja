import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

function parseCounts(descripcion: string) {
  const created = Number(descripcion.match(/(\d+) creados/)?.[1] || 0);
  const updated = Number(descripcion.match(/(\d+) actualizados/)?.[1] || 0);
  return { created, updated };
}

export async function GET() {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const actividades = await prisma.actividad.findMany({
    where: {
      accion: "CREAR",
      entidadId: "bulk-import",
      entidad: { in: ["PREDIO", "EQUIPO"] },
      descripcion: { startsWith: "Importación masiva" },
    },
    include: {
      usuario: { select: { id: true, nombre: true, rol: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const imports = actividades.map((actividad) => {
    const metadata = (actividad.metadata || {}) as any;
    const parsed = parseCounts(actividad.descripcion || "");
    const created = Number(metadata.created ?? parsed.created ?? 0);
    const updated = Number(metadata.updated ?? parsed.updated ?? 0);
    const skipped = Number(metadata.skipped ?? 0);
    const total = Number(metadata.total ?? created + updated + skipped);
    const errors = Array.isArray(metadata.errors) ? metadata.errors : [];
    const duplicates = Array.isArray(metadata.duplicates) ? metadata.duplicates : [];

    return {
      id: actividad.id,
      tipo: actividad.entidad,
      descripcion: actividad.descripcion,
      created,
      updated,
      skipped,
      total,
      errors,
      duplicates,
      mappingsCount: Number(metadata.mappingsCount ?? 0),
      updateExisting: Boolean(metadata.updateExisting),
      espacioId: metadata.espacioId || null,
      usuario: actividad.usuario,
      createdAt: actividad.createdAt,
    };
  });

  const resumen = imports.reduce(
    (acc, item) => {
      acc.totalImportaciones += 1;
      acc.totalFilas += item.total;
      acc.totalCreados += item.created;
      acc.totalActualizados += item.updated;
      acc.totalOmitidos += item.skipped;
      acc.totalErrores += item.errors.length;
      return acc;
    },
    { totalImportaciones: 0, totalFilas: 0, totalCreados: 0, totalActualizados: 0, totalOmitidos: 0, totalErrores: 0 }
  );

  return NextResponse.json({ imports, resumen });
}
