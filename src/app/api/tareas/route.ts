import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { sanitizeSearch } from "@/lib/sanitize";
import { parseBody, isErrorResponse, tareaCreateSchema } from "@/lib/validation";
import { registrarEnPapelera } from "@/lib/papelera";
import { detectarProvincia } from "@/utils/provinciaUtils";
import { getRestrictedSpaceIdsForSession } from "@/lib/spaceAccess";
import { isLegacyEquipoField, normalizeTaskQuickFilter } from "@/utils/taskFieldConfig";
import { appendAndClause, appendVisibleEstadosClause, buildAssignedPredioVisibilityClause, getDelegatedVisibleUserIds, getHiddenEstadoIdsForSession } from "@/lib/predioVisibility";

/* eslint-disable @typescript-eslint/no-explicit-any */

const FIELD_LABELS: Record<string, string> = {
  estadoId: "Estado",
  espacioId: "Espacio",
  asignadoIds: "Asignados",
  replaceAsignadoIds: "Asignados",
  removeAsignadoIds: "Asignados",
  provincia: "Provincia",
  prioridad: "Prioridad",
  ambito: "Ambito",
  enFacturacion: "Facturacion",
  latitud: "Latitud",
  longitud: "Longitud",
};

function displayActivityValue(value: unknown) {
  if (value == null || value === "") return "Sin valor";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Sin asignados";
  if (typeof value === "boolean") return value ? "Si" : "No";
  return String(value);
}

function valuesDiffer(before: unknown, after: unknown) {
  return displayActivityValue(before) !== displayActivityValue(after);
}

function activityValueFor(predio: any, field: string) {
  if (field === "estadoId") return predio.estado?.nombre || null;
  if (field === "espacioId") return predio.espacio?.nombre || null;
  if (["asignadoIds", "replaceAsignadoIds", "removeAsignadoIds"].includes(field)) {
    return (predio.asignaciones || []).map((asignacion: any) => asignacion.usuario?.nombre || asignacion.userId).filter(Boolean);
  }
  return predio[field];
}

function buildBulkChanges(before: any, after: any, fields: string[]) {
  return fields
    .map((field) => {
      const beforeValue = activityValueFor(before, field);
      const afterValue = activityValueFor(after, field);
      if (!valuesDiffer(beforeValue, afterValue)) return null;
      return {
        field,
        label: FIELD_LABELS[field] || field,
        before: displayActivityValue(beforeValue),
        after: displayActivityValue(afterValue),
      };
    })
    .filter(Boolean) as Array<{ field: string; label: string; before: string; after: string }>;
}

