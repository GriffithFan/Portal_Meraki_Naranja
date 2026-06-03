import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { sanitizeSearch } from "@/lib/sanitize";
import { obtenerProvincia } from "@/utils/provinciaUtils";
import { getRestrictedSpaceIdsForSession } from "@/lib/spaceAccess";
import { hasTaskFieldConfig, normalizeTaskQuickFilter, sanitizeTaskFieldConfigs } from "@/utils/taskFieldConfig";
import { appendVisibleEstadosClause, buildAssignedPredioVisibilityClause, getDelegatedVisibleUserIds, getHiddenEstadoIdsForSession } from "@/lib/predioVisibility";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ExportColumn = {
  id: string;
  label: string;
  field: string;
  visible?: boolean;
  type?: string;
};

type SpaceForExport = {
  id: string;
  nombre: string;
  parentId: string | null;
  camposConfig: unknown;
  estadosConfig: unknown;
};

const DEFAULT_EXPORT_COLUMNS: ExportColumn[] = [
  { id: "codigoPredio", label: "Predio", field: "codigo", visible: true, type: "text" },
  { id: "predio", label: "Incidencia", field: "incidencias", visible: true, type: "text" },
  { id: "fechaActualizacion", label: "Fecha", field: "fechaActualizacion", visible: true, type: "date" },
  { id: "lacR", label: "LAC-R", field: "lacR", visible: true, type: "badge" },
  { id: "cue", label: "CUE", field: "cue", visible: true, type: "text" },
  { id: "fechaDesde", label: "DESDE", field: "fechaDesde", visible: true, type: "date" },
  { id: "fechaHasta", label: "HASTA", field: "fechaHasta", visible: true, type: "date" },
  { id: "ambito", label: "Ambito", field: "ambito", visible: true, type: "select" },
  { id: "asignados", label: "Asignados", field: "asignaciones", visible: true, type: "text" },
  { id: "provincia", label: "Provincia", field: "provincia", visible: true, type: "text" },
  { id: "ciudad", label: "Departamento", field: "ciudad", visible: true, type: "text" },
  { id: "direccion", label: "Direccion", field: "direccion", visible: true, type: "text" },
  { id: "cuePredio", label: "CUE_Predio", field: "cuePredio", visible: true, type: "text" },
  { id: "latitud", label: "Latitud", field: "latitud", visible: true, type: "text" },
  { id: "longitud", label: "Longitud", field: "longitud", visible: true, type: "text" },
  { id: "gpsPredio", label: "GPS", field: "gpsPredio", visible: false, type: "text" },
  { id: "tipoRed", label: "Tipo de Red", field: "tipoRed", visible: false, type: "text" },
  { id: "codigoPostal", label: "Cod. Postal", field: "codigoPostal", visible: false, type: "text" },
  { id: "caracteristicaTelefonica", label: "Car. Tel.", field: "caracteristicaTelefonica", visible: false, type: "text" },
  { id: "telefono", label: "Telefono", field: "telefono", visible: false, type: "text" },
  { id: "lab", label: "LAB", field: "lab", visible: false, type: "text" },
  { id: "nombreInstitucion", label: "Institucion", field: "nombreInstitucion", visible: false, type: "text" },
  { id: "correo", label: "Correo", field: "correo", visible: false, type: "text" },
  { id: "notas", label: "Notas", field: "notas", visible: true, type: "text" },
];

const CORE_COLUMNS: ExportColumn[] = [
  { id: "_espacio", label: "Espacio", field: "_espacio", visible: true },
  { id: "_estado", label: "Estado", field: "_estado", visible: true },
  { id: "_prioridad", label: "Prioridad", field: "prioridad", visible: true },
  { id: "_creado", label: "Creado", field: "createdAt", visible: true, type: "date" },
  { id: "_actualizado", label: "Actualizado", field: "updatedAt", visible: true, type: "date" },
  { id: "_comentarios", label: "Comentarios", field: "_comentarios", visible: true },
  { id: "_dispositivos", label: "Dispositivos", field: "_dispositivos", visible: true },
];

