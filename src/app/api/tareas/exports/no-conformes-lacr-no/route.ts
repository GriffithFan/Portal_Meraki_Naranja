import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import * as XLSX from "xlsx";

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

const CABECERA = ["PREDIO", "DESDE", "HASTA", "DNI", "NI"];

/** Identificador TH del t\u00E9cnico (1-30 \u2192 "TH05"), vac\u00EDo si no tiene. */
function formatTh(n: number | null | undefined): string {
  return n && n >= 1 && n <= 30 ? `TH${String(n).padStart(2, "0")}` : "";
}

/** DNI del predio = identificador TH del \u00DALTIMO t\u00E9cnico asignado (o vac\u00EDo). */
function dniDePredio(predio: ExportPredio): string {
  const asigs = (predio.asignaciones || []).filter((a) => a.usuario);
  if (!asigs.length) return "";
  const ult = asigs.slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[asigs.length - 1];
  return formatTh(ult.usuario?.thNumero);
}

// Ventana DESDE-HASTA: DESDE = hoy + desdeDias, HASTA = DESDE + 14 (ventana de 14 d\u00EDas).
function ventana(desdeDias: number) {
  const today = new Date();
  return {
    desde: formatExcelDate(addDays(today, desdeDias)),
    hasta: formatExcelDate(addDays(today, desdeDias + 14)),
  };
}

