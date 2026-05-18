import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const MAX_VIEWS = 20;
const CONFIG_PREFIX = "tareas-vistas";

function cleanString(value: unknown, fallback = "", max = 120) {
  return String(value ?? fallback).trim().slice(0, max);
}

function cleanScope(value: unknown) {
  return cleanString(value, "general", 80).replace(/[^a-zA-Z0-9_-]/g, "-") || "general";
}

function normalizeFilters(value: unknown) {
  const source = typeof value === "object" && value ? value as Record<string, unknown> : {};
  return {
    filterEstado: cleanString(source.filterEstado, "todos", 80) || "todos",
    filterProvincia: cleanString(source.filterProvincia, "", 80),
    filterEquipo: cleanString(source.filterEquipo, "", 80),
    filterPrioridad: cleanString(source.filterPrioridad, "todas", 30) || "todas",
    quickFilter: cleanString(source.quickFilter, "todos", 40) || "todos",
    groupBy: cleanString(source.groupBy, "estado", 40) || "estado",
    includeSubspaces: source.includeSubspaces !== false,
  };
}

function normalizeSort(value: unknown) {
  const source = typeof value === "object" && value ? value as Record<string, unknown> : null;
  if (!source) return null;
  const field = cleanString(source.field, "", 80);
  const dir = source.dir === "desc" ? "desc" : source.dir === "asc" ? "asc" : null;
  if (!field || !dir) return null;
  return { field, dir };
}

function normalizeColumns(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((item, index) => {
    const source = typeof item === "object" && item ? item as Record<string, unknown> : {};
    const id = cleanString(source.id, "", 100);
    if (!id) return null;
    const width = Number(source.width);
    return {
      id,
      visible: source.visible !== false,
      order: Number.isFinite(Number(source.order)) ? Number(source.order) : index,
      ...(Number.isFinite(width) ? { width: Math.max(40, Math.min(width, 600)) } : {}),
    };
  }).filter(Boolean);
}

function normalizeViews(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_VIEWS).map((item: unknown) => {
    const source = typeof item === "object" && item ? item as Record<string, unknown> : {};
    return {
      id: cleanString(source.id, randomUUID(), 100) || randomUUID(),
      name: cleanString(source.name, "Vista", 60) || "Vista",
      search: cleanString(source.search, "", 160),
      filters: normalizeFilters(source.filters),
      sortConfig: normalizeSort(source.sortConfig),
      columns: normalizeColumns(source.columns),
      updatedAt: cleanString(source.updatedAt, new Date().toISOString(), 40) || new Date().toISOString(),
    };
  });
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const scope = cleanScope(new URL(request.url).searchParams.get("scope"));
  const saved = await prisma.configuracionVista.findUnique({
    where: { clave: `${CONFIG_PREFIX}-${session.userId}-${scope}` },
    select: { config: true, updatedAt: true },
  });

  return NextResponse.json({ views: saved ? normalizeViews(saved.config) : [], scope, updatedAt: saved?.updatedAt || null });
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

  const source = typeof body === "object" && body ? body as Record<string, unknown> : {};
  const scope = cleanScope(source.scope);
  const views = normalizeViews(source.views);

  const result = await prisma.configuracionVista.upsert({
    where: { clave: `${CONFIG_PREFIX}-${session.userId}-${scope}` },
    update: { config: views as Prisma.InputJsonValue, updatedBy: session.userId },
    create: { clave: `${CONFIG_PREFIX}-${session.userId}-${scope}`, config: views as Prisma.InputJsonValue, updatedBy: session.userId },
  });

  return NextResponse.json({ ok: true, scope, views, updatedAt: result.updatedAt });
}
