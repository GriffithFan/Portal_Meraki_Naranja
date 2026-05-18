import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin, isModOrAdmin } from "@/lib/auth";
import { espacioSchema, parseBody, isErrorResponse } from "@/lib/validation";
import { equipoFilter } from "@/utils/equipoUtils";
import { withPrivateCatalogCache } from "@/lib/cacheHeaders";
import { getRestrictedSpaceIdsForSession } from "@/lib/spaceAccess";

/* eslint-disable @typescript-eslint/no-explicit-any */

function estadoClave(nombre: string) {
  return nombre
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

async function ensureEstados(nuevosEstados: Array<{ nombre: string; color?: string | null }> = []) {
  const ids: string[] = [];
  for (const item of nuevosEstados) {
    const nombre = item.nombre?.trim();
    if (!nombre) continue;
    const clave = estadoClave(nombre);
    if (!clave) continue;

    const existing = await prisma.estadoConfig.findUnique({ where: { clave } });
    if (existing) {
      if (!existing.activo) {
        const restored = await prisma.estadoConfig.update({ where: { id: existing.id }, data: { activo: true } });
        ids.push(restored.id);
      } else {
        ids.push(existing.id);
      }
      continue;
    }

    const maxOrden = await prisma.estadoConfig.findFirst({
      where: { entidad: "PREDIO" },
      orderBy: { orden: "desc" },
      select: { orden: true },
    });
    const estado = await prisma.estadoConfig.create({
      data: {
        nombre,
        clave,
        color: item.color || "#3b82f6",
        entidad: "PREDIO",
        orden: (maxOrden?.orden ?? -1) + 1,
      },
    });
    ids.push(estado.id);
  }
  return ids;
}

// GET /api/espacios — Listar árbol de espacios con conteos
export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const espacios = await prisma.espacioTrabajo.findMany({
    where: { activo: true },
    include: {
      _count: { select: { predios: true, hijos: true } },
    },
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
  });

  // Filtrar por acceso del usuario/rol (ADMIN siempre ve todo)
  let espaciosFiltrados = espacios;
  if (!isAdmin(session.rol)) {
    const allowedSpaceIds = await getRestrictedSpaceIdsForSession(session);
    if (allowedSpaceIds) {
      const idsPermitidos = new Set(allowedSpaceIds);
      for (const e of espacios) {
        if (!idsPermitidos.has(e.id)) continue;
        let parentId = e.parentId;
        while (parentId) {
          idsPermitidos.add(parentId);
          parentId = espacios.find((parent) => parent.id === parentId)?.parentId || null;
        }
      }
      espaciosFiltrados = espacios.filter(e => idsPermitidos.has(e.id));
    } else {
    const accesos = await prisma.accesoEspacio.findMany({
      where: { userId: session.userId },
      select: { espacioId: true },
    });

    if (accesos.length > 0) {
      // Whitelist explícita (configurada por admin)
      const idsPermitidos = new Set(accesos.map(a => a.espacioId));

      // Incluir también los padres de los espacios permitidos para mantener el árbol
      for (const e of espacios) {
        if (idsPermitidos.has(e.id) && e.parentId) {
          idsPermitidos.add(e.parentId);
        }
      }

      espaciosFiltrados = espacios.filter(e => idsPermitidos.has(e.id));
    } else if (!isModOrAdmin(session.rol)) {
      // TECNICOs sin whitelist: solo ven espacios donde tienen predios asignados
      const prediosAsignados = await prisma.predio.findMany({
        where: {
          OR: [
            { asignaciones: { some: { userId: session.userId } } },
            { equipoAsignado: equipoFilter(session.nombre) },
          ],
        },
        select: { espacioId: true },
        distinct: ["espacioId"],
      });

      const idsConPredios = new Set(
        prediosAsignados.map(p => p.espacioId).filter(Boolean) as string[]
      );

      // Incluir padres para mantener el árbol
      for (const e of espacios) {
        if (idsConPredios.has(e.id) && e.parentId) {
          idsConPredios.add(e.parentId);
        }
      }

      espaciosFiltrados = espacios.filter(e => idsConPredios.has(e.id));
    }
    // MODERADORs sin whitelist: ven todo (no se filtra)
    }
  }

  // Construir árbol
  const map = new Map<string, any>();
  const roots: any[] = [];

  for (const e of espaciosFiltrados) {
    map.set(e.id, { ...e, children: [] });
  }

  for (const e of espaciosFiltrados) {
    const node = map.get(e.id);
    if (e.parentId && map.has(e.parentId)) {
      map.get(e.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }

  return withPrivateCatalogCache(NextResponse.json({ espacios: roots }));
}

// POST /api/espacios — Crear espacio
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  try {
    const data = await parseBody(request, espacioSchema);
    if (isErrorResponse(data)) return data;

    const { nombre, descripcion, color, icono, parentId, camposConfig, estadosConfig, nuevosEstados } = data;
    const ownCamposConfig = Array.isArray(camposConfig) ? camposConfig : [];
    const nuevosEstadoIds = await ensureEstados(nuevosEstados || []);
    const selectedEstadoIds = Array.isArray((estadosConfig as any)?.estadoIds) ? (estadosConfig as any).estadoIds : [];
    const finalEstadoIds = Array.from(new Set([...selectedEstadoIds, ...nuevosEstadoIds].filter(Boolean)));

    // Calcular siguiente orden
    const maxOrden = await prisma.espacioTrabajo.aggregate({
      where: { parentId: parentId || null },
      _max: { orden: true },
    });

    const espacio = await prisma.espacioTrabajo.create({
      data: {
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        color: color || "#3b82f6",
        icono: icono || "folder",
        parentId: parentId || null,
        orden: (maxOrden._max.orden ?? -1) + 1,
        creadorId: session.userId,
        camposConfig: ownCamposConfig,
        estadosConfig: { estadoIds: finalEstadoIds },
      } as any,
    });

    return NextResponse.json(espacio, { status: 201 });
  } catch (error) {
    console.error("Error creando espacio:", error);
    return NextResponse.json({ error: "Error al crear espacio" }, { status: 500 });
  }
}
