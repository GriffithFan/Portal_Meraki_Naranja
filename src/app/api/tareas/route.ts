import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { sanitizeSearch } from "@/lib/sanitize";
import { parseBody, isErrorResponse, tareaCreateSchema } from "@/lib/validation";
import { registrarEnPapelera } from "@/lib/papelera";
import { detectarProvincia } from "@/utils/provinciaUtils";
import { getAllEquipoVariants } from "@/utils/equipoUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const buscar = sanitizeSearch(searchParams.get("buscar"));
  const estado = searchParams.get("estado");
  const asignadoId = searchParams.get("asignadoId");
  const espacioId = searchParams.get("espacioId");
  const provincia = sanitizeSearch(searchParams.get("provincia"));
  const equipo = sanitizeSearch(searchParams.get("equipo"));
  const prioridad = searchParams.get("prioridad");
  const quick = searchParams.get("quick");
  const includeSubspaces = searchParams.get("includeSubspaces") === "true";
  const limitParam = searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitParam || "100") || 100, 1), 2000);
  const pageParam = searchParams.get("page");
  const page = Math.max(parseInt(pageParam || "1") || 1, 1);
  const skip = (page - 1) * limit;

  const where: any = {};

  // Técnicos solo ven sus propias tareas + las de usuarios que les delegaron acceso
  if (!isModOrAdmin(session.rol)) {
    const delegaciones = await prisma.delegacion.findMany({
      where: { delegadoId: session.userId, activo: true },
      select: { delegadorId: true },
    });
    const idsVisibles = [session.userId, ...delegaciones.map(d => d.delegadorId)];

    // Buscar también por equipoAsignado (nombres almacenados en la DB)
    const equipoMatch = getAllEquipoVariants(session.nombre);

    where.OR = [
      { asignaciones: { some: { userId: { in: idsVisibles } } } },
      { creadorId: { in: idsVisibles } },
      { equipoAsignado: equipoMatch.length > 0
        ? { in: equipoMatch, mode: "insensitive" }
        : { equals: session.nombre, mode: "insensitive" } },
    ];
  }

  // Filtrar por espacio de trabajo
  if (espacioId) {
    if (includeSubspaces) {
      const espacios = await prisma.espacioTrabajo.findMany({
        where: { activo: true },
        select: { id: true, parentId: true },
      });
      const byParent = new Map<string, string[]>();
      for (const espacio of espacios) {
        if (!espacio.parentId) continue;
        const children = byParent.get(espacio.parentId) || [];
        children.push(espacio.id);
        byParent.set(espacio.parentId, children);
      }
      const ids = new Set<string>([espacioId]);
      const stack = [...(byParent.get(espacioId) || [])];
      while (stack.length > 0) {
        const id = stack.pop();
        if (!id || ids.has(id)) continue;
        ids.add(id);
        stack.push(...(byParent.get(id) || []));
      }
      where.espacioId = { in: Array.from(ids) };
    } else {
      where.espacioId = espacioId;
    }
  }

  if (estado) where.estado = { clave: estado };
  if (asignadoId) where.asignaciones = { some: { userId: asignadoId } };
  if (provincia) where.provincia = { contains: provincia, mode: "insensitive" };
  if (equipo) where.equipoAsignado = { contains: equipo, mode: "insensitive" };
  if (prioridad && ["BAJA", "MEDIA", "ALTA", "URGENTE"].includes(prioridad)) where.prioridad = prioridad;
  if (buscar) {
    const searchWhere = {
      OR: [
        { nombre: { contains: buscar, mode: "insensitive" } },
        { codigo: { contains: buscar, mode: "insensitive" } },
        { incidencias: { contains: buscar, mode: "insensitive" } },
        { cue: { contains: buscar, mode: "insensitive" } },
        { direccion: { contains: buscar, mode: "insensitive" } },
        { ciudad: { contains: buscar, mode: "insensitive" } },
        { provincia: { contains: buscar, mode: "insensitive" } },
        { equipoAsignado: { contains: buscar, mode: "insensitive" } },
        { nombreInstitucion: { contains: buscar, mode: "insensitive" } },
      ],
    };
    where.AND = where.AND ? [...where.AND, searchWhere] : [searchWhere];
  }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  if (quick === "sin-gps") {
    const quickWhere = {
      AND: [
        { OR: [{ gpsPredio: null }, { gpsPredio: "" }] },
        { OR: [{ latitud: null }, { longitud: null }] },
      ],
    };
    where.AND = where.AND ? [...where.AND, quickWhere] : [quickWhere];
  } else if (quick === "sin-espacio") {
    where.espacioId = null;
  } else if (quick === "sin-estado") {
    where.estadoId = null;
  } else if (quick === "vencidas") {
    const quickWhere = {
      OR: [
        { fechaHasta: { lt: startOfDay } },
        { fechaProgramada: { lt: startOfDay } },
      ],
    };
    where.AND = where.AND ? [...where.AND, quickWhere] : [quickWhere];
  } else if (quick === "hoy") {
    const quickWhere = {
      OR: [
        { fechaDesde: { lte: endOfDay }, fechaHasta: { gte: startOfDay } },
        { fechaProgramada: { gte: startOfDay, lte: endOfDay } },
      ],
    };
    where.AND = where.AND ? [...where.AND, quickWhere] : [quickWhere];
  }

  const [predios, total] = await Promise.all([
    prisma.predio.findMany({
      where,
      include: {
        estado: { select: { id: true, nombre: true, clave: true, color: true, orden: true } },
        creador: { select: { id: true, nombre: true } },
        asignaciones: {
          select: { id: true, usuario: { select: { id: true, nombre: true } } },
        },
        _count: { select: { comentarios: true, equipos: true } },
      },
      orderBy: [{ prioridad: "desc" }, { updatedAt: "desc" }],
      skip,
      take: limit,
    }),
    prisma.predio.count({ where }),
  ]);

  // Registrar consulta de predios (auditoría) — fire-and-forget
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  prisma.registroAcceso.create({
    data: {
      userId: session.userId,
      accion: "CONSULTA_PREDIO",
      detalle: espacioId ? `Espacio ${espacioId}` : "Vista general de tareas",
      ip,
      metadata: { espacioId: espacioId || null, includeSubspaces, total, buscar: buscar || null, estado: estado || null, provincia: provincia || null, equipo: equipo || null, prioridad: prioridad || null, quick: quick || null },
    },
  }).catch(() => {});

  return NextResponse.json({
    predios,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasMore: skip + predios.length < total,
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const parsed = await parseBody(request, tareaCreateSchema);
    if (isErrorResponse(parsed)) return parsed;
    const { 
      nombre, codigo, direccion, ciudad, tipo, notas, prioridad, 
      asignadoIds, fechaProgramada, estadoId, espacioId,
      incidencias, lacR, cue, ambito, equipoAsignado,
      provincia, cuePredio, gpsPredio, fechaDesde, fechaHasta
    } = parsed;

    const data: any = {
      nombre,
      codigo: codigo || null,
      direccion: direccion || null,
      ciudad: ciudad || null,
      tipo: tipo || null,
      notas: notas || null,
      prioridad: prioridad || "MEDIA",
      fechaProgramada: fechaProgramada ? new Date(fechaProgramada) : null,
      creadorId: session.userId,
      fechaActualizacion: new Date(),
    };

    // Conectar estado si se proporciona
    if (estadoId) data.estadoId = estadoId;

    // Conectar espacio si se proporciona
    if (espacioId) data.espacioId = espacioId;

    // Campos del cronograma
    if (incidencias) data.incidencias = incidencias;
    if (lacR) data.lacR = lacR.toUpperCase();
    if (cue) data.cue = cue;
    if (ambito) data.ambito = ambito;
    if (equipoAsignado) data.equipoAsignado = equipoAsignado.toUpperCase();
    if (provincia) data.provincia = provincia;
    if (cuePredio) data.cuePredio = cuePredio;
    if (gpsPredio) data.gpsPredio = gpsPredio;
    if (fechaDesde) data.fechaDesde = new Date(fechaDesde);
    if (fechaHasta) data.fechaHasta = new Date(fechaHasta);

    const predio = await prisma.predio.create({ data });

    // Asignar usuarios si se proporcionan
    if (asignadoIds && Array.isArray(asignadoIds) && asignadoIds.length > 0) {
      const validUsers = await prisma.user.findMany({
        where: { id: { in: asignadoIds }, activo: true },
        select: { id: true },
      });
      const validIds = validUsers.map((u: { id: string }) => u.id);
      if (validIds.length === 0) {
        return NextResponse.json({ error: "Ningún usuario válido para asignar" }, { status: 400 });
      }
      await prisma.asignacion.createMany({
        data: validIds.map((uid: string) => ({
          tipo: "TAREA",
          userId: uid,
          predioId: predio.id,
        })),
      });

      // Notificar a los asignados
      await prisma.notificacion.createMany({
        data: validIds
          .filter((uid: string) => uid !== session.userId)
          .map((uid: string) => ({
            tipo: "TAREA",
            titulo: `Nueva tarea asignada: ${nombre}`,
            mensaje: `${session.nombre} te asignó la tarea "${nombre}"`,
            userId: uid,
            enlace: "/dashboard/tareas",
            entidad: "PREDIO",
            entidadId: predio.id,
          })),
      });
    }

    await prisma.actividad.create({
      data: {
        accion: "CREAR",
        descripcion: `Tarea "${nombre}" creada`,
        entidad: "PREDIO",
        entidadId: predio.id,
        userId: session.userId,
      },
    });

    return NextResponse.json(predio, { status: 201 });
  } catch (error) {
    console.error("Error creando tarea:", error);
    return NextResponse.json({ error: "Error al crear tarea" }, { status: 500 });
  }
}