function buildCsv(predios: ExportPredio[], desdeDias: number) {
  const { desde, hasta } = ventana(desdeDias);
  const rows = [
    csvRow(CABECERA),
    ...predios.map((predio) => csvRow([predio.codigo || "", desde, hasta, dniDePredio(predio), predio.incidencias || predio.nombre || ""])),
  ];
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

/** Excel con una HOJA por bloque de 40 predios (SF no acepta m\u00E1s de 40 por carga). */
function buildXlsxPartes(predios: ExportPredio[], desdeDias: number): Buffer {
  const { desde, hasta } = ventana(desdeDias);
  const wb = XLSX.utils.book_new();
  const partes = Math.max(1, Math.ceil(predios.length / 40));
  for (let i = 0; i < partes; i++) {
    const trozo = predios.slice(i * 40, (i + 1) * 40);
    const filas = trozo.map((p) => [p.codigo || "", desde, hasta, dniDePredio(p), p.incidencias || p.nombre || ""]);
    const ws = XLSX.utils.aoa_to_sheet([CABECERA, ...filas]);
    ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, `Parte ${i + 1} de ${partes}`);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

type ExportKind = "nc" | "cronogramas" | "ocp" | "asignados-sin-cronograma" | "asignados-vencidos";

type ExportPredio = {
  codigo: string | null;
  nombre: string | null;
  incidencias: string | null;
  lacR: string | null;
  provincia: string | null;
  ciudad: string | null;
  updatedAt: Date;
  fechaDesde: Date | null;
  fechaHasta: Date | null;
  espacioId: string | null;
  estado: { nombre: string | null; clave: string | null } | null;
  asignaciones: { createdAt: Date; usuario: { id: string; nombre: string | null; thNumero: number | null } | null }[];
  espacio: { id: string; nombre: string; parentId: string | null } | null;
};

/**
 * Cronograma que TODAVIA NO ABRIO (DESDE posterior a hoy). Es lo que la pantalla
 * muestra como "PRONTO": LAC-R quedo en NO pero el predio ya tiene una ventana
 * asignada por delante.
 *
 * No hay que volver a pedirlos: al re-lanzarlos se pierde la ventana que ya tenian
 * y hay que esperar la nueva (14 dias mas). Pasa sobre todo en las regiones
 * "estrictas" de BA (14 y 15), donde una ventana futura se guarda como LAC-R NO
 * en vez de SI (ver lib/enriquecimiento/aplicar.ts) — en el resto de las regiones
 * un cronograma futuro queda en SI y el filtro de LAC-R ya lo dejaba afuera.
 */
function ventanaAunNoAbrio(predio: ExportPredio, finDeHoy: Date) {
  return predio.fechaDesde != null && predio.fechaDesde > finDeHoy;
}

/** LAC-R = NO de forma estricta. Cualquier otra cosa (SI, PEDIDO, vacio) queda afuera. */
function esLacRNo(predio: ExportPredio) {
  return normalizeText(predio.lacR) === "no";
}

/** Lee un parametro separado por comas y devuelve el set normalizado (vacio = no filtra). */
function setDeParam(valor: string | null, normalizar = true) {
  const items = (valor || "").split(",").map((x) => (normalizar ? normalizeText(x) : x.trim())).filter(Boolean);
  return new Set(items);
}

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

  // ── Opciones del desplegable de descarga ────────────────────────────────
  // Por defecto la lista es la ESTRICTA: solo LAC-R = NO. Un predio en LAC-R SI
  // queda afuera aunque su cronograma este vencido — eso es justamente lo que se
  // colaba antes en "Asignados vencidos", que no miraba LAC-R para nada (medido el
  // 20/08/2026: 166 predios, de los cuales 109 estaban en SI).
  const lacrModo = (searchParams.get("lacr") || "no").toLowerCase() === "todos" ? "todos" : "no";
  // Por defecto se excluyen los cronogramas que todavia no abrieron (los "PRONTO").
  const incluirFuturos = searchParams.get("incluirFuturos") === "1";
  const omitirTecnicos = setDeParam(searchParams.get("omitirTecnicos"), false);
  const omitirProvincias = setDeParam(searchParams.get("omitirProvincias"));
  const omitirCiudades = setDeParam(searchParams.get("omitirCiudades"));
  const omitirEspacios = setDeParam(searchParams.get("omitirEspacios"), false);

  /** Quita lo que el usuario pidio omitir (tecnicos, provincias, departamentos, carpetas). */
  function aplicarOmisiones(lista: ExportPredio[]) {
    if (!omitirTecnicos.size && !omitirProvincias.size && !omitirCiudades.size && !omitirEspacios.size) return lista;
    return lista.filter((predio) => {
      if (omitirEspacios.size && predio.espacioId && omitirEspacios.has(predio.espacioId)) return false;
      if (omitirProvincias.size && omitirProvincias.has(normalizeText(predio.provincia))) return false;
      if (omitirCiudades.size && omitirCiudades.has(normalizeText(predio.ciudad))) return false;
      if (omitirTecnicos.size) {
        // Se omite el predio si ALGUNO de sus tecnicos esta en la lista a omitir.
        const tiene = (predio.asignaciones || []).some((a) => a.usuario && omitirTecnicos.has(a.usuario.id));
        if (tiene) return false;
      }
      return true;
    });
  }

  const PREDIO_SELECT = {
    codigo: true,
    nombre: true,
    incidencias: true,
    lacR: true,
    provincia: true,
    ciudad: true,
    updatedAt: true,
    fechaDesde: true,
    fechaHasta: true,
    espacioId: true,
    estado: { select: { nombre: true, clave: true } },
    asignaciones: { select: { createdAt: true, usuario: { select: { id: true, nombre: true, thNumero: true } } } },
    espacio: { select: { id: true, nombre: true, parentId: true } },
  };
  const PREDIO_ORDER = [{ espacioId: "asc" as const }, { codigo: "asc" as const }, { incidencias: "asc" as const }];

  let exportData: { filenamePrefix: string; predios: ExportPredio[] };

  if (tipo === "asignados-sin-cronograma" || tipo === "asignados-vencidos") {
    // Predios en estado SIN ASIGNAR que SÍ tienen un técnico asignado. Se parten en dos:
    //  - sin-cronograma: sin fechas DESDE-HASTA (nunca tuvieron cronograma)
    //  - vencidos: con fechas DESDE-HASTA (vencidos)
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
      // Sin cronograma no hay LAC-R que mirar: esta lista no se filtra por eso.
      exportData = { filenamePrefix: "Asignados sin cronograma", predios: sinAsignar.filter(sinFechas) };
    } else {
      // Aca SI se mira: un cronograma a futuro esta en LAC-R SI y no corresponde
      // relanzarlo, por mas que la fecha ya haya pasado o falte poco.
      const conCronograma = sinAsignar.filter((predio) => !sinFechas(predio));
      exportData = {
        filenamePrefix: "Asignados vencidos",
        predios: lacrModo === "todos" ? conCronograma : conCronograma.filter(esLacRNo),
      };
    }
  } else {
    const lacNoPredios = await prisma.predio.findMany({
      where: {
        espacioId: { in: scopedSpaceIds },
        ...(lacrModo === "todos" ? {} : { lacR: { equals: "NO", mode: "insensitive" } }),
      },
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

  const finDeHoy = new Date();
  finDeHoy.setHours(23, 59, 59, 999);
  const sinFuturos = incluirFuturos
    ? exportData.predios
    : exportData.predios.filter((predio) => !ventanaAunNoAbrio(predio, finDeHoy));
  exportData = { ...exportData, predios: aplicarOmisiones(sinFuturos) };

  const today = new Date();
  // DESDE = hoy + desdeDias (sin contar hoy), HASTA = DESDE + 14. Para cronogramas,
  // asignados-vencidos y asignados-sin-cronograma → 14 días (hoy+14 a hoy+28). Resto → 2.
  const desdeDias = tipo === "cronogramas" || tipo === "asignados-vencidos" || tipo === "asignados-sin-cronograma" ? 14 : 2;
  const baseName = `${exportData.filenamePrefix} ${formatFilenameDate(today)}`;
  const total = exportData.predios.length;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";

  // Las listas de asignados se entregan como UN Excel con HOJAS de a 40 predios
  // (Salesforce no acepta más de 40 por carga). nc/cronogramas/ocp siguen como CSV.
  const esAsignados = tipo === "asignados-sin-cronograma" || tipo === "asignados-vencidos";

  if (esAsignados) {
    const partes = Math.max(1, Math.ceil(total / 40));
    const buffer = buildXlsxPartes(exportData.predios, desdeDias);
    prisma.registroAcceso.create({
      data: {
        userId: session.userId,
        accion: "EXPORT_TAREAS_LACR_NO",
        detalle: `${total} registros en ${targetSpace.nombre} (${exportData.filenamePrefix}, ${partes} hoja(s) de 40)`,
        ip,
        metadata: { total, formato: "xlsx", tipo, espacioId, includeSubspaces, partes, lacr: lacrModo, incluirFuturos, omitidos: { tecnicos: omitirTecnicos.size, provincias: omitirProvincias.size, ciudades: omitirCiudades.size, carpetas: omitirEspacios.size } },
      },
    }).catch(() => {});
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${baseName}.xlsx"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  }

  const csv = buildCsv(exportData.predios, desdeDias);
  prisma.registroAcceso.create({
    data: {
      userId: session.userId,
      accion: "EXPORT_TAREAS_LACR_NO",
      detalle: `${total} registros en ${targetSpace.nombre} (${exportData.filenamePrefix})`,
      ip,
      metadata: { total, formato: "csv", tipo, espacioId, includeSubspaces, lacr: lacrModo, incluirFuturos, omitidos: { tecnicos: omitirTecnicos.size, provincias: omitirProvincias.size, ciudades: omitirCiudades.size, carpetas: omitirEspacios.size } },
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