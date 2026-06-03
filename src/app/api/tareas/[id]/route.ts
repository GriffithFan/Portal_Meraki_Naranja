import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { parseBody, isErrorResponse, tareaUpdateSchema } from "@/lib/validation";
import { getRestrictedSpaceIdsForSession } from "@/lib/spaceAccess";
import { getHiddenEstadoIdsForSession } from "@/lib/predioVisibility";

async function delegatedUserIds(userId: string): Promise<string[]> {
  const delegaciones = await prisma.delegacion.findMany({
    where: { delegadoId: userId, activo: true },
    select: { delegadorId: true },
  });
  return [userId, ...delegaciones.map((d) => d.delegadorId)];
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const FIELD_LABELS: Record<string, string> = {
  estadoId: "Estado",
  espacioId: "Espacio",
  asignadoIds: "Asignados",
  provincia: "Provincia",
  prioridad: "Prioridad",
  ambito: "Ambito",
  lacR: "LAC-R",
  notas: "Notas",
  notasTecnico: "Notas del Tecnico",
  incidencias: "Incidencia",
  fechaDesde: "Fecha desde",
  fechaHasta: "Fecha hasta",
  gpsPredio: "GPS predio",
  cue: "CUE",
  cuePredio: "CUE predio",
};

function displayValue(value: unknown) {
  if (value == null || value === "") return "Sin valor";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Sin asignados";
  return String(value);
}

function sameValue(before: unknown, after: unknown) {
  return displayValue(before) === displayValue(after);
}

type EtiquetaInput = string | { id?: string | null; nombre?: string | null; color?: string | null };

function normalizarEtiquetas(input: unknown): Array<{ id?: string; nombre: string; color: string }> | null {
  if (!Array.isArray(input)) return null;
  const byKey = new Map<string, { id?: string; nombre: string; color: string }>();
  for (const raw of input as EtiquetaInput[]) {
    const id = typeof raw === "object" && raw ? raw.id?.trim() || undefined : undefined;
    const nombre = (typeof raw === "string" ? raw : raw?.nombre || "").trim();
    if (!nombre) continue;
    const color = (typeof raw === "object" && raw?.color ? raw.color : "#3b82f6").trim() || "#3b82f6";
    byKey.set(id || nombre.toLowerCase(), { id, nombre, color });
  }
  return Array.from(byKey.values()).slice(0, 12);
}

async function replacePredioEtiquetas(predioId: string, input: unknown) {
  const etiquetas = normalizarEtiquetas(input);
  if (etiquetas === null) return;

  await prisma.$transaction(async (tx) => {
    await tx.predioEtiqueta.deleteMany({ where: { predioId } });
    for (const item of etiquetas) {
      let etiqueta = item.id
        ? await tx.etiqueta.findUnique({ where: { id: item.id } })
        : null;
      if (!etiqueta) {
        etiqueta = await tx.etiqueta.upsert({
          where: { nombre: item.nombre },
          update: { color: item.color },
          create: { nombre: item.nombre, color: item.color },
        });
      }
      await tx.predioEtiqueta.create({
        data: { predioId, etiquetaId: etiqueta.id },
      });
    }
  });
}

async function buildPredioChangeDetails(params: {
  before: any;
  after: any;
  fields: string[];
}) {
  const { before, after, fields } = params;
  const changes: Array<{ field: string; label: string; before: string; after: string }> = [];

  for (const field of fields) {
    let beforeValue: unknown = before[field];
    let afterValue: unknown = after[field];

    if (field === "estadoId") {
      const ids = [before.estadoId, after.estadoId].filter(Boolean) as string[];
      const estados = ids.length
        ? await prisma.estadoConfig.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })
        : [];
      const byId = new Map(estados.map((estado) => [estado.id, estado.nombre]));
      beforeValue = before.estado?.nombre || byId.get(before.estadoId) || null;
      afterValue = after.estado?.nombre || byId.get(after.estadoId) || null;
    }

    if (field === "espacioId") {
      const ids = [before.espacioId, after.espacioId].filter(Boolean) as string[];
      const espacios = ids.length
        ? await prisma.espacioTrabajo.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })
        : [];
      const byId = new Map(espacios.map((espacio) => [espacio.id, espacio.nombre]));
      beforeValue = before.espacio?.nombre || byId.get(before.espacioId) || null;
      afterValue = after.espacio?.nombre || byId.get(after.espacioId) || null;
    }

    if (field === "asignadoIds") {
      beforeValue = (before.asignaciones || []).map((asignacion: any) => asignacion.usuario?.nombre || asignacion.userId).filter(Boolean);
      afterValue = (after.asignaciones || []).map((asignacion: any) => asignacion.usuario?.nombre || asignacion.userId).filter(Boolean);
    }

    if (!sameValue(beforeValue, afterValue)) {
      changes.push({
        field,
        label: FIELD_LABELS[field] || field,
        before: displayValue(beforeValue),
        after: displayValue(afterValue),
      });
    }
  }

  return changes;
}

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

  // Solo monitorear cuando se mueve a "instalado" o "auditar"
  const clavesMonitoreo = ["instalado", "auditar"];
  if (!estadoNuevo || !clavesMonitoreo.includes(estadoNuevo.clave)) {
    return;
  }

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
  "nombre", "codigo", "direccion", "ciudad", "tipo", "notas", "notasTecnico", "prioridad",
  "seccion", "latitud", "longitud", "estadoId", "fechaProgramada",
  "incidencias", "lacR", "cue", "ambito",
  "provincia", "cuePredio", "gpsPredio", "fechaDesde", "fechaHasta",
  "tipoRed", "codigoPostal", "caracteristicaTelefonica", "telefono",
  "lab", "nombreInstitucion", "correo", "camposExtra"
];

