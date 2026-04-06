import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";

// GET /api/accesos-espacio — Listar todos los accesos (ADMIN only)
export async function GET() {
  const session = await getSession();
  if (!session || !isAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const accesos = await prisma.accesoEspacio.findMany({
    include: {
      user: { select: { id: true, nombre: true, email: true, rol: true } },
      espacio: { select: { id: true, nombre: true, parentId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(accesos);
}

// POST /api/accesos-espacio — Crear/actualizar accesos de un usuario
// Body: { userId: string, espacioIds: string[] }
// Reemplaza todos los accesos del usuario con los nuevos
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  let body: { userId?: string; espacioIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { userId, espacioIds } = body;
  if (!userId || !Array.isArray(espacioIds)) {
    return NextResponse.json({ error: "userId y espacioIds requeridos" }, { status: 400 });
  }

  // Verificar que el usuario existe
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  // Verificar que los espacios existen
  if (espacioIds.length > 0) {
    const count = await prisma.espacioTrabajo.count({
      where: { id: { in: espacioIds }, activo: true },
    });
    if (count !== espacioIds.length) {
      return NextResponse.json({ error: "Algunos espacios no existen" }, { status: 400 });
    }
  }

  // Transacción: borrar accesos actuales y crear nuevos
  await prisma.$transaction([
    prisma.accesoEspacio.deleteMany({ where: { userId } }),
    ...(espacioIds.length > 0
      ? [
          prisma.accesoEspacio.createMany({
            data: espacioIds.map((espacioId) => ({ userId, espacioId })),
          }),
        ]
      : []),
  ]);

  // Retornar accesos actualizados
  const nuevosAccesos = await prisma.accesoEspacio.findMany({
    where: { userId },
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

// DELETE /api/accesos-espacio?userId=xxx — Quitar todas las restricciones de un usuario
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId)
    return NextResponse.json({ error: "userId requerido" }, { status: 400 });

  await prisma.accesoEspacio.deleteMany({ where: { userId } });

  return NextResponse.json({ message: "Restricciones eliminadas, el usuario ve todos los espacios" });
}