function fieldsForBulkAction(action: string) {
  if (["asignadoIds", "replaceAsignadoIds", "removeAsignadoIds"].includes(action)) return [action];
  if (action === "autoProvince") return ["provincia"];
  if (action === "autoGPS") return ["latitud", "longitud"];
  return [action];
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

function mergeCamposConfig(current: unknown, incoming: unknown) {
  const base = Array.isArray(current) ? current : [];
  const next = Array.isArray(incoming) ? incoming : [];
  const byId = new Map<string, any>();
  for (const field of base) {
    if (isLegacyEquipoField(field)) continue;
    if (field?.id && field?.field) byId.set(field.id, field);
  }
  for (const field of next) {
    if (isLegacyEquipoField(field)) continue;
    if (!field?.id || !field?.field) continue;
    if (!byId.has(field.id)) byId.set(field.id, { ...field, visible: field.visible !== false });
  }
  return Array.from(byId.values());
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const buscar = sanitizeSearch(searchParams.get("buscar"));
  const estado = searchParams.get("estado");
  const asignadoId = searchParams.get("asignadoId");
  const espacioId = searchParams.get("espacioId");
  const provincia = sanitizeSearch(searchParams.get("provincia"));
  const prioridad = searchParams.get("prioridad");
  const quick = normalizeTaskQuickFilter(searchParams.get("quick"));
  const groupBy = searchParams.get("groupBy") || "estado";
  const includeSubspaces = searchParams.get("includeSubspaces") === "true";
  const limitParam = searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitParam || "100") || 100, 1), 2000);
  const pageParam = searchParams.get("page");
  const page = Math.max(parseInt(pageParam || "1") || 1, 1);
  const skip = (page - 1) * limit;
  const sortByParam = searchParams.get("sortBy") || "";
  const sortDirParam = searchParams.get("sortDir") === "desc" ? "desc" : "asc";
  const SORTABLE_PREDIO_FIELDS: Record<string, true> = {
    codigo: true, incidencias: true, lacR: true, cue: true, ambito: true,
    provincia: true, ciudad: true, cuePredio: true, tipoRed: true,
    codigoPostal: true, lab: true, nombreInstitucion: true, correo: true,
    orden: true, nombre: true, fechaDesde: true, fechaHasta: true,
    fechaActualizacion: true, updatedAt: true, gpsPredio: true,
    caracteristicaTelefonica: true, telefono: true,
  };
  const orderBy: any = sortByParam && SORTABLE_PREDIO_FIELDS[sortByParam]
    ? [{ [sortByParam]: sortDirParam }]
    : [{ asignaciones: { _count: "desc" } }, { prioridad: "desc" }, { updatedAt: "desc" }];

  const where: any = {};
  const restrictedSpaceIds = await getRestrictedSpaceIdsForSession(session);
  const hiddenEstadoIds = await getHiddenEstadoIdsForSession(session);

  if (restrictedSpaceIds && !espacioId && quick !== "sin-espacio") {
    where.espacioId = { in: restrictedSpaceIds };
  }

  appendVisibleEstadosClause(where, hiddenEstadoIds);

  // Técnicos solo ven tareas asignadas a ellos o a usuarios que les delegaron visibilidad.
  if (!isModOrAdmin(session.rol)) {
    const idsVisibles = await getDelegatedVisibleUserIds(session);
    appendAndClause(where, buildAssignedPredioVisibilityClause(idsVisibles));
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
      const requestedIds = Array.from(ids);
      where.espacioId = restrictedSpaceIds
        ? { in: requestedIds.filter((id) => restrictedSpaceIds.includes(id)) }
        : { in: requestedIds };
    } else {
      where.espacioId = restrictedSpaceIds
        ? { in: restrictedSpaceIds.includes(espacioId) ? [espacioId] : [] }
        : espacioId;
    }
  }

  if (estado) where.estado = { clave: estado };
  const estadoIdParam = searchParams.get("estadoId");
  if (estadoIdParam === "null") {
    where.estadoId = null;
  } else if (estadoIdParam) {
    where.estadoId = estadoIdParam;
  }
  if (asignadoId) where.asignaciones = { some: { userId: asignadoId } };
  if (provincia) where.provincia = { contains: provincia, mode: "insensitive" };
  if (prioridad && ["BAJA", "MEDIA", "ALTA", "URGENTE"].includes(prioridad)) where.prioridad = prioridad;
  if (buscar) {
    const camposExtraMatches = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "Predio"
      WHERE "camposExtra"::text ILIKE ${`%${buscar}%`}
      LIMIT 2000
    `;
    const searchOr: any[] = [
      { nombre: { contains: buscar, mode: "insensitive" } },
      { codigo: { contains: buscar, mode: "insensitive" } },
      { incidencias: { contains: buscar, mode: "insensitive" } },
      { cue: { contains: buscar, mode: "insensitive" } },
      { direccion: { contains: buscar, mode: "insensitive" } },
      { ciudad: { contains: buscar, mode: "insensitive" } },
      { provincia: { contains: buscar, mode: "insensitive" } },
      { nombreInstitucion: { contains: buscar, mode: "insensitive" } },
      { cuePredio: { contains: buscar, mode: "insensitive" } },
      { gpsPredio: { contains: buscar, mode: "insensitive" } },
      { tipoRed: { contains: buscar, mode: "insensitive" } },
      { codigoPostal: { contains: buscar, mode: "insensitive" } },
      { caracteristicaTelefonica: { contains: buscar, mode: "insensitive" } },
      { telefono: { contains: buscar, mode: "insensitive" } },
      { lab: { contains: buscar, mode: "insensitive" } },
      { correo: { contains: buscar, mode: "insensitive" } },
      { ambito: { contains: buscar, mode: "insensitive" } },
      { lacR: { contains: buscar, mode: "insensitive" } },
      { notas: { contains: buscar, mode: "insensitive" } },
      { etiquetas: { some: { etiqueta: { nombre: { contains: buscar, mode: "insensitive" } } } } },
      { asignaciones: { some: { usuario: { nombre: { contains: buscar, mode: "insensitive" } } } } },
    ];
    const camposExtraIds = Array.from(new Set(camposExtraMatches.map((row) => row.id)));
    if (camposExtraIds.length > 0) searchOr.push({ id: { in: camposExtraIds } });

    const searchWhere = {
      OR: searchOr,
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
    where.espacioId = restrictedSpaceIds ? { in: [] } : null;
  } else if (quick === "sin-estado") {
    where.estadoId = null;
  } else if (quick === "sin-asignar") {
    const quickWhere = { asignaciones: { none: {} } };
    where.AND = where.AND ? [...where.AND, quickWhere] : [quickWhere];
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

  // Modo conteo rápido para lazy loading — solo devuelve agrupaciones sin datos de predios
  if (searchParams.get("countOnly") === "true") {
    const counts = await getGroupCounts(where, "estado");
    return NextResponse.json({ groupCounts: counts });
  }

  const [predios, total, groupCounts, espacioSummaryRaw] = await Promise.all([
    prisma.predio.findMany({
      where,
      include: {
        estado: { select: { id: true, nombre: true, clave: true, color: true, icono: true, orden: true } },
        creador: { select: { id: true, nombre: true } },
        asignaciones: {
          select: { id: true, usuario: { select: { id: true, nombre: true } } },
        },
        etiquetas: {
          include: { etiqueta: true },
        },
        _count: { select: { comentarios: true, equipos: true } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.predio.count({ where }),
    getGroupCounts(where, groupBy),
    (buscar && !espacioId) ? prisma.predio.groupBy({
      by: ["espacioId"],
      where,
      _count: { _all: true },
    }) : Promise.resolve([]),
  ]);

  // Registrar consulta de predios (auditoría) — fire-and-forget
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  prisma.registroAcceso.create({
    data: {
      userId: session.userId,
      accion: "CONSULTA_PREDIO",
      detalle: espacioId ? `Espacio ${espacioId}` : "Vista general de tareas",
      ip,
      metadata: { espacioId: espacioId || null, includeSubspaces, total, buscar: buscar || null, estado: estado || null, provincia: provincia || null, prioridad: prioridad || null, quick: quick || null },
    },
  }).catch(() => {});

  let espacioSummary: Record<string, { nombre: string; total: number }> | null = null;
  if (buscar && !espacioId && Array.isArray(espacioSummaryRaw) && espacioSummaryRaw.length > 0) {
    const espacioIds = espacioSummaryRaw.map((e) => e.espacioId).filter(Boolean) as string[];
    const espaciosInfo = await prisma.espacioTrabajo.findMany({
      where: { id: { in: espacioIds } },
      select: { id: true, nombre: true },
    });
    const espacioMap = Object.fromEntries(espaciosInfo.map((e) => [e.id, e.nombre]));
    espacioSummary = Object.fromEntries(
      espacioSummaryRaw.map((row) => [
        row.espacioId || "sin-espacio",
        {
          nombre: espacioMap[row.espacioId!] || "Sin espacio",
          total: row._count._all,
        },
      ])
    );
  }

  return NextResponse.json({
    predios,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasMore: skip + predios.length < total,
    groupCounts,
    ...(espacioSummary && { espacioSummary }),
  });
}

async function getGroupCounts(where: any, groupBy: string) {
  if (groupBy === "estado") {
    const rows = await prisma.predio.groupBy({
      by: ["estadoId"],
      where,
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((row) => [row.estadoId || "sin-estado", row._count._all]));
  }

  const fieldMap: Record<string, "provincia" | "lacR" | "ambito" | "ciudad"> = {
    provincia: "provincia",
    lacR: "lacR",
    ambito: "ambito",
    ciudad: "ciudad",
  };
  const field = fieldMap[groupBy];
  if (!field) return null;

  const rows = await prisma.predio.groupBy({
    by: [field],
    where,
    _count: { _all: true },
  });

  return Object.fromEntries(rows.map((row) => [String(row[field] || (field === "provincia" ? "Sin provincia" : "Sin valor")), row._count._all]));
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
      nombre, codigo, direccion, ciudad, tipo, notas, notasTecnico, prioridad, 
      asignadoIds, fechaProgramada, estadoId, espacioId,
      incidencias, lacR, cue, ambito,
      provincia, cuePredio, gpsPredio, fechaDesde, fechaHasta,
      camposExtra, etiquetas
    } = parsed;

    const data: any = {
      nombre,
      codigo: codigo || null,
      direccion: direccion || null,
      ciudad: ciudad || null,
      tipo: tipo || null,
      notas: notas || null,
      notasTecnico: notasTecnico || null,
      prioridad: prioridad || "MEDIA",
      fechaProgramada: fechaProgramada ? new Date(fechaProgramada) : null,
      creadorId: session.userId,
      fechaActualizacion: new Date(),
      camposExtra: camposExtra && Object.keys(camposExtra).length > 0 ? camposExtra : undefined,
    };

    // Conectar estado si se proporciona
    if (estadoId) data.estadoId = estadoId;

    // Conectar espacio si se proporciona
    if (espacioId) {
      const espacio = await prisma.espacioTrabajo.findFirst({
        where: { id: espacioId, activo: true },
        select: { id: true },
      });
      if (!espacio) {
        return NextResponse.json({ error: "El espacio seleccionado no existe o esta inactivo" }, { status: 400 });
      }
      data.espacioId = espacioId;
    }

    // Campos del cronograma
    if (incidencias) data.incidencias = incidencias;
    if (lacR) data.lacR = lacR.toUpperCase();
    if (cue) data.cue = cue;
    if (ambito) data.ambito = ambito;
    if (provincia) data.provincia = provincia;
    if (cuePredio) data.cuePredio = cuePredio;
    if (gpsPredio) data.gpsPredio = gpsPredio;
    if (fechaDesde) data.fechaDesde = new Date(fechaDesde);
    if (fechaHasta) data.fechaHasta = new Date(fechaHasta);

    const predio = await prisma.predio.create({
      data,
      include: { etiquetas: { include: { etiqueta: true } } },
    });

    if (etiquetas !== undefined) {
      await replacePredioEtiquetas(predio.id, etiquetas);
      predio.etiquetas = await prisma.predioEtiqueta.findMany({
        where: { predioId: predio.id },
        include: { etiqueta: true },
      });
    }

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
    if (error && typeof error === "object" && "code" in error) {
      const code = (error as { code?: string }).code;
      if (code === "P2002") {
        return NextResponse.json({ error: "Ya existe una tarea con ese codigo" }, { status: 409 });
      }
      if (code === "P2003") {
        return NextResponse.json({ error: "Alguna referencia de la tarea no existe" }, { status: 400 });
      }
    }
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
    const predios = await prisma.predio.findMany({
      where,
      include: { asignaciones: { select: { userId: true, tipo: true, notas: true } } },
    });

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
// Acciones: "estadoId", "espacioId", "provincia", "asignadoIds", "replaceAsignadoIds", "removeAsignadoIds", "autoProvince", "autoGPS"
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
    const beforePredios = await prisma.predio.findMany({
      where: { id: { in: safeIds } },
      include: {
        estado: { select: { id: true, nombre: true } },
        espacio: { select: { id: true, nombre: true } },
        asignaciones: { include: { usuario: { select: { id: true, nombre: true } } } },
      },
    });
    const beforeById = new Map(beforePredios.map((predio) => [predio.id, predio]));

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
    } else if (["asignadoIds", "replaceAsignadoIds", "removeAsignadoIds"].includes(action)) {
      // Gestionar asignados en múltiples predios: agregar, reemplazar o quitar.
      if (!Array.isArray(value) || value.length === 0) {
        return NextResponse.json({ error: "IDs de usuarios requeridos" }, { status: 400 });
      }
      const validUsers = await prisma.user.findMany({
        where: { id: { in: value }, activo: true },
        select: { id: true, nombre: true },
      });
      const validUserIds = validUsers.map(u => u.id);
      if (validUserIds.length === 0) {
        return NextResponse.json({ error: "Ningún usuario válido" }, { status: 400 });
      }

      for (const predioId of safeIds) {
        const existing = await prisma.asignacion.findMany({
          where: { predioId },
          select: { userId: true },
        });
        const existingUserIds = existing.map(a => a.userId);
        const existingIds = new Set(existingUserIds);

        if (action === "asignadoIds") {
          const newIds = validUserIds.filter(uid => !existingIds.has(uid));
          if (newIds.length === 0) continue;
          await prisma.asignacion.createMany({
            data: newIds.map(uid => ({ tipo: "TAREA", userId: uid, predioId })),
          });
          count++;
        } else if (action === "replaceAsignadoIds") {
          const sameIds = existingUserIds.length === validUserIds.length && validUserIds.every((uid) => existingIds.has(uid));
          if (sameIds) continue;
          await prisma.$transaction(async (tx) => {
            await tx.asignacion.deleteMany({ where: { predioId } });
            await tx.asignacion.createMany({
              data: validUserIds.map(uid => ({ tipo: "TAREA", userId: uid, predioId })),
            });
          });
          count++;
        } else if (action === "removeAsignadoIds") {
          const removeIds = validUserIds.filter(uid => existingIds.has(uid));
          if (removeIds.length === 0) continue;
          await prisma.asignacion.deleteMany({ where: { predioId, userId: { in: removeIds } } });
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
    } else if (action === "espacioId") {
      const moveOptions = value && typeof value === "object" && !Array.isArray(value) ? value : null;
      const nextEspacioId = moveOptions ? moveOptions.espacioId : value;
      const keepCamposExtra = moveOptions?.keepCamposExtra !== false;
      const updateData: any = { espacioId: nextEspacioId || null };
      if (!keepCamposExtra) updateData.camposExtra = null;
      const result = await prisma.predio.updateMany({
        where: { id: { in: safeIds } },
        data: updateData,
      });
      count = result.count;
      if (nextEspacioId && moveOptions?.addCamposToTarget && Array.isArray(moveOptions.camposConfig) && moveOptions.camposConfig.length > 0) {
        const target = await prisma.espacioTrabajo.findUnique({
          where: { id: nextEspacioId },
          select: { camposConfig: true },
        });
        if (target) {
          await prisma.espacioTrabajo.update({
            where: { id: nextEspacioId },
            data: { camposConfig: mergeCamposConfig(target.camposConfig, moveOptions.camposConfig) },
          });
        }
      }
    } else if (["estadoId", "provincia", "prioridad", "ambito"].includes(action)) {
      // Actualización directa de un campo
      const nextValue = value || null;
      const result = await prisma.predio.updateMany({
        where: { id: { in: safeIds } },
        data: { [action]: nextValue },
      });
      count = result.count;
    } else {
      return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
    }

    try {
      const afterPredios = await prisma.predio.findMany({
        where: { id: { in: safeIds } },
        include: {
          estado: { select: { id: true, nombre: true } },
          espacio: { select: { id: true, nombre: true } },
          asignaciones: { include: { usuario: { select: { id: true, nombre: true } } } },
        },
      });
      const detailFields = fieldsForBulkAction(action);
      const detailedActivities = afterPredios
        .map((afterPredio) => {
          const beforePredio = beforeById.get(afterPredio.id);
          if (!beforePredio) return null;
          const changes = buildBulkChanges(beforePredio, afterPredio, detailFields);
          if (changes.length === 0) return null;
          return {
            accion: "EDITAR",
            descripcion: changes.map((change) => `${change.label}: ${change.before} -> ${change.after}`).join("; "),
            entidad: "PREDIO",
            entidadId: afterPredio.id,
            userId: session.userId,
            metadata: {
              bulkAction: action,
              bulkValue: value,
              changes,
            },
          };
        })
        .filter(Boolean) as Array<{
          accion: string;
          descripcion: string;
          entidad: string;
          entidadId: string;
          userId: string;
          metadata: any;
        }>;

      if (detailedActivities.length > 0) {
        await prisma.actividad.createMany({ data: detailedActivities });
      }

      await prisma.actividad.create({
        data: {
          accion: "EDITAR",
          descripcion: `Edición masiva (${action}): ${count} tareas actualizadas`,
          entidad: "PREDIO",
          entidadId: "bulk",
          userId: session.userId,
          metadata: {
            action,
            value,
            count,
            detailedActivities: detailedActivities.length,
          },
        },
      });
    } catch { /* no bloquear */ }

    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error("Error en edición masiva:", error);
    return NextResponse.json({ error: "Error al editar" }, { status: 500 });
  }
}
