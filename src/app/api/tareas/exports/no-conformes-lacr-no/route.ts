import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import AdmZip from "adm-zip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeText(value?: string | null) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isBlockedState(estado?: { nombre?: string | null; clave?: string | null } | null) {
  const nombre = normalizeText(estado?.nombre);
  const clave = normalizeText(estado?.clave).replace(/[_\s-]+/g, "");
  return nombre.includes("bloquead") || nombre.includes("blockead") || clave.includes("bloquead") || clave.includes("blockead");
}

function compactState(value?: string | null) {
  return normalizeText(value).replace(/[_\s-]+/g, "");
}

function isNoConformeState(estado?: { nombre?: string | null; clave?: string | null } | null) {
  const nombre = compactState(estado?.nombre);
  const clave = compactState(estado?.clave);
  return nombre === "noconforme" || clave === "noconforme" || nombre === "nc" || clave === "nc";
}

function isConformeState(estado?: { nombre?: string | null; clave?: string | null } | null) {
  const nombre = compactState(estado?.nombre);
  const clave = compactState(estado?.clave);
  return nombre === "conforme" || clave === "conforme";
}

function isSinAsignarState(estado?: { nombre?: string | null; clave?: string | null } | null) {
  const nombre = compactState(estado?.nombre);
  const clave = compactState(estado?.clave);
  return nombre === "sinasignar" || clave === "sinasignar";
}

