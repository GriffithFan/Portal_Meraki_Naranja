import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { filasFacturacion, csvFacturacion, xlsxBufferFacturacion, resumenPorTecnico } from "@/lib/facturacion";
import { quitarYaFacturados } from "@/lib/prediosFacturados";

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
    const ahora = new Date();
    const semana = getISOWeek(ahora);

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

    // Período = desde la EMISIÓN del último reporte (de OTRA semana) hasta AHORA.
    // Al generar la facturación se cierra el período; los conformes que salgan después
    // se cuentan para la siguiente. Así el corte real es el momento en que se emite.
    const previo = await prisma.reporteFacturacion.findFirst({
      where: { semana: { not: semana } },
      orderBy: { fechaHasta: "desc" },
      select: { fechaHasta: true },
    });
    const desde = previo?.fechaHasta ?? new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hasta = ahora;

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

    // Predios CONFORME emitidos DESPUÉS del reporte anterior y hasta ahora, excl. "Facturado".
    const prediosConforme = await prisma.predio.findMany({
      where: {
        estadoId: estadoConforme.id,
        fechaActualizacion: { gt: desde, lte: hasta },
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

    // Un predio que ya se facturó en un reporte anterior no se vuelve a facturar aunque
    // haya vuelto a CONFORME: sería cobrar dos veces el mismo trabajo.
    const { incluidos: prediosFacturables, excluidos: refacturados } = await quitarYaFacturados(prediosConforme);
    if (refacturados.length > 0) {
      console.warn(
        `[facturacion] ${refacturados.length} predio(s) excluidos por estar ya facturados: `
        + refacturados.map((p) => p.codigo).join(", ")
      );
    }

    // Generación compartida: una fila por predio, con "Técnico (resolvió)" + "Técnico anterior".
    const resumen = resumenPorTecnico(prediosFacturables);
    const totalTareas = prediosFacturables.length;
    const filas = filasFacturacion(prediosFacturables);
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
