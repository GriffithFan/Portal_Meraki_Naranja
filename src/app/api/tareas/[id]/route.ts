import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Crea monitoreo post-cambio cuando se modifica el estado de un predio */
async function iniciarMonitoreoSiCambioEstado(
  predioId: string,
  userId: string,
  estadoAnteriorId: string | null,
  estadoNuevoId: string | null,
) {
  if (estadoAnteriorId === estadoNuevoId) return;

  // Obtener nombres de estados y datos del predio
  const [estadoAnt, estadoNuevo, predio] = await Promise.all([
    estadoAnteriorId ? prisma.estadoConfig.findUnique({ where: { id: estadoAnteriorId } }) : null,
    estadoNuevoId ? prisma.estadoConfig.findUnique({ where: { id: estadoNuevoId } }) : null,
    prisma.predio.findUnique({ where: { id: predioId }, select: { merakiNetworkId: true, merakiOrgId: true } }),
  ]);

  // Cancelar monitoreos anteriores pendientes para este predio
  await prisma.monitoreoPostCambio.updateMany({
    where: { predioId, completado: false },
    data: { completado: true },
  });

  await prisma.monitoreoPostCambio.create({
    data: {
      predioId,
      userId,
      estadoAnterior: estadoAnt?.nombre || "Sin estado",
      estadoNuevo: estadoNuevo?.nombre || "Sin estado",
      networkId: predio?.merakiNetworkId,
      orgId: predio?.merakiOrgId,
      checksRealizados: 0,
      maxChecks: 2,
      intervaloMin: 15,
      proximoCheck: new Date(Date.now() + 15 * 60 * 1000), // primer check en 15 min
    },
  });
}

