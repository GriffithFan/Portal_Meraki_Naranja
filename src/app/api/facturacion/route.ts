import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { filasFacturacion, csvFacturacion, xlsxBufferFacturacion, resumenPorTecnico } from "@/lib/facturacion";

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
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  let overwrite = false;
  try {
    const body = await request.json();
    overwrite = body?.overwrite === true;
  } catch { /* sin cuerpo */ }

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
    if (existente && !overwrite) {
      return NextResponse.json(
        { error: `Ya existe un reporte para la semana ${semana}`, reporteId: existente.id, exists: true, semana },
        { status: 409 }
      );
    }
    // Sobrescribir: borrar el reporte anterior de esta semana antes de regenerar.
    // El CSV/XLSX en disco se reescribe con el mismo nombre (reporte-<semana>).
    if (existente && overwrite) {
      await prisma.reporteFacturacion.delete({ where: { id: existente.id } });
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
        fechaActualizacion: true,
        camposExtra: true,
        asignaciones: {
          where: { tipo: { in: ["TAREA", "TECNICO"] } },
          include: { usuario: { select: { id: true, nombre: true } } },
        },
      },
    });

    // Generación compartida: una fila por predio, con "Técnico (resolvió)" + "Técnico anterior".
    const resumen = resumenPorTecnico(prediosConforme);
    const totalTareas = prediosConforme.length;
    const filas = filasFacturacion(prediosConforme);
    const totalMas20 = filas.filter((f) => f.mas20Ap).length;

    const reportDir = path.join(process.cwd(), "uploads", "reportes");
    await mkdir(reportDir, { recursive: true });
    const csvFileName = `reporte-${semana}.csv`;
    await writeFile(path.join(reportDir, csvFileName), csvFacturacion(filas, totalTareas, totalMas20), "utf-8");
    await writeFile(path.join(reportDir, `reporte-${semana}.xlsx`), xlsxBufferFacturacion(filas, totalTareas, totalMas20));

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
