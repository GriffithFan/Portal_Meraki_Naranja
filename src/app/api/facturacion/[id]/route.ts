import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { unlink } from "fs/promises";
import path from "path";
import * as XLSX from "xlsx";
import { CAMPOS_TECNICO, mostrarValorCampo, normalizarCampoTecnico } from "@/lib/camposPredio";
import { totalesCamposTecnico } from "@/lib/facturacion";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ResumenTarea {
  id: string;
  nombre: string;
  codigo: string | null;
  provincia: string | null;
  incidencia?: string | null;
  fecha?: string | null;
  /** Forma nueva: los campos del técnico juntos, por clave. */
  campos?: Record<string, string>;
  /** Forma vieja, en los reportes ya emitidos. Se sigue leyendo. */
  mas20Ap?: boolean;
  recablear?: string;
  apReinstalados?: string;
}
interface ResumenGrupo {
  tecnicoId: string;
  tecnicoNombre: string;
  cantidad: number;
  tareas: ResumenTarea[];
}

const fmtFecha = (fecha?: string | null) =>
  fecha ? new Date(fecha).toLocaleDateString("es-AR") : "";

/**
 * GET /api/facturacion/[id] — Descargar CSV o XLSX del reporte (solo ADMIN)
 * Query: ?format=xlsx para Excel, por defecto CSV
 *
 * El archivo se REGENERA al vuelo desde el `resumen` guardado en la base
 * (que usa el código/número de predio en la primera columna). Así se evita
 * servir archivos viejos en disco que pudieran tener un formato anterior
 * (p. ej. el nombre de la institución en vez del número de predio).
 *
 * Las columnas del técnico salen de CAMPOS_TECNICO, igual que en lib/facturacion.ts.
 * Antes estaban escritas a mano acá y se quedaron viejas: `recablear` se cargaba, se
 * veía en pantalla y se guardaba, pero nunca salía en el archivo descargado, que es lo
 * único que ve quien liquida.
 *
 * Los reportes ya emitidos guardan los campos sueltos (`recablear`, `mas20Ap`); los
 * nuevos los guardan juntos en `campos`. Se leen las dos formas para que un reporte
 * viejo se siga descargando igual.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "csv";

  const reporte = await prisma.reporteFacturacion.findUnique({ where: { id } });
  if (!reporte) {
    return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });
  }

  const resumen = (Array.isArray(reporte.resumen) ? reporte.resumen : []) as unknown as ResumenGrupo[];
  const totalTareas = reporte.totalTareas;
  const baseName = reporte.csvNombre?.replace(".csv", "") || `reporte-${reporte.semana}`;

  // Aplanar filas en el mismo orden que el resumen (agrupado por técnico)
  /** Los campos del técnico de una tarea, en la forma nueva o en la vieja. */
  const camposDe = (t: ResumenTarea): Record<string, string> => {
    const legado: Record<string, unknown> = {
      tieneMas20Ap: t.mas20Ap === true ? "SI" : "",
      recablear: t.recablear,
      apReinstalados: t.apReinstalados,
    };
    const out: Record<string, string> = {};
    for (const def of CAMPOS_TECNICO) {
      const bruto = t.campos?.[def.clave] ?? legado[def.clave];
      out[def.clave] = String(normalizarCampoTecnico(def.clave, bruto) ?? "");
    }
    return out;
  };

  const filas: { predio: string; incidencia: string; tecnico: string; fecha: string; provincia: string; campos: Record<string, string> }[] = [];
  for (const grupo of resumen) {
    for (const t of grupo.tareas || []) {
      filas.push({
        predio: t.codigo || "",
        incidencia: t.incidencia || "",
        tecnico: grupo.tecnicoNombre,
        fecha: fmtFecha(t.fecha),
        provincia: t.provincia || "",
        campos: camposDe(t),
      });
    }
  }
  const totales = totalesCamposTecnico((clave) => filas.map((f) => f.campos[clave] || ""));

  if (format === "xlsx") {
    const xlsxRows: any[] = filas.map((f) => {
      const fila: any = {
        Predio: f.predio,
        Incidencia: f.incidencia,
        "Técnico asignado": f.tecnico,
        Fecha: f.fecha,
        Provincia: f.provincia,
      };
      for (const d of CAMPOS_TECNICO) {
        const v = f.campos[d.clave] || "";
        fila[d.etiqueta] = d.tipo === "numero" ? (v ? Number(v) : "") : mostrarValorCampo(d, v);
      }
      return fila;
    });
    const pie: any = { Predio: `TOTAL: ${totalTareas} predios`, Incidencia: "", "Técnico asignado": "", Fecha: "", Provincia: "" };
    for (const d of CAMPOS_TECNICO) pie[d.etiqueta] = totales[d.clave];
    xlsxRows.push(pie);

    const ws = XLSX.utils.json_to_sheet(xlsxRows);
    ws["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 18 },
      ...CAMPOS_TECNICO.map((d) => ({ wch: Math.max(12, d.etiqueta.length + 3) }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Facturación");
    const xlsxBuffer = new Uint8Array(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);

    return new NextResponse(xlsxBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(baseName + ".xlsx")}"`,
        "Content-Length": String(xlsxBuffer.length),
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // Default: CSV
  const escapeCsv = (value: string) => value.replace(/"/g, '""');
  const encabezados = ["Predio", "Incidencia", "Técnico", "Fecha", "Provincia",
    ...CAMPOS_TECNICO.map((d) => d.etiqueta)];
  const csvLines = [encabezados.join(",")];
  for (const f of filas) {
    const celdas = [f.predio, f.incidencia, f.tecnico, f.fecha, f.provincia,
      ...CAMPOS_TECNICO.map((d) => mostrarValorCampo(d, f.campos[d.clave] || ""))];
    csvLines.push(celdas.map((c) => `"${escapeCsv(c)}"`).join(","));
  }
  csvLines.push("");
  const pieCsv = [`TOTAL: ${totalTareas} predios`, "", "", "", "", ...CAMPOS_TECNICO.map((d) => totales[d.clave])];
  csvLines.push(pieCsv.map((c) => `"${escapeCsv(c)}"`).join(","));
  // BOM para que Excel abra el CSV con acentos correctamente
  const csvContent = "﻿" + csvLines.join("\n");

  return new NextResponse(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(reporte.csvNombre || baseName + ".csv")}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * DELETE /api/facturacion/[id] — Eliminar reporte (solo ADMIN)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const { id } = await params;
  const reporte = await prisma.reporteFacturacion.findUnique({ where: { id } });
  if (!reporte) {
    return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });
  }

  // Eliminar CSV del disco
  if (reporte.csvRuta) {
    try {
      const filePath = path.join(process.cwd(), reporte.csvRuta);
      const uploadsBase = path.join(process.cwd(), "uploads");
      if (filePath.startsWith(uploadsBase)) {
        await unlink(filePath);
      }
    } catch {
      // Archivo ya no existe
    }
  }

  // Guardar en papelera antes de eliminar
  const { registrarEnPapelera } = await import("@/lib/papelera");
  await registrarEnPapelera("FACTURACION", `Reporte semana ${reporte.semana}`, reporte as unknown as Record<string, unknown>, session.userId);

  await prisma.reporteFacturacion.delete({ where: { id } });

  await prisma.actividad.create({
    data: {
      accion: "ELIMINAR",
      descripcion: `Reporte facturación semana ${reporte.semana} eliminado`,
      entidad: "REPORTE",
      entidadId: id,
      userId: session.userId,
    },
  });

  return NextResponse.json({ ok: true });
}
