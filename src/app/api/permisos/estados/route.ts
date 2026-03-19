import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/permisos/estados — obtener visibilidad de estados por rol
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const permisos = await prisma.permisoEstado.findMany({
    include: { estado: { select: { id: true, nombre: true, color: true, clave: true } } },
    orderBy: [{ estadoId: "asc" }, { rol: "asc" }],
  });

  return NextResponse.json({ permisos });
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

  const { permisos } = body;
  if (!Array.isArray(permisos)) {
    return NextResponse.json({ error: "Se espera un array de permisos" }, { status: 400 });
  }

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

  return NextResponse.json({ permisos: results });
}
