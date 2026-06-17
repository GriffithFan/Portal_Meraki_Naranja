import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { tieneAccesoFichas } from "@/lib/fichasAccess";

/* eslint-disable @typescript-eslint/no-explicit-any */

const BASE_COLS = [
  "Nombre", "DNI", "Dirección", "Teléfono", "Carnet", "Seguro", "Monotributo",
  "Auto - Modelo", "Auto - Patente", "Auto - Kmts", "Tarjeta en red", "Proyecto", "Notas generales",
];

function fichaToRow(f: any): Record<string, any> {
  const row: Record<string, any> = {
    "Nombre": f.nombre || "",
    "DNI": f.dni || "",
    "Dirección": f.direccion || "",
    "Teléfono": f.telefono || "",
    "Carnet": f.carnet || "",
    "Seguro": f.seguro || "",
    "Monotributo": f.monotributo || "",
    "Auto - Modelo": f.autoModelo || "",
    "Auto - Patente": f.autoPatente || "",
    "Auto - Kmts": f.autoKmts ?? "",
    "Tarjeta en red": f.autoTarjetaRed || "",
    "Proyecto": f.proyecto || "",
    "Notas generales": f.notasGenerales || "",
  };
  if (f.camposExtra && typeof f.camposExtra === "object" && !Array.isArray(f.camposExtra)) {
    for (const [k, v] of Object.entries(f.camposExtra)) row[k] = typeof v === "string" ? v : String(v ?? "");
  }
  return row;
}

/** Encabezados: base + claves de campos personalizados (unión), en orden estable. */
function headersFor(rows: Record<string, any>[]): string[] {
  const extra = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) if (!BASE_COLS.includes(k)) extra.add(k);
  return [...BASE_COLS, ...Array.from(extra).sort((a, b) => a.localeCompare(b, "es"))];
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!tieneAccesoFichas(session.email)) return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });

  const formato = request.nextUrl.searchParams.get("formato") === "csv" ? "csv" : "xlsx";

  const fichas = await prisma.fichaPersonal.findMany({ orderBy: { nombre: "asc" } });
  const tecnicos = fichas.filter((f) => f.tipo !== "CONTRATISTA").map(fichaToRow);
  const contratistas = fichas.filter((f) => f.tipo === "CONTRATISTA").map(fichaToRow);

  const fecha = new Date().toISOString().slice(0, 10);

  if (formato === "csv") {
    // CSV es un único archivo (no tiene hojas): agregamos la columna "Tipo".
    const todos = fichas.map((f) => ({ Tipo: f.tipo === "CONTRATISTA" ? "Contratista" : "Técnico", ...fichaToRow(f) }));
    const headers = ["Tipo", ...headersFor(fichas.map(fichaToRow))];
    const ws = XLSX.utils.json_to_sheet(todos, { header: headers });
    const csv = XLSX.utils.sheet_to_csv(ws);
    // BOM para que Excel respete acentos al abrir el CSV.
    const body = "﻿" + csv;
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="personal-${fecha}.csv"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // XLSX con dos hojas: Técnicos y Contratistas.
  const wb = XLSX.utils.book_new();
  const wsT = XLSX.utils.json_to_sheet(tecnicos, { header: headersFor(tecnicos) });
  XLSX.utils.book_append_sheet(wb, wsT, "Técnicos");
  const wsC = XLSX.utils.json_to_sheet(contratistas, { header: headersFor(contratistas) });
  XLSX.utils.book_append_sheet(wb, wsC, "Contratistas");

  const buffer = new Uint8Array(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="personal-${fecha}.xlsx"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