function collectDescendants(espacioId: string, espacios: SpaceForExport[]) {
  const byParent = new Map<string, string[]>();
  for (const espacio of espacios) {
    if (!espacio.parentId) continue;
    const children = byParent.get(espacio.parentId) || [];
    children.push(espacio.id);
    byParent.set(espacio.parentId, children);
  }

  const ids = new Set<string>([espacioId]);
  const stack = [...(byParent.get(espacioId) || [])];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || ids.has(id)) continue;
    ids.add(id);
    stack.push(...(byParent.get(id) || []));
  }
  return Array.from(ids);
}

function normalizeColumn(raw: unknown): ExportColumn | null {
  if (!raw || typeof raw !== "object") return null;
  const field = raw as Record<string, unknown>;
  const id = typeof field.id === "string" ? field.id : "";
  const dataField = typeof field.field === "string" ? field.field : "";
  if (!id || !dataField) return null;
  return {
    id,
    label: String(field.label || field.nombre || id),
    field: dataField,
    visible: field.visible !== false,
    type: typeof field.type === "string" ? field.type : typeof field.tipo === "string" ? field.tipo : "text",
  };
}

function applyViewConfig(columns: ExportColumn[], config: unknown) {
  if (!Array.isArray(config)) return columns;
  const configMap = new Map<string, { visible: boolean; order: number }>();
  config.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string") return;
    configMap.set(row.id, { visible: row.visible !== false, order: typeof row.order === "number" ? row.order : index });
  });
  return [...columns]
    .map((column, index) => {
      const cfg = configMap.get(column.id);
      return cfg ? { ...column, visible: cfg.visible, _order: cfg.order } : { ...column, _order: index + 1000 };
    })
    .sort((a, b) => (a as ExportColumn & { _order: number })._order - (b as ExportColumn & { _order: number })._order)
    .map((columnWithOrder) => {
      const column = { ...columnWithOrder } as ExportColumn & { _order?: number };
      delete column._order;
      return column;
    });
}

function uniqueColumns(columns: ExportColumn[]) {
  const map = new Map<string, ExportColumn>();
  for (const column of columns) {
    const key = column.field || column.id;
    if (!map.has(key)) map.set(key, column);
  }
  return Array.from(map.values());
}

