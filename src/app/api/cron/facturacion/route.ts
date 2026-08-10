import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { verifyCronAuth } from "@/lib/cronAuth";
import { avisarAdminsFallo } from "@/lib/alertasAdmin";
import { filasFacturacion, csvFacturacion, xlsxBufferFacturacion, resumenPorTecnico } from "@/lib/facturacion";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/cron/facturacion
 *
 * Genera automáticamente el reporte semanal de facturación.
 * Diseñado para ejecutarse cada viernes a las 14:00.
 *
 * Protegido por CRON_SECRET (Bearer token, timing-safe).
 *
 * Busca todas las tareas (predios) que pasaron a estado CONFORME
 * durante la semana actual (lunes 00:00 a viernes 14:00),
 * agrupa por técnico asignado, genera CSV y notifica al ADMIN.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const ahora = new Date();
    const semana = getISOWeek(ahora);

    // Si ya existe, no duplicar
    const existente = await prisma.reporteFacturacion.findUnique({
      where: { semana },
    });
    if (existente) {
      return NextResponse.json({
        skipped: true,
        message: `Reporte semana ${semana} ya existe`,
        reporteId: existente.id,
      });
    }

    // Período = desde la EMISIÓN del último reporte (de otra semana) hasta AHORA.
    const previo = await prisma.reporteFacturacion.findFirst({
      where: { semana: { not: semana } },
      orderBy: { fechaHasta: "desc" },
      select: { fechaHasta: true },
    });
    const desde = previo?.fechaHasta ?? new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hasta = ahora;

    // Buscar estado CONFORME
    const estadoConforme = await prisma.estadoConfig.findFirst({
      where: { clave: "conforme", activo: true },
    });
    if (!estadoConforme) {
      return NextResponse.json({ error: "Estado CONFORME no configurado" }, { status: 404 });
    }

    // Excluir predios ya en "Facturado" (igual que la generación manual)
    const espacioFacturado = await prisma.espacioTrabajo.findFirst({ where: { nombre: "Facturado", parentId: null }, select: { id: true } });

    // Predios CONFORME emitidos DESPUÉS del reporte anterior y hasta ahora, excl. "Facturado".
    const prediosConforme = await prisma.predio.findMany({
      where: {
        estadoId: estadoConforme.id,
        fechaActualizacion: { gt: desde, lte: hasta },
        ...(espacioFacturado ? { espacioId: { not: espacioFacturado.id } } : {}),
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

    // Generación compartida con /api/facturacion: una fila por predio, con
    // "Técnico (resolvió)" (último asignado) + "Técnico anterior".
    const resumen = resumenPorTecnico(prediosConforme);
    const totalTareas = prediosConforme.length;
    const filas = filasFacturacion(prediosConforme);
    const totalMas20 = filas.filter((f) => f.mas20Ap).length;

    const csvDir = path.join(process.cwd(), "uploads", "reportes");
    await mkdir(csvDir, { recursive: true });
    const csvFileName = `reporte-${semana}.csv`;
    await writeFile(path.join(csvDir, csvFileName), csvFacturacion(filas, totalTareas, totalMas20), "utf-8");
    await writeFile(path.join(csvDir, `reporte-${semana}.xlsx`), xlsxBufferFacturacion(filas, totalTareas, totalMas20));

    // Buscar admins para asociar el reporte y notificar (una sola query)
    const admins = await prisma.user.findMany({
      where: { rol: "ADMIN", activo: true },
      select: { id: true },
    });
    if (admins.length === 0) {
      return NextResponse.json({ error: "No hay administradores activos" }, { status: 500 });
    }

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
        generadoEn: "AUTO",
        generadoPorId: admins[0].id,
      },
    });

    // Notificar a TODOS los admins (bandeja interna solamente)
    await prisma.notificacion.createMany({
      data: admins.map((a) => ({
        tipo: "REPORTE_FACTURACION",
        titulo: "Reporte semanal de facturación generado",
        mensaje: `Semana ${semana}: ${totalTareas} tareas CONFORME procesadas`,
        enlace: "/dashboard/facturacion",
        entidad: "REPORTE",
        entidadId: reporte.id,
        userId: a.id,
      })),
    });

    await prisma.actividad.create({
      data: {
        accion: "CREAR",
        descripcion: `Reporte facturación automático semana ${semana} (${totalTareas} tareas)`,
        entidad: "REPORTE",
        entidadId: reporte.id,
        userId: admins[0].id,
      },
    });

    return NextResponse.json({
      ok: true,
      semana,
      totalTareas,
      tecnicos: resumen.length,
      reporteId: reporte.id,
    });
  } catch (error) {
    console.error("[CRON Facturación] Error:", error);
    await avisarAdminsFallo({
      titulo: "Falló el cron de facturación",
      mensaje: (error as Error)?.message?.slice(0, 300) || "Error generando el reporte de facturación",
      enlace: "/dashboard/facturacion",
      tag: "cron-facturacion",
    });
    return NextResponse.json({ error: "Error generando reporte" }, { status: 500 });
  }
}

function getISOWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
