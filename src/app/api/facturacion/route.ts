import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

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
 * Body opcional: { fechaDesde?: string, fechaHasta?: string }
 * Si no se envía, usa los últimos 5 días (lunes a viernes de la semana actual)
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));

    // Calcular período
    const ahora = new Date();
    let desde: Date;
    let hasta: Date;

    if (body.fechaDesde && body.fechaHasta) {
      desde = new Date(body.fechaDesde);
      hasta = new Date(body.fechaHasta);
      hasta.setHours(23, 59, 59, 999);
    } else {
      // Último lunes a hoy (viernes)
      const day = ahora.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      desde = new Date(ahora);
      desde.setDate(ahora.getDate() - diffToMonday);
      desde.setHours(0, 0, 0, 0);
      hasta = new Date(ahora);
      hasta.setHours(23, 59, 59, 999);
    }

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

    // Buscar el estado "conforme" en EstadoConfig
    const estadoConforme = await prisma.estadoConfig.findFirst({
      where: { clave: "conforme", activo: true },
    });
    if (!estadoConforme) {
      return NextResponse.json(
        { error: "Estado CONFORME no encontrado en configuración" },
        { status: 404 }
      );
    }

    // Buscar predios que actualmente están en CONFORME y fueron actualizados en el período
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
        // Tarea sin asignación
        const key = "SIN_ASIGNAR";
        if (!porTecnico[key]) {
          porTecnico[key] = { tecnicoId: "SIN_ASIGNAR", tecnicoNombre: "Sin asignar", cantidad: 0, tareas: [] };
        }
        porTecnico[key].cantidad++;
        porTecnico[key].tareas.push({
          id: predio.id,
          nombre: predio.nombre,
          codigo: predio.codigo,
          provincia: predio.provincia,
        });
      } else {
        for (const tec of tecnicos) {
          if (!porTecnico[tec.id]) {
            porTecnico[tec.id] = { tecnicoId: tec.id, tecnicoNombre: tec.nombre, cantidad: 0, tareas: [] };
          }
          porTecnico[tec.id].cantidad++;
          porTecnico[tec.id].tareas.push({
            id: predio.id,
            nombre: predio.nombre,
            codigo: predio.codigo,
            provincia: predio.provincia,
          });
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

    // Notificar solo al admin que lo generó (bandeja interna, sin push externo)
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