function dateValue(value: unknown): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function textValue(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return dateValue(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(", ");
  if (typeof value === "boolean") return value ? "Si" : "No";
  return String(value);
}

function getFieldValue(predio: any, column: ExportColumn) {
  if (column.field === "_espacio") return predio.espacio?.nombre || "Sin espacio";
  if (column.field === "_estado") return predio.estado?.nombre || "Sin estado";
  if (column.field === "_comentarios") return predio._count?.comentarios ?? 0;
  if (column.field === "_dispositivos") return predio._count?.equipos ?? 0;
  if (column.field === "asignaciones") {
    return (predio.asignaciones || []).map((asignacion: any) => asignacion.usuario?.nombre).filter(Boolean).join(", ");
  }
  if (column.field === "provincia") return obtenerProvincia(predio.provincia, predio.codigo) || "";
  if (column.field === "fechaActualizacion") return dateValue(predio.updatedAt);
  if (column.field.startsWith("_custom_")) {
    const key = column.field.slice(8);
    return textValue(predio.camposExtra?.[key]);
  }
  if (column.type === "date" || predio[column.field] instanceof Date) return dateValue(predio[column.field]);
  return textValue(predio[column.field]);
}

function safeSheetName(value: string) {
  const cleaned = value.replace(/[\\/?*\[\]:]/g, " ").trim();
  return (cleaned || "Hoja").slice(0, 31);
}

function buildUniqueSheetName(value: string, usedNames: Set<string>) {
  const base = safeSheetName(value) || "Hoja";
  if (!usedNames.has(base)) {
    usedNames.add(base);
    return base;
  }

  let suffix = 2;
  while (suffix < 1000) {
    const suffixText = ` (${suffix})`;
    const trimmedBase = base.slice(0, Math.max(1, 31 - suffixText.length));
    const candidate = `${trimmedBase}${suffixText}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    suffix += 1;
  }

  const fallback = `${base.slice(0, 26)}-${Date.now().toString().slice(-4)}`;
  usedNames.add(fallback);
  return fallback;
}

function safeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "tareas";
}

function applyTaskFilters(where: any, request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const buscar = sanitizeSearch(searchParams.get("buscar"));
  const estado = searchParams.get("estado");
  const asignadoId = searchParams.get("asignadoId");
  const provincia = sanitizeSearch(searchParams.get("provincia"));
  const prioridad = searchParams.get("prioridad");
  const quick = normalizeTaskQuickFilter(searchParams.get("quick"));

  if (estado) where.estado = { clave: estado };
  if (asignadoId) where.asignaciones = { some: { userId: asignadoId } };
  if (provincia) where.provincia = { contains: provincia, mode: "insensitive" };
  if (prioridad && ["BAJA", "MEDIA", "ALTA", "URGENTE"].includes(prioridad)) where.prioridad = prioridad;
  if (buscar) {
    const searchWhere = {
      OR: [
        { nombre: { contains: buscar, mode: "insensitive" } },
        { codigo: { contains: buscar, mode: "insensitive" } },
        { incidencias: { contains: buscar, mode: "insensitive" } },
        { cue: { contains: buscar, mode: "insensitive" } },
        { direccion: { contains: buscar, mode: "insensitive" } },
        { ciudad: { contains: buscar, mode: "insensitive" } },
        { provincia: { contains: buscar, mode: "insensitive" } },
        { asignaciones: { some: { usuario: { nombre: { contains: buscar, mode: "insensitive" } } } } },
        { nombreInstitucion: { contains: buscar, mode: "insensitive" } },
      ],
    };
    where.AND = where.AND ? [...where.AND, searchWhere] : [searchWhere];
  }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  if (quick === "sin-gps") {
    const quickWhere = { AND: [{ OR: [{ gpsPredio: null }, { gpsPredio: "" }] }, { OR: [{ latitud: null }, { longitud: null }] }] };
    where.AND = where.AND ? [...where.AND, quickWhere] : [quickWhere];
  } else if (quick === "sin-estado") {
    where.estadoId = null;
  } else if (quick === "sin-asignar") {
    const quickWhere = { asignaciones: { none: {} } };
    where.AND = where.AND ? [...where.AND, quickWhere] : [quickWhere];
  } else if (quick === "vencidas") {
    const quickWhere = { OR: [{ fechaHasta: { lt: startOfDay } }, { fechaProgramada: { lt: startOfDay } }] };
    where.AND = where.AND ? [...where.AND, quickWhere] : [quickWhere];
  } else if (quick === "hoy") {
    const quickWhere = { OR: [{ fechaDesde: { lte: endOfDay }, fechaHasta: { gte: startOfDay } }, { fechaProgramada: { gte: startOfDay, lte: endOfDay } }] };
    where.AND = where.AND ? [...where.AND, quickWhere] : [quickWhere];
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const searchParams = request.nextUrl.searchParams;
  const espacioId = searchParams.get("espacioId") || "";
  const includeSubspaces = searchParams.get("includeSubspaces") !== "false";
  const includeAllFields = searchParams.get("includeAllFields") === "true";
  const asignadoId = searchParams.get("asignadoId") || "";
  if (!espacioId) return NextResponse.json({ error: "espacioId requerido" }, { status: 400 });

  const espacios = await prisma.espacioTrabajo.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, parentId: true, camposConfig: true, estadosConfig: true },
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
  });
  const targetSpace = espacios.find((espacio) => espacio.id === espacioId);
  if (!targetSpace) return NextResponse.json({ error: "Espacio no encontrado" }, { status: 404 });

  const requestedSpaceIds = includeSubspaces ? collectDescendants(espacioId, espacios) : [espacioId];
  const restrictedSpaceIds = await getRestrictedSpaceIdsForSession(session);
  const hiddenEstadoIds = await getHiddenEstadoIdsForSession(session);
  const scopedSpaceIds = restrictedSpaceIds ? requestedSpaceIds.filter((id) => restrictedSpaceIds.includes(id)) : requestedSpaceIds;
  if (scopedSpaceIds.length === 0) return NextResponse.json({ error: "Sin acceso a este espacio" }, { status: 403 });

  const selectedSpaces = espacios.filter((espacio) => scopedSpaceIds.includes(espacio.id));
  const globalCampos = await prisma.campoPersonalizado.findMany({
    where: { activo: true },
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
  });
  const viewConfigs = await prisma.configuracionVista.findMany({
    where: { clave: { in: selectedSpaces.map((space) => `col-config-espacio-${space.id}`) } },
    select: { clave: true, config: true },
  });
  const configBySpaceId = new Map(viewConfigs.map((config) => [config.clave.replace("col-config-espacio-", ""), config.config]));

  const columnsBySpace = selectedSpaces.flatMap((space) => {
    const baseColumns = hasTaskFieldConfig(space.camposConfig as any[])
      ? sanitizeTaskFieldConfigs(space.camposConfig as any[]).map(normalizeColumn).filter(Boolean) as ExportColumn[]
      : [
          ...DEFAULT_EXPORT_COLUMNS,
          ...globalCampos.map((field) => ({
            id: `custom_${field.clave}`,
            label: field.nombre,
            field: `_custom_${field.clave}`,
            visible: true,
            type: field.tipo || "text",
          })),
        ];
    const appliedColumns = applyViewConfig(baseColumns, configBySpaceId.get(space.id));
    if (!includeAllFields) return appliedColumns.filter((column) => column.visible !== false);

    // Export completo: incluir base del espacio + columnas estándar para no perder datos aunque estén ocultos.
    const standardColumns = applyViewConfig(DEFAULT_EXPORT_COLUMNS, configBySpaceId.get(space.id));
    return uniqueColumns([...standardColumns, ...appliedColumns]);
  });
  const columns = uniqueColumns([...CORE_COLUMNS, ...columnsBySpace]);

  const where: any = { espacioId: { in: scopedSpaceIds } };
  applyTaskFilters(where, request);
  appendVisibleEstadosClause(where, hiddenEstadoIds);

  if (!isModOrAdmin(session.rol)) {
    const idsVisibles = await getDelegatedVisibleUserIds(session);
    const ownTasksWhere = buildAssignedPredioVisibilityClause(idsVisibles);
    where.AND = where.AND ? [...where.AND, ownTasksWhere] : [ownTasksWhere];
  }

  const predios = await prisma.predio.findMany({
    where,
    include: {
      estado: { select: { id: true, nombre: true, clave: true, color: true, orden: true } },
      espacio: { select: { id: true, nombre: true, parentId: true } },
      creador: { select: { id: true, nombre: true } },
      asignaciones: { select: { id: true, usuario: { select: { id: true, nombre: true } } } },
      _count: { select: { comentarios: true, equipos: true } },
    },
    orderBy: [{ espacioId: "asc" }, { prioridad: "desc" }, { updatedAt: "desc" }],
  });

  const tareasRows = predios.map((predio) => {
    const row: Record<string, unknown> = {};
    for (const column of columns) row[column.label] = getFieldValue(predio, column);
    return row;
  });

  const configuredStateIds = new Set<string>();
  for (const space of selectedSpaces) {
    const stateIds = (space.estadosConfig as { estadoIds?: unknown[] } | null)?.estadoIds;
    if (Array.isArray(stateIds)) stateIds.forEach((id) => typeof id === "string" && configuredStateIds.add(id));
  }
  predios.forEach((predio) => predio.estadoId && configuredStateIds.add(predio.estadoId));
  const estados = configuredStateIds.size > 0
    ? await prisma.estadoConfig.findMany({ where: { id: { in: Array.from(configuredStateIds) } }, orderBy: [{ orden: "asc" }, { nombre: "asc" }] })
    : [];

  const workbook = XLSX.utils.book_new();
  const emptyRow = Object.fromEntries(columns.map((column) => [column.label, ""]));
  const sheetNames = new Set<string>();

  const tareasSheet = XLSX.utils.json_to_sheet(tareasRows.length > 0 ? tareasRows : [emptyRow], { skipHeader: false });
  tareasSheet["!cols"] = columns.map((column) => ({ wch: Math.max(12, Math.min(35, column.label.length + 6)) }));
  XLSX.utils.book_append_sheet(workbook, tareasSheet, buildUniqueSheetName(targetSpace.nombre || "Tareas", sheetNames));

  // Hoja por asignado (sin reemplazar la hoja general).
  const rowsByAssignee = new Map<string, Array<Record<string, unknown>>>();
  for (const predio of predios) {
    const assignedNames = (predio.asignaciones || []).map((asignacion: any) => asignacion.usuario?.nombre).filter(Boolean) as string[];
    const assignees = assignedNames.length > 0 ? assignedNames : ["Sin asignar"];
    const row = Object.fromEntries(columns.map((column) => [column.label, getFieldValue(predio, column)]));

    for (const assignee of assignees) {
      const group = rowsByAssignee.get(assignee) || [];
      group.push(row);
      rowsByAssignee.set(assignee, group);
    }
  }

  const sortedAssignees = Array.from(rowsByAssignee.keys()).sort((a, b) => a.localeCompare(b, "es"));
  for (const assignee of sortedAssignees) {
    const assigneeRows = rowsByAssignee.get(assignee) || [];
    const sheet = XLSX.utils.json_to_sheet(assigneeRows.length > 0 ? assigneeRows : [emptyRow], { skipHeader: false });
    sheet["!cols"] = columns.map((column) => ({ wch: Math.max(12, Math.min(35, column.label.length + 6)) }));
    XLSX.utils.book_append_sheet(workbook, sheet, buildUniqueSheetName(`Asignado - ${assignee}`, sheetNames));
  }

  const estadosSheet = XLSX.utils.json_to_sheet(estados.map((estado) => ({ Estado: estado.nombre, Clave: estado.clave, Color: estado.color, Orden: estado.orden })));
  XLSX.utils.book_append_sheet(workbook, estadosSheet, buildUniqueSheetName("Estados", sheetNames));

  const camposSheet = XLSX.utils.json_to_sheet(columns.map((column, index) => ({ Orden: index + 1, Campo: column.label, Clave: column.field, Tipo: column.type || "text" })));
  XLSX.utils.book_append_sheet(workbook, camposSheet, buildUniqueSheetName("Campos activos", sheetNames));

  const resumenSheet = XLSX.utils.json_to_sheet([
    { Dato: "Espacio", Valor: targetSpace.nombre },
    { Dato: "Incluye subcarpetas", Valor: includeSubspaces ? "Si" : "No" },
    { Dato: "Filtro por asignado", Valor: asignadoId ? `Si (${asignadoId})` : "No" },
    { Dato: "Campos incluidos", Valor: includeAllFields ? "Todos (visibles y ocultos)" : "Solo campos visibles" },
    { Dato: "Hojas por asignado", Valor: `${sortedAssignees.length}` },
    { Dato: "Total exportado", Valor: predios.length },
    { Dato: "Generado", Valor: new Date().toLocaleString("es-AR") },
  ]);
  XLSX.utils.book_append_sheet(workbook, resumenSheet, buildUniqueSheetName("Resumen", sheetNames));

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
  const today = new Date().toISOString().slice(0, 10);
  const filename = `${safeFilename(targetSpace.nombre)}-tareas-${today}.xlsx`;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  prisma.registroAcceso.create({
    data: {
      userId: session.userId,
      accion: "EXPORT_TAREAS_ESPACIO",
      detalle: `${predios.length} tareas exportadas de ${targetSpace.nombre}`,
      ip,
      metadata: { espacioId, includeSubspaces, includeAllFields, asignadoId: asignadoId || null, total: predios.length, formato: "xlsx", scopedSpaceIds: scopedSpaceIds.length },
    },
  }).catch(() => {});

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
