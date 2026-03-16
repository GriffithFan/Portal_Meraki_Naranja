import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { calendarioCreateSchema, parseBody, isErrorResponse } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const tipo = searchParams.get("tipo");
  const categoria = searchParams.get("categoria");

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const where: any = {};

  if (desde && hasta) {
    const desdeDt = new Date(desde);
    const hastaDt = new Date(hasta);
    // Incluir eventos cuyo rango [fecha, fechaFin] intersecte con [desde, hasta]
    where.OR = [
      { fecha: { gte: desdeDt, lte: hastaDt } },
      { fechaFin: { gte: desdeDt, lte: hastaDt } },
      { AND: [{ fecha: { lte: desdeDt } }, { fechaFin: { gte: hastaDt } }] },
    ];
  }
  if (tipo) where.tipo = tipo;
  if (categoria) where.categoria = categoria;

  // Técnicos: solo sus tareas asignadas o creadas
  if (session.rol === "TECNICO") {
    // Si ya hay un OR (por rango de fechas), envolverlo en AND
    if (where.OR) {
      const dateFilter = { OR: where.OR };
      delete where.OR;
      where.AND = [
        dateFilter,
        { OR: [{ asignadoId: session.userId }, { creadorId: session.userId }] },
      ];
    } else {
      where.OR = [
        { asignadoId: session.userId },
        { creadorId: session.userId },
      ];
    }
  }

  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "500") || 500, 1), 2000);

  const tareas = await prisma.tareaCalendario.findMany({
    where,
    include: {
      creador: { select: { id: true, nombre: true } },
      asignado: { select: { id: true, nombre: true } },
      predio: { select: { id: true, nombre: true } },
    },
    orderBy: { fecha: "asc" },
    take: limit,
  });

  return NextResponse.json(tareas);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const data = await parseBody(request, calendarioCreateSchema);
    if (isErrorResponse(data)) return data;

    const { titulo, descripcion, fecha, fechaFin, horaInicio, hora, horaFin, tipo, categoria, prioridad, color, todoElDia, ubicacion, notas, asignadoId, predioId, notificarPush } = data;

    // Solo admin/mod pueden asignar tareas a otros usuarios
    const finalAsignadoId = asignadoId || null;
    if (finalAsignadoId && finalAsignadoId !== session.userId && !isModOrAdmin(session.rol)) {
      return NextResponse.json({ error: "No tienes permisos para asignar tareas a otros" }, { status: 403 });
    }

    // Marcar como asignada si un admin/mod la asigna a otro usuario
    const esAsignada = !!(finalAsignadoId && finalAsignadoId !== session.userId && isModOrAdmin(session.rol));

    const tarea = await prisma.tareaCalendario.create({
      data: {
        titulo,
        descripcion: descripcion || null,
        fecha: new Date(fecha),
        fechaFin: fechaFin ? new Date(fechaFin) : null,
        horaInicio: todoElDia ? null : (horaInicio || hora || null),
        horaFin: todoElDia ? null : (horaFin || null),
        tipo: tipo || "TAREA",
        categoria: categoria || "GENERAL",
        prioridad: prioridad || "MEDIA",
        color: color || "#3b82f6",
        todoElDia: todoElDia || false,
        ubicacion: ubicacion || null,
        notas: notas || null,
        notificarPush: notificarPush !== false,
        esAsignada,
        creadorId: session.userId,
        asignadoId: finalAsignadoId,
        predioId: predioId || null,
      },
      include: {
        creador: { select: { id: true, nombre: true } },
        asignado: { select: { id: true, nombre: true } },
        predio: { select: { id: true, nombre: true } },
      },
    });

    if (asignadoId && asignadoId !== session.userId) {
      await prisma.notificacion.create({
        data: {
          tipo: "TAREA",
          titulo: `Nueva tarea: ${titulo}`,
          mensaje: `${session.nombre} te asignó una tarea para el ${new Date(fecha).toLocaleDateString("es-MX")}`,
          userId: asignadoId,
          enlace: "/dashboard/calendario",
          entidad: "TAREA",
          entidadId: tarea.id,
        },
      });
    }

    return NextResponse.json(tarea, { status: 201 });
  } catch (error) {
    console.error("Error creando tarea:", error);
    return NextResponse.json({ error: "Error al crear tarea" }, { status: 500 });
  }
}