export async function GET(
  request: NextRequest,
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
        take: 50,
      },
      equipos: { select: { id: true, nombre: true, estado: true } },
      etiquetas: { include: { etiqueta: true } },
      tareas: {
        include: { asignado: { select: { id: true, nombre: true } } },
        orderBy: { fecha: "asc" },
        take: 100,
      },
      actas: {
        select: {
          id: true,
          nombre: true,
          archivoNombre: true,
          archivoTipo: true,
          archivoSize: true,
          version: true,
          createdAt: true,
          subidoPor: { select: { id: true, nombre: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!predio) {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  const [restrictedSpaceIds, hiddenEstadoIds] = await Promise.all([
    getRestrictedSpaceIdsForSession(session),
    getHiddenEstadoIdsForSession(session),
  ]);

  if (predio.estadoId && hiddenEstadoIds.includes(predio.estadoId)) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  if (restrictedSpaceIds && predio.espacioId && !restrictedSpaceIds.includes(predio.espacioId)) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  // IDOR: técnicos solo pueden ver predios asignados o delegados.
  if (!isModOrAdmin(session.rol)) {
    const idsVisibles = await delegatedUserIds(session.userId);
    const isAssigned = predio.asignaciones?.some(
      (a: { usuario: { id: string } }) => idsVisibles.includes(a.usuario.id)
    );
    if (!isAssigned) {
      return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    }
  }

  // Registrar consulta de predio individual (auditoría) — fire-and-forget
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  prisma.registroAcceso.create({
    data: {
      userId: session.userId,
      accion: "CONSULTA_PREDIO",
      detalle: predio.nombre || predio.codigo || id,
      ip,
      metadata: { predioId: id, codigo: predio.codigo, espacioId: predio.espacioId },
    },
  }).catch(() => {});

  return NextResponse.json(predio);
}

// PATCH para edición inline de celdas
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.predio.findUnique({
    where: { id },
    include: {
      estado: { select: { id: true, nombre: true } },
      espacio: { select: { id: true, nombre: true } },
      creador: { select: { id: true } },
      asignaciones: { include: { usuario: { select: { id: true, nombre: true } } } },
      etiquetas: { include: { etiqueta: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  const [restrictedSpaceIds, hiddenEstadoIds] = await Promise.all([
    getRestrictedSpaceIdsForSession(session),
    getHiddenEstadoIdsForSession(session),
  ]);

  if (existing.estadoId && hiddenEstadoIds.includes(existing.estadoId)) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  if (restrictedSpaceIds && existing.espacioId && !restrictedSpaceIds.includes(existing.espacioId)) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  if (!isModOrAdmin(session.rol)) {
    const idsVisibles = await delegatedUserIds(session.userId);
    const isAssigned = existing.asignaciones?.some((a) => idsVisibles.includes(a.usuario.id));
    if (!isAssigned) {
      return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    }
  }

  try {
    const body = await parseBody(request, tareaUpdateSchema);
    if (isErrorResponse(body)) return body;
    const bodyAny = body as Record<string, unknown>;

    // Usuarios normales solo pueden cambiar estadoId
    if (!isModOrAdmin(session.rol)) {
      const allowedFields = ["estadoId", "notasTecnico"];
      const requestedFields = Object.keys(bodyAny).filter(k => bodyAny[k] !== undefined);
      const forbidden = requestedFields.filter(f => !allowedFields.includes(f));
      if (forbidden.length > 0) {
        return NextResponse.json({ error: "Sin permisos para editar estos campos" }, { status: 403 });
      }
    }

    const data: any = {
      fechaActualizacion: new Date(),
    };

    // Solo actualizar campos permitidos
    for (const field of EDITABLE_FIELDS) {
      if (bodyAny[field] !== undefined) {
        // Convertir fechas
        if (["fechaDesde", "fechaHasta", "fechaProgramada"].includes(field)) {
          data[field] = bodyAny[field] ? new Date(bodyAny[field] as string) : null;
        }
        // Convertir coordenadas
        else if (["latitud", "longitud"].includes(field)) {
          const val = parseFloat(String(bodyAny[field]).replace(",", "."));
          data[field] = isNaN(val) ? null : val;
        }
        // Merge camposExtra (no sobreescribir, combinar con existentes)
        else if (field === "camposExtra") {
          const prev = (existing.camposExtra && typeof existing.camposExtra === "object")
            ? existing.camposExtra as Record<string, unknown>
            : {};
          data[field] = { ...prev, ...(bodyAny[field] as Record<string, unknown>) };
        }
        // Valores normales
        else {
          data[field] = bodyAny[field] || null;
        }
      }
    }

    // Si se actualiza gpsPredio, auto-parsear latitud y longitud
    if (data.gpsPredio) {
      const parts = data.gpsPredio.split(",").map((s: string) => parseFloat(s.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        data.latitud = parts[0];
        data.longitud = parts[1];
      }
    }

    const updated = await prisma.predio.update({
      where: { id },
      data,
      include: {
        estado: true,
        espacio: { select: { id: true, nombre: true } },
        creador: { select: { id: true, nombre: true } },
        asignaciones: {
          include: { usuario: { select: { id: true, nombre: true } } },
        },
        etiquetas: { include: { etiqueta: true } },
      },
    });

    if (bodyAny.etiquetas !== undefined) {
      await replacePredioEtiquetas(id, bodyAny.etiquetas);
      updated.etiquetas = await prisma.predioEtiqueta.findMany({
        where: { predioId: id },
        include: { etiqueta: true },
      });
    }

    // Actualizar asignaciones si se proporcionan (dentro de transacción para evitar race conditions)
    const asignadoIds = body.asignadoIds;
    if (asignadoIds !== undefined && Array.isArray(asignadoIds)) {
      await prisma.$transaction(async (tx) => {
        await tx.asignacion.deleteMany({ where: { predioId: id } });
        if (asignadoIds.length > 0) {
          const validUsers = await tx.user.findMany({
            where: { id: { in: asignadoIds }, activo: true },
            select: { id: true },
          });
          const validIds = validUsers.map((u: { id: string }) => u.id);
          if (validIds.length > 0) {
            await tx.asignacion.createMany({
              data: validIds.map((uid: string) => ({
                tipo: "TAREA",
                userId: uid,
                predioId: id,
              })),
            });
          }
        }
      });
      // Recargar asignaciones en el response
      updated.asignaciones = await prisma.asignacion.findMany({
        where: { predioId: id },
        include: { usuario: { select: { id: true, nombre: true } } },
      });
    }

    // Registrar actividad
    const changedFields = Object.keys(body).filter(k => EDITABLE_FIELDS.includes(k) || k === "asignadoIds" || k === "etiquetas");
    if (changedFields.length > 0) {
      const changes = await buildPredioChangeDetails({ before: existing, after: updated, fields: changedFields });
      await prisma.actividad.create({
        data: {
          accion: "EDITAR",
          descripcion: changes.length > 0
            ? changes.map((change) => `${change.label}: ${change.before} -> ${change.after}`).join("; ")
            : `Campos actualizados: ${changedFields.join(", ")}`,
          entidad: "PREDIO",
          entidadId: id,
          userId: session.userId,
          metadata: { changes },
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
    const body = await parseBody(request, tareaUpdateSchema);
    if (isErrorResponse(body)) return body;
    const { nombre, codigo, direccion, ciudad, tipo, notas, notasTecnico, prioridad, estadoId, fechaProgramada, asignadoIds,
      incidencias, lacR, cue, ambito, provincia, cuePredio, gpsPredio, fechaDesde, fechaHasta, etiquetas } = body;

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
    if (notasTecnico !== undefined) updateData.notasTecnico = notasTecnico;
    if (prioridad !== undefined) updateData.prioridad = prioridad;
    if (estadoId !== undefined) updateData.estadoId = estadoId || null;
    if (fechaProgramada !== undefined) updateData.fechaProgramada = fechaProgramada ? new Date(fechaProgramada) : null;
    // Campos del cronograma
    if (incidencias !== undefined) updateData.incidencias = incidencias;
    if (lacR !== undefined) updateData.lacR = lacR;
    if (cue !== undefined) updateData.cue = cue;
    if (ambito !== undefined) updateData.ambito = ambito;
    if (provincia !== undefined) updateData.provincia = provincia;
    if (cuePredio !== undefined) updateData.cuePredio = cuePredio;
    if (gpsPredio !== undefined) updateData.gpsPredio = gpsPredio;
    if (fechaDesde !== undefined) updateData.fechaDesde = fechaDesde ? new Date(fechaDesde) : null;
    if (fechaHasta !== undefined) updateData.fechaHasta = fechaHasta ? new Date(fechaHasta) : null;

    const predio = await prisma.predio.update({
      where: { id },
      data: updateData,
      include: { etiquetas: { include: { etiqueta: true } } },
    });

    if (etiquetas !== undefined) {
      await replacePredioEtiquetas(id, etiquetas);
      predio.etiquetas = await prisma.predioEtiqueta.findMany({
        where: { predioId: id },
        include: { etiqueta: true },
      });
    }

    // Actualizar asignaciones si se proporcionan
    if (asignadoIds !== undefined && Array.isArray(asignadoIds)) {
      await prisma.asignacion.deleteMany({ where: { predioId: id } });
      if (asignadoIds.length > 0) {
        const validUsers = await prisma.user.findMany({
          where: { id: { in: asignadoIds }, activo: true },
          select: { id: true },
        });
        const validIds = validUsers.map((u: { id: string }) => u.id);
        if (validIds.length > 0) {
          await prisma.asignacion.createMany({
            data: validIds.map((uid: string) => ({
              tipo: "TAREA",
              userId: uid,
              predioId: id,
            })),
          });
        }
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

    // Guardar en papelera antes de eliminar
    const { registrarEnPapelera } = await import("@/lib/papelera");
    await registrarEnPapelera("PREDIO", predio.nombre || predio.codigo || "Sin nombre", predio as unknown as Record<string, unknown>, session.userId);

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
