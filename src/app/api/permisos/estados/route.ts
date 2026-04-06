import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/permisos/estados — obtener visibilidad de estados por rol + por usuario
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const permisos = await prisma.permisoEstado.findMany({
    include: { estado: { select: { id: true, nombre: true, color: true, clave: true } } },
    orderBy: [{ estadoId: "asc" }, { rol: "asc" }],
  });

  // Permisos por usuario individual
  const permisosUsuario = await prisma.permisoEstadoUsuario.findMany({
    include: {
      estado: { select: { id: true, nombre: true, color: true, clave: true } },
      user: { select: { id: true, nombre: true } },
    },
    orderBy: [{ userId: "asc" }, { estadoId: "asc" }],
  });

  return NextResponse.json({ permisos, permisosUsuario });
}

// PUT /api/permisos/estados — actualizar visibilidad (solo ADMIN)
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.rol !== "ADMIN")
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { permisos, permisosUsuario } = body;

  // Permisos por rol (existente)
  if (Array.isArray(permisos)) {
    const ROLES_VALIDOS = ["MODERADOR", "TECNICO"];
    const results = [];

    for (const p of permisos) {
      if (!p.estadoId || !ROLES_VALIDOS.includes(p.rol)) continue;
      if (typeof p.visible !== "boolean") continue;

      const result = await prisma.permisoEstado.upsert({
        where: { estadoId_rol: { estadoId: p.estadoId, rol: p.rol as "MODERADOR" | "TECNICO" } },
        update: { visible: p.visible },
        create: {
          estadoId: p.estadoId,
          rol: p.rol as "MODERADOR" | "TECNICO",
          visible: p.visible,
        },
      });
      results.push(result);
    }
  }

  // Permisos por usuario individual (nuevo)
  if (Array.isArray(permisosUsuario)) {
    for (const p of permisosUsuario) {
      if (!p.estadoId || !p.userId || typeof p.visible !== "boolean") continue;

      await prisma.permisoEstadoUsuario.upsert({
        where: { estadoId_userId: { estadoId: p.estadoId, userId: p.userId } },
        update: { visible: p.visible },
        create: {
          estadoId: p.estadoId,
          userId: p.userId,
          visible: p.visible,
        },
      });
    }
  }

  // Devolver todos los permisos actualizados
  const allPermisos = await prisma.permisoEstado.findMany({
    include: { estado: { select: { id: true, nombre: true, color: true, clave: true } } },
    orderBy: [{ estadoId: "asc" }, { rol: "asc" }],
  });
  const allPermisosUsuario = await prisma.permisoEstadoUsuario.findMany({
    include: {
      estado: { select: { id: true, nombre: true, color: true, clave: true } },
      user: { select: { id: true, nombre: true } },
    },
    orderBy: [{ userId: "asc" }, { estadoId: "asc" }],
  });

  return NextResponse.json({ permisos: allPermisos, permisosUsuario: allPermisosUsuario });
}
