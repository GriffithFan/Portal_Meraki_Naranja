import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/cron/facturacion
 *
 * Genera automáticamente el reporte semanal de facturación.
 * Diseñado para ejecutarse cada viernes a las 14:00.
 *
 * Protegido por CRON_SECRET (Bearer token).
 *
 * Busca todas las tareas (predios) que pasaron a estado CONFORME
 * durante la semana actual (lunes 00:00 a viernes 14:00),
 * agrupa por técnico asignado, genera CSV y notifica al ADMIN.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== cronSecret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const ahora = new Date();

    // Calcular lunes de esta semana
    const day = ahora.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const desde = new Date(ahora);
    desde.setDate(ahora.getDate() - diffToMonday);
    desde.setHours(0, 0, 0, 0);
    const hasta = new Date(ahora);
    hasta.setHours(23, 59, 59, 999);

    // Semana ISO
    const semana = getISOWeek(desde);

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

    // Buscar estado CONFORME
    const estadoConforme = await prisma.estadoConfig.findFirst({
      where: { clave: "conforme", activo: true },
    });
    if (!estadoConforme) {
      return NextResponse.json({ error: "Estado CONFORME no configurado" }, { status: 404 });
    }

    // Buscar predios en CONFORME actualizados esta semana
    const prediosConforme = await prisma.predio.findMany({
      where: {
        estadoId: estadoConforme.id,
        fechaActualizacion: { gte: desde, lte: hasta },
      },
      select: {
        id: true,
        nombre: true,
        codigo: true,
        provincia: true,
        equipoAsignado: true,
        fechaActualizacion: true,
        asignaciones: {
          where: { tipo: "TAREA" },
          include: { usuario: { select: { id: true, nombre: true } } },
        },
      },
    });

    // Agrupar por técnico
    const porTecnico: Record<string, {
      tecnicoId: string;
      tecnicoNombre: string;
      cantidad: number;
      tareas: { id: string; nombre: string; codigo: string | null; provincia: string | null }[];
    }> = {};

    for (const predio of prediosConforme) {
      const tecnicos = predio.asignaciones.map((a) => a.usuario);
      if (tecnicos.length === 0) {
        const key = "SIN_ASIGNAR";
        if (!porTecnico[key]) {
          porTecnico[key] = { tecnicoId: "SIN_ASIGNAR", tecnicoNombre: "Sin asignar", cantidad: 0, tareas: [] };
        }
        porTecnico[key].cantidad++;
        porTecnico[key].tareas.push({ id: predio.id, nombre: predio.nombre, codigo: predio.codigo, provincia: predio.provincia });
      } else {
        for (const tec of tecnicos) {
          if (!porTecnico[tec.id]) {
            porTecnico[tec.id] = { tecnicoId: tec.id, tecnicoNombre: tec.nombre, cantidad: 0, tareas: [] };
          }
          porTecnico[tec.id].cantidad++;
          porTecnico[tec.id].tareas.push({ id: predio.id, nombre: predio.nombre, codigo: predio.codigo, provincia: predio.provincia });
        }
      }
    }

    const resumen = Object.values(porTecnico);
    const totalTareas = prediosConforme.length;

    // Generar CSV
    const csvLines = [
      "Tecnico,Cantidad Tareas,Codigo Tarea,Nombre Tarea,Provincia",
    ];
    for (const grupo of resumen) {
      for (const t of grupo.tareas) {
        csvLines.push(
          `"${grupo.tecnicoNombre}",${grupo.cantidad},"${t.codigo || ""}","${t.nombre.replace(/"/g, '""')}","${t.provincia || ""}"`
        );
      }
    }
    csvLines.push("");
    csvLines.push(`"TOTAL",${totalTareas},"","",""`);

    const csvContent = csvLines.join("\n");
    const csvDir = path.join(process.cwd(), "uploads", "reportes");
    await mkdir(csvDir, { recursive: true });
    const csvFileName = `reporte-${semana}.csv`;
    const csvPath = path.join(csvDir, csvFileName);
    await writeFile(csvPath, csvContent, "utf-8");

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
