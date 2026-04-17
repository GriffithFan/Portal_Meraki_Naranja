import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import * as XLSX from "xlsx";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/facturacion — Lista reportes de facturación (solo ADMIN)
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  const reportes = await prisma.reporteFacturacion.findMany({
    include: {
      generadoPor: { select: { id: true, nombre: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ reportes });
}

/**
 * POST /api/facturacion — Genera reporte semanal de tareas CONFORME (solo ADMIN)
 *
 * Lógica:
 * - Solo cuenta predios movidos a CONFORME desde el lunes 00:00 de la semana actual.
 * - Excluye predios que ya estén en el espacio "Facturado".
 * - Genera CSV + XLSX con campos: Predio, Incidencia, Técnico, Fecha, Provincia.
 */
export async function POST() {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  try {
    // Calcular período: lunes 00:00 de esta semana hasta ahora
    const ahora = new Date();
    const day = ahora.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const desde = new Date(ahora);
    desde.setDate(ahora.getDate() - diffToMonday);
    desde.setHours(0, 0, 0, 0);
    const hasta = new Date(ahora);
    hasta.setHours(23, 59, 59, 999);

    // Calcular semana ISO
    const semana = getISOWeek(desde);

    // Verificar si ya existe reporte para esta semana
    const existente = await prisma.reporteFacturacion.findUnique({
      where: { semana },
    });
    if (existente) {
      return NextResponse.json(
        { error: `Ya existe un reporte para la semana ${semana}`, reporteId: existente.id },
        { status: 409 }
      );
    }

    // Buscar el estado "conforme"
    const estadoConforme = await prisma.estadoConfig.findFirst({
      where: { clave: "conforme", activo: true },
    });
    if (!estadoConforme) {
      return NextResponse.json(
        { error: "Estado CONFORME no encontrado en configuración" },
        { status: 404 }
      );
    }

    // Buscar espacio "Facturado" para excluir
    const espacioFacturado = await prisma.espacioTrabajo.findFirst({
      where: { nombre: "Facturado", parentId: null },
    });
    const facturadoId = espacioFacturado?.id;

    // Buscar predios CONFORME actualizados esta semana, excluyendo "Facturado"
    const prediosConforme = await prisma.predio.findMany({
      where: {
        estadoId: estadoConforme.id,
        fechaActualizacion: { gte: desde, lte: hasta },
        ...(facturadoId ? { espacioId: { not: facturadoId } } : {}),
      },
      select: {
        id: true,
        nombre: true,
        codigo: true,
        provincia: true,
        incidencias: true,
        equipoAsignado: true,
        fechaActualizacion: true,
        asignaciones: {
          where: { tipo: "TECNICO" },
          include: { usuario: { select: { id: true, nombre: true } } },
        },
      },
    });

    // Agrupar por técnico
    const porTecnico: Record<string, {
      tecnicoId: string;
      tecnicoNombre: string;
      cantidad: number;
      tareas: { id: string; nombre: string; codigo: string | null; provincia: string | null; incidencia: string | null; fecha: string | null }[];
    }> = {};

    for (const predio of prediosConforme) {
      const tareaData = {
        id: predio.id,
        nombre: predio.nombre,
        codigo: predio.codigo,
        provincia: predio.provincia,
        incidencia: predio.incidencias,
        fecha: predio.fechaActualizacion ? predio.fechaActualizacion.toISOString() : null,
      };

      const tecnicos = predio.asignaciones.map((a) => a.usuario);
      if (tecnicos.length === 0) {
        // Fallback: usar equipoAsignado si no hay asignaciones formales
        const key = predio.equipoAsignado || "SIN_ASIGNAR";
        const label = predio.equipoAsignado || "Sin asignar";
        if (!porTecnico[key]) {
          porTecnico[key] = { tecnicoId: key, tecnicoNombre: label, cantidad: 0, tareas: [] };
        }
        porTecnico[key].cantidad++;
        porTecnico[key].tareas.push(tareaData);
      } else {
        for (const tec of tecnicos) {
          if (!porTecnico[tec.id]) {
            porTecnico[tec.id] = { tecnicoId: tec.id, tecnicoNombre: tec.nombre, cantidad: 0, tareas: [] };
          }
          porTecnico[tec.id].cantidad++;
          porTecnico[tec.id].tareas.push(tareaData);
        }
      }
    }

    const resumen = Object.values(porTecnico);
    const totalTareas = prediosConforme.length;

    // ── Generar CSV ──
    const csvLines = [
      "Predio,Incidencia,Técnico,Fecha,Provincia",
    ];
    for (const grupo of resumen) {
      for (const t of grupo.tareas) {
        const fecha = t.fecha ? new Date(t.fecha).toLocaleDateString("es-AR") : "";
        csvLines.push(
          `"${t.nombre.replace(/"/g, '""')}","${t.incidencia || ""}","${grupo.tecnicoNombre}","${fecha}","${t.provincia || ""}"`
        );
      }
    }
    csvLines.push("");
    csvLines.push(`"TOTAL: ${totalTareas} predios","","","",""`);

    const csvContent = csvLines.join("\n");
    const reportDir = path.join(process.cwd(), "uploads", "reportes");
    await mkdir(reportDir, { recursive: true });
    const csvFileName = `reporte-${semana}.csv`;
    const csvPath = path.join(reportDir, csvFileName);
    await writeFile(csvPath, csvContent, "utf-8");

    // ── Generar XLSX ──
    const xlsxRows: any[] = [];
    for (const grupo of resumen) {
      for (const t of grupo.tareas) {
        xlsxRows.push({
          Predio: t.nombre,
          Incidencia: t.incidencia || "",
          "Técnico asignado": grupo.tecnicoNombre,
          Fecha: t.fecha ? new Date(t.fecha).toLocaleDateString("es-AR") : "",
          Provincia: t.provincia || "",
        });
      }
    }
    xlsxRows.push({ Predio: `TOTAL: ${totalTareas} predios`, Incidencia: "", "Técnico asignado": "", Fecha: "", Provincia: "" });

    const ws = XLSX.utils.json_to_sheet(xlsxRows);
    // Auto-width columns
    const colWidths = [
      { wch: 30 }, // Predio
      { wch: 18 }, // Incidencia
      { wch: 20 }, // Técnico
      { wch: 14 }, // Fecha
      { wch: 18 }, // Provincia
    ];
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Facturación");
    const xlsxFileName = `reporte-${semana}.xlsx`;
    const xlsxPath = path.join(reportDir, xlsxFileName);
    const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    await writeFile(xlsxPath, xlsxBuffer);

    // Crear reporte
    const reporte = await prisma.reporteFacturacion.create({
      data: {
        semana,
        fechaDesde: desde,
        fechaHasta: hasta,
        totalTareas,
        resumen: resumen as any,
        csvRuta: `/uploads/reportes/${csvFileName}`,
        csvNombre: csvFileName,
        generadoEn: "MANUAL",
        generadoPorId: session.userId,
      },
      include: {
        generadoPor: { select: { id: true, nombre: true } },
      },
    });

    // Notificar
    await prisma.notificacion.create({
      data: {
        tipo: "REPORTE_FACTURACION",
        titulo: "Reporte de facturación generado",
        mensaje: `Semana ${semana}: ${totalTareas} tareas CONFORME procesadas`,
        enlace: "/dashboard/facturacion",
        entidad: "REPORTE",
        entidadId: reporte.id,
        userId: session.userId,
      },
    });

    await prisma.actividad.create({
      data: {
        accion: "CREAR",
        descripcion: `Reporte facturación semana ${semana} (${totalTareas} tareas)`,
        entidad: "REPORTE",
        entidadId: reporte.id,
        userId: session.userId,
      },
    });

    return NextResponse.json(reporte, { status: 201 });
  } catch (error) {
    console.error("Error generando reporte:", error);
    return NextResponse.json({ error: "Error al generar reporte" }, { status: 500 });
  }
}

/** Calcula la semana ISO: "2026-W11" */
function getISOWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