// DELETE /api/tareas?ids=id1,id2,...  OR  ?estadoId=xxx — Eliminación masiva (ADMIN)
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const idsRaw = searchParams.get("ids");
  const estadoId = searchParams.get("estadoId");
  const espacioId = searchParams.get("espacioId");

  // Construir where: por IDs explícitos, estadoId o espacioId
  let where: any;
  if (espacioId) {
    where = { espacioId };
  } else if (estadoId) {
    // "sin-estado" = predios sin estado asignado
    where = estadoId === "sin-estado" ? { estadoId: null } : { estadoId };
  } else if (idsRaw) {
    const ids = idsRaw.split(",").map(s => s.trim()).filter(Boolean).slice(0, 500);
    if (ids.length === 0) return NextResponse.json({ error: "IDs requeridos" }, { status: 400 });
    where = { id: { in: ids } };
  } else {
    return NextResponse.json({ error: "IDs, estadoId o espacioId requeridos" }, { status: 400 });
  }

  try {
    const predios = await prisma.predio.findMany({ where });

    // Registrar en papelera
    for (const p of predios) {
      await registrarEnPapelera("PREDIO", p.nombre || p.codigo || "Sin nombre", p as unknown as Record<string, unknown>, session.userId);
    }

    const result = await prisma.predio.deleteMany({ where });

    await prisma.actividad.create({
      data: {
        accion: "ELIMINAR",
        descripcion: `Eliminación masiva: ${result.count} tareas eliminadas`,
        entidad: "PREDIO",
        entidadId: "bulk",
        userId: session.userId,
      },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    console.error("Error en eliminación masiva:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}

// PATCH /api/tareas — Edición masiva (ADMIN/MODERADOR)
// Body: { ids: string[], action: string, value: any }
// Acciones: "estadoId", "espacioId", "equipoAsignado", "provincia", "asignadoIds", "autoProvince", "autoGPS"
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { ids, action, value } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "IDs requeridos" }, { status: 400 });
    }
    if (!action) {
      return NextResponse.json({ error: "Acción requerida" }, { status: 400 });
    }

    // Limitar a 500 IDs por seguridad
    const safeIds = ids.slice(0, 500);
    let count = 0;

    if (action === "autoProvince") {
      // Auto-detectar provincia desde código para todos los seleccionados
      const predios = await prisma.predio.findMany({
        where: { id: { in: safeIds } },
        select: { id: true, nombre: true, codigo: true, provincia: true },
      });
      for (const p of predios) {
        const code = p.codigo || p.nombre || "";
        const detected = detectarProvincia(code);
        if (detected && detected !== p.provincia) {
          await prisma.predio.update({ where: { id: p.id }, data: { provincia: detected } });
          count++;
        }
      }
    } else if (action === "autoGPS") {
      // Auto-parsear gpsPredio → latitud/longitud
      const predios = await prisma.predio.findMany({
        where: { id: { in: safeIds } },
        select: { id: true, gpsPredio: true, latitud: true, longitud: true },
      });
      for (const p of predios) {
        if (p.gpsPredio && (!p.latitud || !p.longitud)) {
          const parts = p.gpsPredio.split(",").map((s: string) => parseFloat(s.trim()));
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            await prisma.predio.update({
              where: { id: p.id },
              data: { latitud: parts[0], longitud: parts[1] },
            });
            count++;
          }
        }
      }
    } else if (action === "asignadoIds") {
      // Asignar usuarios a múltiples predios (sin duplicados)
      console.log("[BULK ASSIGN] value:", JSON.stringify(value), "type:", typeof value, "isArray:", Array.isArray(value));
      if (!Array.isArray(value) || value.length === 0) {
        console.log("[BULK ASSIGN] REJECTED — not array or empty");
        return NextResponse.json({ error: "IDs de usuarios requeridos" }, { status: 400 });
      }
      const validUsers = await prisma.user.findMany({
        where: { id: { in: value }, activo: true },
        select: { id: true },
      });
      const validUserIds = validUsers.map(u => u.id);
      for (const predioId of safeIds) {
        const existing = await prisma.asignacion.findMany({
          where: { predioId },
          select: { userId: true },
        });
        const existingIds = new Set(existing.map(a => a.userId));
        const newIds = validUserIds.filter(uid => !existingIds.has(uid));
        if (newIds.length > 0) {
          await prisma.asignacion.createMany({
            data: newIds.map(uid => ({ tipo: "TAREA", userId: uid, predioId })),
          });
          count++;
        }
      }
    } else if (action === "enFacturacion") {
      // Solo ADMIN puede marcar/desmarcar facturación
      if (session.rol !== "ADMIN") {
        return NextResponse.json({ error: "Solo ADMIN puede mover a facturación" }, { status: 403 });
      }
      const result = await prisma.predio.updateMany({
        where: { id: { in: safeIds } },
        data: { enFacturacion: value === true || value === "true" },
      });
      count = result.count;
    } else if (["estadoId", "espacioId", "equipoAsignado", "provincia", "prioridad", "ambito"].includes(action)) {
      // Actualización directa de un campo
      const result = await prisma.predio.updateMany({
        where: { id: { in: safeIds } },
        data: { [action]: value || null },
      });
      count = result.count;
    } else {
      return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
    }

    try {
      await prisma.actividad.create({
        data: {
          accion: "EDITAR",
          descripcion: `Edición masiva (${action}): ${count} tareas actualizadas`,
          entidad: "PREDIO",
          entidadId: "bulk",
          userId: session.userId,
        },
      });
    } catch { /* no bloquear */ }

    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error("Error en edición masiva:", error);
    return NextResponse.json({ error: "Error al editar" }, { status: 500 });
  }
}
