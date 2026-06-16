import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { normalizeTaskGroupBy, normalizeTaskQuickFilter } from "@/utils/taskFieldConfig";

type SortConfig = { field: string; dir: "asc" | "desc" } | null;

const DEFAULT_CONFIG = {
  filterEstado: "todos",
  filterProvincia: "",
  filterPrioridad: "todas",
  filterAsignado: "todos",
  quickFilter: "todos",
  groupBy: "estado",
  // Orden por defecto: por código (Predio) de menor a mayor.
  sortConfig: { field: "codigo", dir: "asc" } as SortConfig,
};

function normalizeSortConfig(value: unknown): SortConfig {
  if (value === null) return null; // el usuario quitó el orden explícitamente
  if (value && typeof value === "object") {
    const sc = value as Record<string, unknown>;
    if (typeof sc.field === "string" && sc.field) {
      return { field: sc.field.slice(0, 60), dir: sc.dir === "desc" ? "desc" : "asc" };
    }
  }
  return DEFAULT_CONFIG.sortConfig;
}

function normalizeConfig(value: unknown) {
  const input = typeof value === "object" && value ? value as Record<string, unknown> : {};
  return {
    filterEstado: String(input.filterEstado || DEFAULT_CONFIG.filterEstado).slice(0, 80),
    filterProvincia: String(input.filterProvincia || DEFAULT_CONFIG.filterProvincia).slice(0, 80),
    filterPrioridad: String(input.filterPrioridad || DEFAULT_CONFIG.filterPrioridad).slice(0, 20),
    filterAsignado: String(input.filterAsignado || DEFAULT_CONFIG.filterAsignado).slice(0, 60),
    quickFilter: normalizeTaskQuickFilter(input.quickFilter),
    groupBy: normalizeTaskGroupBy(input.groupBy),
    sortConfig: "sortConfig" in input ? normalizeSortConfig(input.sortConfig) : DEFAULT_CONFIG.sortConfig,
  };
}

/** Clave por usuario y, opcionalmente, por espacio (scope) para que cada
 *  carpeta recuerde sus propios filtros sin pisar los de otros usuarios. */
function configKey(userId: string, scope: string | null): string {
  const base = `tareas-filtros-${userId}`;
  const safe = (scope || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);
  return safe ? `${base}-${safe}` : base;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const scope = request.nextUrl.searchParams.get("scope");
  const saved = await prisma.configuracionVista.findUnique({
    where: { clave: configKey(session.userId, scope) },
    select: { config: true, updatedAt: true },
  });

  return NextResponse.json({ config: saved ? normalizeConfig(saved.config) : DEFAULT_CONFIG, updatedAt: saved?.updatedAt || null });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const scope = request.nextUrl.searchParams.get("scope");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const clave = configKey(session.userId, scope);
  const config = normalizeConfig(body);
  const result = await prisma.configuracionVista.upsert({
    where: { clave },
    update: { config: config as Prisma.InputJsonValue, updatedBy: session.userId },
    create: { clave, config: config as Prisma.InputJsonValue, updatedBy: session.userId },
  });

  return NextResponse.json({ ok: true, updatedAt: result.updatedAt });
}
