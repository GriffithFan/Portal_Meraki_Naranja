import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { materializeEstadoVisibility, getEstadoVisibilityForRole } from "@/lib/predioVisibility";

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

  return NextResponse.json(await materializeEstadoVisibility({ permisos, permisosUsuario }));
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

  const { permisos, permisosUsuario, resetUsuarioIds } = body;

  // Restablecer al rol: borrar TODOS los overrides por usuario de esos usuarios
  // (vuelven a heredar la visibilidad del rol). Corrige overrides viejos que
  // tapaban la config del rol.
  if (Array.isArray(resetUsuarioIds) && resetUsuarioIds.length > 0) {
    const ids = resetUsuarioIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
    if (ids.length > 0) {
      await prisma.permisoEstadoUsuario.deleteMany({ where: { userId: { in: ids } } });
    }
  }

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

  // Permisos por usuario individual: se guardan SOLO como override real, es
  // decir cuando difieren de la visibilidad del rol. Si coinciden con el rol,
  // se borran (el usuario hereda el rol). Así un cambio futuro en el rol no
  // queda tapado por overrides redundantes.
  if (Array.isArray(permisosUsuario) && permisosUsuario.length > 0) {
    const userIds = Array.from(new Set(
      permisosUsuario.map((p: any) => p.userId).filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
    ));
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, rol: true } });
    const rolByUser = new Map(users.map((u) => [u.id, u.rol as string]));
    const roleVisCache = new Map<string, Map<string, boolean>>();
    const roleVis = async (rol: string) => {
      if (!roleVisCache.has(rol)) roleVisCache.set(rol, await getEstadoVisibilityForRole(rol));
      return roleVisCache.get(rol)!;
    };

    for (const p of permisosUsuario) {
      if (!p.estadoId || !p.userId || typeof p.visible !== "boolean") continue;
      const rol = rolByUser.get(p.userId);
      if (!rol || rol === "ADMIN") continue; // admin ve todo; no tiene sentido override

      const vis = await roleVis(rol);
      const roleVisible = vis.has(p.estadoId) ? vis.get(p.estadoId)! : true;

      if (p.visible === roleVisible) {
        // Igual al rol → no hace falta override
        await prisma.permisoEstadoUsuario.deleteMany({ where: { estadoId: p.estadoId, userId: p.userId } });
      } else {
        await prisma.permisoEstadoUsuario.upsert({
          where: { estadoId_userId: { estadoId: p.estadoId, userId: p.userId } },
          update: { visible: p.visible },
          create: { estadoId: p.estadoId, userId: p.userId, visible: p.visible },
        });
      }
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

  return NextResponse.json(await materializeEstadoVisibility({ permisos: allPermisos, permisosUsuario: allPermisosUsuario }));
}
