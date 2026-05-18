import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";

const ROLES_VALIDOS = new Set(["MODERADOR", "TECNICO"]);

// GET /api/accesos-espacio — Listar todos los accesos (ADMIN only)
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const scope = request.nextUrl.searchParams.get("scope");

  const accesos = await prisma.accesoEspacio.findMany({
    include: {
      user: { select: { id: true, nombre: true, email: true, rol: true } },
      espacio: { select: { id: true, nombre: true, parentId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (scope === "all") {
    const accesosRol = await prisma.accesoEspacioRol.findMany({
      include: {
        espacio: { select: { id: true, nombre: true, parentId: true } },
      },
      orderBy: [{ rol: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ accesos, accesosRol });
  }

  return NextResponse.json(accesos);
}

// POST /api/accesos-espacio — Crear/actualizar accesos de un usuario
// Body: { userId: string, espacioIds: string[] }
// Reemplaza todos los accesos del usuario con los nuevos
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  let body: { userId?: string; rol?: string; espacioIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { userId, rol, espacioIds } = body;
  if ((!userId && !rol) || !Array.isArray(espacioIds)) {
    return NextResponse.json({ error: "userId/rol y espacioIds requeridos" }, { status: 400 });
  }

  if (rol && !ROLES_VALIDOS.has(rol)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // Verificar que los espacios existen
  if (espacioIds.length > 0) {
    const count = await prisma.espacioTrabajo.count({
      where: { id: { in: espacioIds }, activo: true },
    });
    if (count !== espacioIds.length) {
      return NextResponse.json({ error: "Algunos espacios no existen" }, { status: 400 });
    }
  }

  if (rol) {
    await prisma.$transaction([
      prisma.accesoEspacioRol.deleteMany({ where: { rol: rol as "MODERADOR" | "TECNICO" } }),
      ...(espacioIds.length > 0
        ? [
            prisma.accesoEspacioRol.createMany({
              data: espacioIds.map((espacioId) => ({ rol: rol as "MODERADOR" | "TECNICO", espacioId })),
            }),
          ]
        : []),
    ]);

    const nuevosAccesosRol = await prisma.accesoEspacioRol.findMany({
      where: { rol: rol as "MODERADOR" | "TECNICO" },
      include: { espacio: { select: { id: true, nombre: true } } },
    });

    return NextResponse.json({
      message: espacioIds.length > 0
        ? `${espacioIds.length} acceso(s) configurados para ${rol}`
        : `${rol} sin restricciones por rol`,
      accesosRol: nuevosAccesosRol,
    });
  }

  // Transacción: borrar accesos actuales y crear nuevos
  await prisma.$transaction([
    prisma.accesoEspacio.deleteMany({ where: { userId: userId! } }),
    ...(espacioIds.length > 0
      ? [
          prisma.accesoEspacio.createMany({
            data: espacioIds.map((espacioId) => ({ userId: userId!, espacioId })),
          }),
        ]
      : []),
  ]);

  // Retornar accesos actualizados
  const nuevosAccesos = await prisma.accesoEspacio.findMany({
    where: { userId: userId! },
    include: {
      espacio: { select: { id: true, nombre: true } },
    },
  });

  return NextResponse.json({
    message: espacioIds.length > 0
      ? `${espacioIds.length} acceso(s) configurados`
      : "Acceso sin restricciones (ve todos los espacios)",
    accesos: nuevosAccesos,
  });
}

// DELETE /api/accesos-espacio?userId=xxx|rol=TECNICO — Quitar restricciones
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const userId = new URL(request.url).searchParams.get("userId");
  const rol = new URL(request.url).searchParams.get("rol");
  if (!userId && !rol)
    return NextResponse.json({ error: "userId o rol requerido" }, { status: 400 });

  if (rol) {
    if (!ROLES_VALIDOS.has(rol)) return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    await prisma.accesoEspacioRol.deleteMany({ where: { rol: rol as "MODERADOR" | "TECNICO" } });
    return NextResponse.json({ message: `${rol} sin restricciones por rol` });
  }

  await prisma.accesoEspacio.deleteMany({ where: { userId: userId! } });

  return NextResponse.json({ message: "Restricciones eliminadas, el usuario ve todos los espacios" });
}
