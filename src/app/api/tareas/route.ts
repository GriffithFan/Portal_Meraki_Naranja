import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { sanitizeSearch } from "@/lib/sanitize";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const buscar = sanitizeSearch(searchParams.get("buscar"));
  const estado = searchParams.get("estado");
  const asignadoId = searchParams.get("asignadoId");
  const espacioId = searchParams.get("espacioId");
  const limitParam = searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitParam || "100") || 100, 1), 2000);

  const where: any = {};

  // Técnicos solo ven sus propias tareas + las de usuarios que les delegaron acceso
  if (!isModOrAdmin(session.rol)) {
    const delegaciones = await prisma.delegacion.findMany({
      where: { delegadoId: session.userId, activo: true },
      select: { delegadorId: true },
    });
    const idsVisibles = [session.userId, ...delegaciones.map(d => d.delegadorId)];

    where.OR = [
      { asignaciones: { some: { userId: { in: idsVisibles } } } },
      { creadorId: { in: idsVisibles } },
    ];
  }

  // Filtrar por espacio de trabajo
  if (espacioId) {
    where.espacioId = espacioId;
  }

  if (estado) where.estado = { clave: estado };
  if (asignadoId) where.asignaciones = { some: { userId: asignadoId } };
  if (buscar) {
    const searchWhere = {
      OR: [
        { nombre: { contains: buscar, mode: "insensitive" } },
        { codigo: { contains: buscar, mode: "insensitive" } },
        { direccion: { contains: buscar, mode: "insensitive" } },
        { ciudad: { contains: buscar, mode: "insensitive" } },
      ],
    };
    where.AND = where.AND ? [...where.AND, searchWhere] : [searchWhere];
  }

  const [predios, total] = await Promise.all([
    prisma.predio.findMany({
      where,
      include: {
        estado: true,
        creador: { select: { id: true, nombre: true } },
        asignaciones: {
          include: { usuario: { select: { id: true, nombre: true } } },
        },
        _count: { select: { comentarios: true, equipos: true } },
      },
      orderBy: [{ prioridad: "desc" }, { updatedAt: "desc" }],
      take: limit,
    }),
    prisma.predio.count({ where }),
  ]);

  return NextResponse.json({ predios, total });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { 
      nombre, codigo, direccion, ciudad, tipo, notas, prioridad, 
      asignadoIds, fechaProgramada, estadoId, espacioId,
      // Campos del cronograma SF 2026
      incidencias, lacR, cue, ambito, equipoAsignado,
      provincia, cuePredio, gpsPredio, fechaDesde, fechaHasta
    } = body;

    if (!nombre) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    }

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
