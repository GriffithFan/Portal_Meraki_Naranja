import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

// GET /api/config-vista?clave=col-config-tareas
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const clave = request.nextUrl.searchParams.get("clave");
  if (!clave) return NextResponse.json({ error: "Falta clave" }, { status: 400 });

  const config = await prisma.configuracionVista.findUnique({ where: { clave } });
  if (!config) return NextResponse.json(null);

  return NextResponse.json(config);
}

// PUT /api/config-vista — Solo ADMIN/MOD pueden guardar
// Body: { clave: string, config: Array<{id, visible, order, width}> }
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  let body: { clave?: string; config?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { clave, config } = body;
  if (!clave || !config || !Array.isArray(config))
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const result = await prisma.configuracionVista.upsert({
    where: { clave },
    update: { config: config as Prisma.InputJsonValue, updatedBy: session.userId },
    create: { clave, config: config as Prisma.InputJsonValue, updatedBy: session.userId },
  });

  return NextResponse.json(result);
}
