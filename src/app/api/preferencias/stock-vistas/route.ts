import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const MAX_VIEWS = 20;
const MAX_FILTER_VALUES = 30;
const CONFIG_PREFIX = "stock-vistas";

type SavedViewInput = Record<string, unknown>;

function cleanString(value: unknown, fallback = "", max = 120) {
  return String(value ?? fallback).trim().slice(0, max);
}

function normalizeFilters(value: unknown) {
  const source = typeof value === "object" && value ? value as Record<string, unknown> : {};
  const result: Record<string, string[]> = {};
  for (const [key, rawValues] of Object.entries(source)) {
    const cleanKey = cleanString(key, "", 50);
    if (!cleanKey || !Array.isArray(rawValues)) continue;
    const values = rawValues
      .map((item) => cleanString(item, "", 100))
      .filter(Boolean)
      .slice(0, MAX_FILTER_VALUES);
    if (values.length > 0) result[cleanKey] = Array.from(new Set(values));
  }
  return result;
}

function normalizeSort(value: unknown) {
  const source = typeof value === "object" && value ? value as Record<string, unknown> : null;
  if (!source) return null;
  const field = cleanString(source.field, "", 50);
  const dir = source.dir === "desc" ? "desc" : source.dir === "asc" ? "asc" : null;
  if (!field || !dir) return null;
  return { field, dir };
}

function normalizeColumns(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 80).map((item, index) => {
    const source = typeof item === "object" && item ? item as Record<string, unknown> : {};
    const id = cleanString(source.id, "", 80);
    if (!id) return null;
    return {
      id,
      visible: source.visible !== false,
      order: Number.isFinite(Number(source.order)) ? Number(source.order) : index,
    };
  }).filter(Boolean);
}

function normalizeViews(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_VIEWS).map((item: unknown) => {
    const source = typeof item === "object" && item ? item as SavedViewInput : {};
    const name = cleanString(source.name, "Vista", 60) || "Vista";
    return {
      id: cleanString(source.id, randomUUID(), 80) || randomUUID(),
      name,
      search: cleanString(source.search, "", 160),
      activeFilters: normalizeFilters(source.activeFilters),
      sortConfig: normalizeSort(source.sortConfig),
      columns: normalizeColumns(source.columns),
      updatedAt: cleanString(source.updatedAt, new Date().toISOString(), 40) || new Date().toISOString(),
    };
  });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const saved = await prisma.configuracionVista.findUnique({
    where: { clave: `${CONFIG_PREFIX}-${session.userId}` },
    select: { config: true, updatedAt: true },
  });

  return NextResponse.json({ views: saved ? normalizeViews(saved.config) : [], updatedAt: saved?.updatedAt || null });
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
  const views = normalizeViews(source.views);

  const result = await prisma.configuracionVista.upsert({
    where: { clave: `${CONFIG_PREFIX}-${session.userId}` },
    update: { config: views as Prisma.InputJsonValue, updatedBy: session.userId },
    create: { clave: `${CONFIG_PREFIX}-${session.userId}`, config: views as Prisma.InputJsonValue, updatedBy: session.userId },
  });

  return NextResponse.json({ ok: true, views, updatedAt: result.updatedAt });
}