// Campos editables del cronograma SF 2026
const EDITABLE_FIELDS = [
  "nombre", "codigo", "direccion", "ciudad", "tipo", "notas", "prioridad",
  "seccion", "latitud", "longitud", "estadoId", "fechaProgramada",
  "incidencias", "lacR", "cue", "ambito", "equipoAsignado",
  "provincia", "cuePredio", "gpsPredio", "fechaDesde", "fechaHasta"
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const predio = await prisma.predio.findUnique({
    where: { id },
    include: {
      estado: true,
      creador: { select: { id: true, nombre: true } },
      asignaciones: {
        include: { usuario: { select: { id: true, nombre: true } } },
      },
      comentarios: {
        include: { usuario: { select: { nombre: true } } },
        orderBy: { createdAt: "desc" },
      },
      equipos: { select: { id: true, nombre: true, estado: true } },
      tareas: {
        include: { asignado: { select: { id: true, nombre: true } } },
        orderBy: { fecha: "asc" },
      },
    },
  });

  if (!predio) {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  return NextResponse.json(predio);
}

// PATCH para edición inline de celdas
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.predio.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const data: any = {
      fechaActualizacion: new Date(),
    };

    // Solo actualizar campos permitidos
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) {
        // Convertir fechas
        if (["fechaDesde", "fechaHasta", "fechaProgramada"].includes(field)) {
          data[field] = body[field] ? new Date(body[field]) : null;
        }
        // Convertir coordenadas
        else if (["latitud", "longitud"].includes(field)) {
          const val = parseFloat(String(body[field]).replace(",", "."));
          data[field] = isNaN(val) ? null : val;
        }
        // Valores normales
        else {
          data[field] = body[field] || null;
        }
      }
    }

    const updated = await prisma.predio.update({
      where: { id },
      data,
      include: {
        estado: true,
        creador: { select: { id: true, nombre: true } },
        asignaciones: {
          include: { usuario: { select: { id: true, nombre: true } } },
        },
      },
    });

    // Actualizar asignaciones si se proporcionan
    if (body.asignadoIds !== undefined && Array.isArray(body.asignadoIds)) {
      await prisma.asignacion.deleteMany({ where: { predioId: id } });
      if (body.asignadoIds.length > 0) {
        await prisma.asignacion.createMany({
          data: body.asignadoIds.map((uid: string) => ({
            tipo: "TAREA",
            userId: uid,
            predioId: id,
          })),
        });
      }
      // Recargar asignaciones en el response
      updated.asignaciones = await prisma.asignacion.findMany({
        where: { predioId: id },
        include: { usuario: { select: { id: true, nombre: true } } },
      });
    }

    // Registrar actividad
    const changedFields = Object.keys(body).filter(k => EDITABLE_FIELDS.includes(k));
    if (changedFields.length > 0) {
      await prisma.actividad.create({
        data: {
          accion: "EDITAR",
          descripcion: `Campos actualizados: ${changedFields.join(", ")}`,
          entidad: "PREDIO",
          entidadId: id,
          userId: session.userId,
        },
      });
    }

    // Monitoreo post-cambio de estado
    if (body.estadoId !== undefined && body.estadoId !== existing.estadoId) {
      iniciarMonitoreoSiCambioEstado(id, session.userId, existing.estadoId, body.estadoId || null)
        .catch((e) => console.error("Error creando monitoreo:", e));
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error actualizando tarea:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { nombre, codigo, direccion, ciudad, tipo, notas, prioridad, estadoId, fechaProgramada, asignadoIds,
      incidencias, lacR, cue, ambito, equipoAsignado, provincia, cuePredio, gpsPredio, fechaDesde, fechaHasta } = body;

    const existing = await prisma.predio.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    }

    const updateData: any = { fechaActualizacion: new Date() };
    if (nombre !== undefined) updateData.nombre = nombre;
    if (codigo !== undefined) updateData.codigo = codigo || null;
    if (direccion !== undefined) updateData.direccion = direccion;
    if (ciudad !== undefined) updateData.ciudad = ciudad;
    if (tipo !== undefined) updateData.tipo = tipo;
    if (notas !== undefined) updateData.notas = notas;
    if (prioridad !== undefined) updateData.prioridad = prioridad;
    if (estadoId !== undefined) updateData.estadoId = estadoId || null;
    if (fechaProgramada !== undefined) updateData.fechaProgramada = fechaProgramada ? new Date(fechaProgramada) : null;
    // Campos del cronograma
    if (incidencias !== undefined) updateData.incidencias = incidencias;
    if (lacR !== undefined) updateData.lacR = lacR;
    if (cue !== undefined) updateData.cue = cue;
    if (ambito !== undefined) updateData.ambito = ambito;
    if (equipoAsignado !== undefined) updateData.equipoAsignado = equipoAsignado;
    if (provincia !== undefined) updateData.provincia = provincia;
    if (cuePredio !== undefined) updateData.cuePredio = cuePredio;
    if (gpsPredio !== undefined) updateData.gpsPredio = gpsPredio;
    if (fechaDesde !== undefined) updateData.fechaDesde = fechaDesde ? new Date(fechaDesde) : null;
    if (fechaHasta !== undefined) updateData.fechaHasta = fechaHasta ? new Date(fechaHasta) : null;

    const predio = await prisma.predio.update({
      where: { id },
      data: updateData,
    });

    // Actualizar asignaciones si se proporcionan
    if (asignadoIds !== undefined && Array.isArray(asignadoIds)) {
      await prisma.asignacion.deleteMany({ where: { predioId: id } });
      if (asignadoIds.length > 0) {
        await prisma.asignacion.createMany({
          data: asignadoIds.map((uid: string) => ({
            tipo: "TAREA",
            userId: uid,
            predioId: id,
          })),
        });
      }
    }

    await prisma.actividad.create({
      data: {
        accion: "ACTUALIZAR",
        descripcion: `Tarea "${predio.nombre}" actualizada`,
        entidad: "PREDIO",
        entidadId: predio.id,
        userId: session.userId,
      },
    });

    // Monitoreo post-cambio de estado
    if (estadoId !== undefined && estadoId !== existing.estadoId) {
      iniciarMonitoreoSiCambioEstado(id, session.userId, existing.estadoId, estadoId || null)
        .catch((e) => console.error("Error creando monitoreo:", e));
    }

    return NextResponse.json(predio);
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
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const predio = await prisma.predio.findUnique({ where: { id } });
    if (!predio) {
      return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    }

    await prisma.predio.delete({ where: { id } });

    await prisma.actividad.create({
      data: {
        accion: "ELIMINAR",
        descripcion: `Tarea "${predio.nombre}" eliminada`,
        entidad: "PREDIO",
        entidadId: id,
        userId: session.userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error eliminando tarea:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
