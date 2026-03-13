import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, isModOrAdmin } from '@/lib/auth';

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

  return NextResponse.json({ estados });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { nombre, color, entidad } = body;

    if (!nombre) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
    }

    // Generar clave automáticamente
    const clave = nombre
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    // verificar que no existe
    const existe = await prisma.estadoConfig.findUnique({ where: { clave } });
    if (existe) {
      return NextResponse.json({ error: 'Ya existe un estado con ese nombre' }, { status: 409 });
    }

    // Obtener el orden máximo
    const maxOrden = await prisma.estadoConfig.findFirst({
      where: { entidad: entidad || 'PREDIO' },
      orderBy: { orden: 'desc' },
      select: { orden: true },
    });

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
