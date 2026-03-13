import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const tipo = searchParams.get("tipo");

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const where: any = {};

  if (desde && hasta) {
    where.fecha = { gte: new Date(desde), lte: new Date(hasta) };
  }
  if (tipo) where.tipo = tipo;

  // Técnicos: solo sus tareas asignadas o creadas
  if (session.rol === "TECNICO") {
    where.OR = [
      { asignadoId: session.userId },
      { creadorId: session.userId },
    ];
  }

  const tareas = await prisma.tareaCalendario.findMany({
    where,
    include: {
      creador: { select: { id: true, nombre: true } },
      asignado: { select: { id: true, nombre: true } },
      predio: { select: { id: true, nombre: true } },
    },
    orderBy: { fecha: "asc" },
  });

  return NextResponse.json(tareas);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const body = await request.json();
    const { titulo, descripcion, fecha, horaInicio, hora, horaFin, tipo, prioridad, color, asignadoId, predioId, notificarPush } = body;

    if (!titulo || !fecha) {
      return NextResponse.json({ error: "Título y fecha son requeridos" }, { status: 400 });
    }

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
        horaInicio: horaInicio || hora || null,
        horaFin: horaFin || null,
        tipo: tipo || "TAREA",
        prioridad: prioridad || "MEDIA",
        color: color || "#3b82f6",
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