function collectDescendants(espacioId: string, espacios: { id: string; parentId: string | null }[]) {
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

function isPrediosBranch(espacioId: string, espacios: { id: string; nombre: string; parentId: string | null }[]) {
  const byId = new Map(espacios.map((espacio) => [espacio.id, espacio]));
  let current = byId.get(espacioId);
  let guard = 0;
  while (current && guard < 30) {
    if (normalizeText(current.nombre).includes("predio")) return true;
    current = current.parentId ? byId.get(current.parentId) : undefined;
    guard += 1;
  }
  return false;
}

function belongsToFolder(espacioId: string | null | undefined, folderName: string, espacios: { id: string; nombre: string; parentId: string | null }[]) {
  if (!espacioId) return false;
  const target = normalizeText(folderName);
  const byId = new Map(espacios.map((espacio) => [espacio.id, espacio]));
  let current = byId.get(espacioId);
  let guard = 0;
  while (current && guard < 30) {
    if (normalizeText(current.nombre) === target) return true;
    current = current.parentId ? byId.get(current.parentId) : undefined;
    guard += 1;
  }
  return false;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatExcelDate(date: Date) {
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: unknown[]) {
  return values.map(csvCell).join(";");
}

function formatFilenameDate(date: Date) {
  return formatExcelDate(date).replace(/\//g, "-");
}

function buildCsv(predios: ExportPredio[], extraDays = 0) {
  const today = new Date();
  const desde = formatExcelDate(addDays(today, 2 + extraDays));
  const hasta = formatExcelDate(addDays(today, 16 + extraDays));
  const rows = [
    csvRow(["PREDIO", "DESDE", "HASTA", "DNI", "NI"]),
    ...predios.map((predio) => csvRow([predio.codigo || "", desde, hasta, "TH01", predio.incidencias || predio.nombre || ""])),
  ];
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

type ExportKind = "nc" | "cronogramas" | "ocp" | "asignados-sin-cronograma" | "asignados-vencidos";

type ExportPredio = {
  codigo: string | null;
  nombre: string | null;
  incidencias: string | null;
  lacR: string | null;
  provincia: string | null;
  updatedAt: Date;
  fechaDesde: Date | null;
  fechaHasta: Date | null;
  estado: { nombre: string | null; clave: string | null } | null;
  asignaciones: { usuario: { nombre: string | null } | null }[];
  espacio: { id: string; nombre: string; parentId: string | null } | null;
};

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const espacioId = searchParams.get("espacioId") || "";
  const includeSubspaces = searchParams.get("includeSubspaces") === "true";
  const tipo = (searchParams.get("tipo") || "nc").toLowerCase() as ExportKind;
  if (!["nc", "cronogramas", "ocp", "asignados-sin-cronograma", "asignados-vencidos"].includes(tipo)) {
    return NextResponse.json({ error: "tipo invalido" }, { status: 400 });
  }
  if (!espacioId) {
    return NextResponse.json({ error: "espacioId requerido" }, { status: 400 });
  }

  const espacios = await prisma.espacioTrabajo.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, parentId: true },
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
  });
  const targetSpace = espacios.find((espacio) => espacio.id === espacioId);
  if (!targetSpace) return NextResponse.json({ error: "Espacio no encontrado" }, { status: 404 });
  if (!isPrediosBranch(espacioId, espacios)) {
    return NextResponse.json({ error: "Export disponible solo para la rama Predios" }, { status: 400 });
  }

  const scopedSpaceIds = includeSubspaces ? collectDescendants(espacioId, espacios) : [espacioId];

  const PREDIO_SELECT = {
    codigo: true,
    nombre: true,
    incidencias: true,
    lacR: true,
    provincia: true,
    updatedAt: true,
    fechaDesde: true,
    fechaHasta: true,
    estado: { select: { nombre: true, clave: true } },
    asignaciones: { select: { usuario: { select: { nombre: true } } } },
    espacio: { select: { id: true, nombre: true, parentId: true } },
  };
  const PREDIO_ORDER = [{ espacioId: "asc" as const }, { codigo: "asc" as const }, { incidencias: "asc" as const }];

  let exportData: { filenamePrefix: string; predios: ExportPredio[]; extraDays?: number };

  if (tipo === "asignados-sin-cronograma" || tipo === "asignados-vencidos") {
    // Predios en estado SIN ASIGNAR que SÍ tienen un técnico asignado. Se parten en dos:
    //  - sin-cronograma: sin fechas DESDE-HASTA → el CSV usa fechas +14 días (extraDays)
    //  - vencidos: con fechas DESDE-HASTA → fechas normales del CSV
    const rows = await prisma.predio.findMany({
      where: {
        espacioId: { in: scopedSpaceIds },
        asignaciones: { some: { tipo: { in: ["TAREA", "TECNICO"] } } },
      },
      select: PREDIO_SELECT,
      orderBy: PREDIO_ORDER,
    }) as unknown as ExportPredio[];
    const sinAsignar = rows.filter((predio) => isSinAsignarState(predio.estado));
    const sinFechas = (predio: ExportPredio) => predio.fechaDesde == null && predio.fechaHasta == null;
    if (tipo === "asignados-sin-cronograma") {
      exportData = { filenamePrefix: "Asignados sin cronograma", predios: sinAsignar.filter(sinFechas), extraDays: 14 };
    } else {
      exportData = { filenamePrefix: "Asignados vencidos", predios: sinAsignar.filter((predio) => !sinFechas(predio)) };
    }
  } else {
    const lacNoPredios = await prisma.predio.findMany({
      where: { lacR: { equals: "NO", mode: "insensitive" }, espacioId: { in: scopedSpaceIds } },
      select: PREDIO_SELECT,
      orderBy: PREDIO_ORDER,
    }) as unknown as ExportPredio[];
    const predios = lacNoPredios.filter((predio) => !isBlockedState(predio.estado) && !isConformeState(predio.estado));
    const ocpPredios = predios.filter((predio) => belongsToFolder(predio.espacio?.id, "OCP", espacios));
    const nonOcpPredios = predios.filter((predio) => !belongsToFolder(predio.espacio?.id, "OCP", espacios));
    const noConformes = nonOcpPredios.filter((predio) => isNoConformeState(predio.estado));
    const otrosEstados = nonOcpPredios.filter((predio) => !isNoConformeState(predio.estado));
    const exportMap = {
      nc: { filenamePrefix: "NC", predios: noConformes },
      cronogramas: { filenamePrefix: "Cronogramas", predios: otrosEstados },
      ocp: { filenamePrefix: "OCP", predios: ocpPredios },
    };
    exportData = exportMap[tipo as "nc" | "cronogramas" | "ocp"];
  }

  const today = new Date();
  const extra = exportData.extraDays ?? 0;
  const baseName = `${exportData.filenamePrefix} ${formatFilenameDate(today)}`;
  const total = exportData.predios.length;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";

  // Las listas de asignados no pueden exceder 40 predios por archivo → se parten en
  // CSVs de a 40 y se empaquetan en un ZIP cuando hay más de 40 (una sola descarga).
  const chunkSize = tipo === "asignados-sin-cronograma" || tipo === "asignados-vencidos" ? 40 : 0;

  if (chunkSize > 0 && total > chunkSize) {
    const partes = Math.ceil(total / chunkSize);
    const zip = new AdmZip();
    for (let i = 0; i < partes; i++) {
      const trozo = exportData.predios.slice(i * chunkSize, (i + 1) * chunkSize);
      zip.addFile(`${baseName} - parte ${i + 1} de ${partes}.csv`, Buffer.from(buildCsv(trozo, extra), "utf8"));
    }
    const buffer = zip.toBuffer();
    prisma.registroAcceso.create({
      data: {
        userId: session.userId,
        accion: "EXPORT_TAREAS_LACR_NO",
        detalle: `${total} registros en ${targetSpace.nombre} (${exportData.filenamePrefix}, ${partes} partes de ${chunkSize})`,
        ip,
        metadata: { total, formato: "zip", tipo, espacioId, includeSubspaces, partes },
      },
    }).catch(() => {});
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${baseName}.zip"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  }

  const csv = buildCsv(exportData.predios, extra);
  prisma.registroAcceso.create({
    data: {
      userId: session.userId,
      accion: "EXPORT_TAREAS_LACR_NO",
      detalle: `${total} registros en ${targetSpace.nombre} (${exportData.filenamePrefix})`,
      ip,
      metadata: { total, formato: "csv", tipo, espacioId, includeSubspaces },
    },
  }).catch(() => {});

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${baseName}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}