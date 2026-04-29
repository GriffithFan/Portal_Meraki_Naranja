import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const DEFAULT_CONFIG = {
  filterEstado: "todos",
  filterProvincia: "",
  filterEquipo: "",
  filterPrioridad: "todas",
  quickFilter: "todos",
  groupBy: "estado",
};

function normalizeConfig(value: unknown) {
  const input = typeof value === "object" && value ? value as Record<string, unknown> : {};
  return {
    filterEstado: String(input.filterEstado || DEFAULT_CONFIG.filterEstado).slice(0, 80),
    filterProvincia: String(input.filterProvincia || DEFAULT_CONFIG.filterProvincia).slice(0, 80),
    filterEquipo: String(input.filterEquipo || DEFAULT_CONFIG.filterEquipo).slice(0, 80),
    filterPrioridad: String(input.filterPrioridad || DEFAULT_CONFIG.filterPrioridad).slice(0, 20),
    quickFilter: String(input.quickFilter || DEFAULT_CONFIG.quickFilter).slice(0, 40),
    groupBy: String(input.groupBy || DEFAULT_CONFIG.groupBy).slice(0, 40),
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const saved = await prisma.configuracionVista.findUnique({
    where: { clave: `tareas-filtros-${session.userId}` },
    select: { config: true, updatedAt: true },
  });

  return NextResponse.json({ config: saved ? normalizeConfig(saved.config) : DEFAULT_CONFIG, updatedAt: saved?.updatedAt || null });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const config = normalizeConfig(body);
  const result = await prisma.configuracionVista.upsert({
    where: { clave: `tareas-filtros-${session.userId}` },
    update: { config: config as Prisma.InputJsonValue, updatedBy: session.userId },
    create: { clave: `tareas-filtros-${session.userId}`, config: config as Prisma.InputJsonValue, updatedBy: session.userId },
  });

  return NextResponse.json({ ok: true, updatedAt: result.updatedAt });
}