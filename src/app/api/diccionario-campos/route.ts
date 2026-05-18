import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

type CountRow = { count: number };
type ValueRow = { valor: string | null; count: number };

const CORE_FIELDS = [
  { clave: "nombre", nombre: "Nombre / CUE", grupo: "Base", tipo: "text", origen: "Predio.nombre" },
  { clave: "codigo", nombre: "Codigo", grupo: "Base", tipo: "text", origen: "Predio.codigo" },
  { clave: "incidencias", nombre: "Incidencias", grupo: "Cronograma", tipo: "text", origen: "Predio.incidencias" },
  { clave: "cue", nombre: "CUE", grupo: "Cronograma", tipo: "text", origen: "Predio.cue" },
  { clave: "fechaDesde", nombre: "Fecha DESDE", grupo: "Cronograma", tipo: "date", origen: "Predio.fechaDesde" },
  { clave: "fechaHasta", nombre: "Fecha HASTA", grupo: "Cronograma", tipo: "date", origen: "Predio.fechaHasta" },
  { clave: "equipoAsignado", nombre: "Equipo / tecnico", grupo: "Cronograma", tipo: "text", origen: "Predio.equipoAsignado" },
  { clave: "provincia", nombre: "Provincia", grupo: "Cronograma", tipo: "text", origen: "Predio.provincia" },
  { clave: "cuePredio", nombre: "CUE predio", grupo: "Cronograma", tipo: "text", origen: "Predio.cuePredio" },
  { clave: "gpsPredio", nombre: "GPS predio", grupo: "Cronograma", tipo: "text", origen: "Predio.gpsPredio" },
  { clave: "tipoRed", nombre: "Tipo de red", grupo: "Cronograma", tipo: "text", origen: "Predio.tipoRed" },
  { clave: "codigoPostal", nombre: "Codigo postal", grupo: "Cronograma", tipo: "text", origen: "Predio.codigoPostal" },
  { clave: "telefono", nombre: "Telefono", grupo: "Cronograma", tipo: "text", origen: "Predio.telefono" },
  { clave: "lab", nombre: "LAB", grupo: "Cronograma", tipo: "text", origen: "Predio.lab" },
  { clave: "nombreInstitucion", nombre: "Nombre institucion", grupo: "Cronograma", tipo: "text", origen: "Predio.nombreInstitucion" },
  { clave: "correo", nombre: "Correo", grupo: "Cronograma", tipo: "text", origen: "Predio.correo" },
  { clave: "estado", nombre: "Estado", grupo: "Relacion", tipo: "select", origen: "EstadoConfig" },
  { clave: "espacio", nombre: "Espacio", grupo: "Relacion", tipo: "select", origen: "EspacioTrabajo" },
];

function toNumber(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return Number(value || 0);
}

async function usageForCustomField(clave: string) {
  const [countRows, valueRows] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::int AS count
      FROM "Predio"
      WHERE "camposExtra" ? ${clave}
        AND NULLIF(BTRIM("camposExtra" ->> ${clave}), '') IS NOT NULL
    `,
    prisma.$queryRaw<ValueRow[]>`
      SELECT value_rows.valor, COUNT(*)::int AS count
      FROM (
        SELECT LEFT("camposExtra" ->> ${clave}, 80) AS valor
        FROM "Predio"
        WHERE "camposExtra" ? ${clave}
          AND NULLIF(BTRIM("camposExtra" ->> ${clave}), '') IS NOT NULL
      ) AS value_rows
      GROUP BY value_rows.valor
      ORDER BY count DESC, valor ASC
      LIMIT 6
    `,
  ]);

  return {
    used: toNumber(countRows[0]?.count),
    topValues: valueRows.map((row) => ({ valor: row.valor || "-", count: toNumber(row.count) })),
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isModOrAdmin(session.rol)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const [totalPredios, customFields] = await Promise.all([
    prisma.predio.count(),
    prisma.campoPersonalizado.findMany({ orderBy: [{ activo: "desc" }, { orden: "asc" }, { nombre: "asc" }] }),
  ]);

  const enrichedCustomFields = await Promise.all(customFields.map(async (campo) => {
    const usage = await usageForCustomField(campo.clave);
    return {
      id: campo.id,
      clave: campo.clave,
      nombre: campo.nombre,
      tipo: campo.tipo,
      opciones: campo.opciones,
      ancho: campo.ancho,
      orden: campo.orden,
      activo: campo.activo,
      createdAt: campo.createdAt,
      origen: `camposExtra.${campo.clave}`,
      grupo: "Personalizado",
      used: usage.used,
      coverage: totalPredios > 0 ? Math.round((usage.used / totalPredios) * 100) : 0,
      topValues: usage.topValues,
    };
  }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    totalPredios,
    coreFields: CORE_FIELDS,
    customFields: enrichedCustomFields,
    resumen: {
      totalCamposBase: CORE_FIELDS.length,
      totalPersonalizados: customFields.length,
      activos: customFields.filter((campo) => campo.activo).length,
      conUso: enrichedCustomFields.filter((campo) => campo.used > 0).length,
    },
  }, { headers: { "Cache-Control": "private, max-age=60" } });
}
