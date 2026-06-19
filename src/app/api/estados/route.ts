import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, isModOrAdmin } from '@/lib/auth';
import { parseBody, isErrorResponse, estadoCreateSchema } from '@/lib/validation';
import { withPrivateCatalogCache } from '@/lib/cacheHeaders';
import { getHiddenEstadoIdsForSession } from '@/lib/predioVisibility';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const entidad = searchParams.get('entidad') || 'PREDIO';

  const estados = await prisma.estadoConfig.findMany({
    where: { entidad, activo: true },
    orderBy: { orden: 'asc' },
  });

  const hiddenEstadoIds = await getHiddenEstadoIdsForSession(session, entidad);
  const visibles = hiddenEstadoIds.length > 0
    ? estados.filter((estado) => !hiddenEstadoIds.includes(estado.id))
    : estados;

  return withPrivateCatalogCache(NextResponse.json({ estados: visibles }));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  try {
    const parsed = await parseBody(request, estadoCreateSchema);
    if (isErrorResponse(parsed)) return parsed;
    const { nombre, color, entidad } = parsed;

    // Generar clave automáticamente
    const clave = nombre
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    // Obtener el orden máximo (para ubicar el nuevo al final)
    const maxOrden = await prisma.estadoConfig.findFirst({
      where: { entidad: entidad || 'PREDIO' },
      orderBy: { orden: 'desc' },
      select: { orden: true },
    });

    // Verificar si ya existe esa clave. El borrado es soft-delete (activo:false),
    // así que si existe pero está inactivo, lo reactivamos en vez de fallar.
    const existe = await prisma.estadoConfig.findUnique({ where: { clave } });
    if (existe) {
      if (existe.activo) {
        return NextResponse.json({ error: 'Ya existe un estado con ese nombre' }, { status: 409 });
      }
      const reactivado = await prisma.estadoConfig.update({
        where: { clave },
        data: {
          activo: true,
          nombre,
          color: color || existe.color || '#3b82f6',
          orden: (maxOrden?.orden ?? -1) + 1,
        },
      });
      return NextResponse.json(reactivado, { status: 200 });
    }

    const estado = await prisma.estadoConfig.create({
      data: {
        nombre,
        clave,
        color: color || '#3b82f6',
        entidad: entidad || 'PREDIO',
        orden: (maxOrden?.orden ?? -1) + 1,
      },
    });

    return NextResponse.json(estado, { status: 201 });
  } catch (error) {
    console.error('Error creando estado:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// Reordenar estados (array de IDs en nuevo orden)
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const ids: string[] = body.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Se requiere array de IDs' }, { status: 400 });
    }

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.estadoConfig.update({
          where: { id },
          data: { orden: index },
        })
      )
    );

    const estados = await prisma.estadoConfig.findMany({
      where: { activo: true },
      orderBy: { orden: 'asc' },
    });

    return NextResponse.json({ estados });
  } catch (error) {
    console.error('Error reordenando estados:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
