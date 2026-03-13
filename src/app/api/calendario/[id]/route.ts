import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;

  try {
    const tareaAnterior = await prisma.tareaCalendario.findUnique({ where: { id } });
    if (!tareaAnterior) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });

    const esCreador = tareaAnterior.creadorId === session.userId;
    const esAsignatario = tareaAnterior.asignadoId === session.userId;
    const admin = isModOrAdmin(session.rol);

    // Técnicos solo pueden editar tareas propias o marcar completada en asignadas
    // No pueden editar/eliminar tareas asignadas por admin hasta que pase la fecha
    if (!admin && !esCreador) {
      if (tareaAnterior.esAsignada && esAsignatario) {
        // Asignatario solo puede marcar como completada
        const body = await request.json();
        if (Object.keys(body).length !== 1 || body.completada === undefined) {
          return NextResponse.json({ error: "Solo puedes marcar como completada las tareas asignadas" }, { status: 403 });
        }
        const tarea = await prisma.tareaCalendario.update({
          where: { id },
          data: { completada: body.completada },
          include: {
            creador: { select: { id: true, nombre: true } },
            asignado: { select: { id: true, nombre: true } },
            predio: { select: { id: true, nombre: true } },
          },
        });
        return NextResponse.json(tarea);
      }
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }

    const body = await request.json();
    const { titulo, descripcion, fecha, horaInicio, hora, horaFin, tipo, prioridad, completada, color, asignadoId, predioId, notificarPush } = body;

    const updateData: any = {};
    if (titulo !== undefined) updateData.titulo = titulo;
    if (descripcion !== undefined) updateData.descripcion = descripcion;
    if (fecha !== undefined) updateData.fecha = new Date(fecha);
    if (horaInicio !== undefined) updateData.horaInicio = horaInicio;
    else if (hora !== undefined) updateData.horaInicio = hora;
    if (horaFin !== undefined) updateData.horaFin = horaFin;
    if (tipo !== undefined) updateData.tipo = tipo;
    if (prioridad !== undefined) updateData.prioridad = prioridad;
    if (completada !== undefined) updateData.completada = completada;
    if (color !== undefined) updateData.color = color;
    if (notificarPush !== undefined) updateData.notificarPush = notificarPush;
    if (asignadoId !== undefined) {
      updateData.asignadoId = asignadoId || null;
      // Si admin reasigna a otro usuario, marcar esAsignada
      if (asignadoId && asignadoId !== session.userId && admin) {
        updateData.esAsignada = true;
      }
    }
    if (predioId !== undefined) updateData.predioId = predioId || null;

    const tarea = await prisma.tareaCalendario.update({
      where: { id },
      data: updateData,
      include: {
        creador: { select: { id: true, nombre: true } },
        asignado: { select: { id: true, nombre: true } },
        predio: { select: { id: true, nombre: true } },
      },
    });

    if (asignadoId && asignadoId !== session.userId && asignadoId !== tareaAnterior.asignadoId) {
      await prisma.notificacion.create({
        data: {
          tipo: "TAREA",
          titulo: `Tarea asignada: ${tarea.titulo}`,
          mensaje: `${session.nombre} te asignó una tarea`,
          userId: asignadoId,
          enlace: "/dashboard/calendario",
          entidad: "TAREA",
          entidadId: tarea.id,
        },
      });
    }

    return NextResponse.json(tarea);
  } catch (error) {
    console.error("Error actualizando tarea:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;

  try {
    const tarea = await prisma.tareaCalendario.findUnique({ where: { id } });
    if (!tarea) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });

    const esCreador = tarea.creadorId === session.userId;
    const admin = isModOrAdmin(session.rol);

    // Solo creador o admin/mod pueden eliminar
    // Técnicos no pueden eliminar tareas asignadas por admin
    if (!admin && !esCreador) {
      return NextResponse.json({ error: "Sin permisos para eliminar" }, { status: 403 });
    }

    await prisma.tareaCalendario.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
