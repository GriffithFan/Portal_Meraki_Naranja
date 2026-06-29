import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { parseBody, isErrorResponse, importarEjecutarSchema } from "@/lib/validation";
import { detectarProvincia } from "@/utils/provinciaUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ColumnMapping {
  excelColumn: number;
  dbField: string;
}

interface ImportPayload {
  tipo: "PREDIO" | "EQUIPO";
  mappings: ColumnMapping[];
  rows: string[][];
  defaultPrioridad?: string;
  defaultEstadoId?: string;
  espacioId?: string;
  updateExisting?: boolean;
}

// Campos del cronograma SF 2026
const PREDIO_FIELDS: Record<string, string> = {
  nombre: "Nombre / CUE",
  codigo: "Código",
  direccion: "Dirección",
  ciudad: "Ciudad",
  tipo: "Tipo",
  notas: "Notas",
  prioridad: "Prioridad",
  seccion: "Sección",
  latitud: "Latitud",
  longitud: "Longitud",
  // Campos del cronograma
  incidencias: "Incidencias (NI-...)",
  lacR: "LAC-R (SI/NO)",
  cue: "CUE",
  fechaDesde: "Fecha DESDE",
  fechaHasta: "Fecha HASTA",
  ambito: "Ámbito (Urbano/Rural)",
  provincia: "Provincia",
  cuePredio: "CUE_Predio",
  gpsPredio: "GPS_Predio",
  tipoRed: "Tipo de Red",
  codigoPostal: "Código Postal",
  caracteristicaTelefonica: "Característica Telefónica",
  telefono: "Teléfono",
  lab: "LAB",
  nombreInstitucion: "Nombre de la Institución",
  correo: "Correo",
  asignado: "Asignado (Técnico)",
  estado: "Estado (texto)",
  orden: "Orden (nro)",
};

/* Auto-fill por prefijo de serial (4 primeros caracteres) */
const SERIAL_PREFIX_MAP: Record<string, { nombre: string; modelo: string }> = {
  Q2PD: { nombre: "AP", modelo: "MR33" },
  Q3AJ: { nombre: "AP", modelo: "MR36" },
  Q3AL: { nombre: "AP", modelo: "MR44" },
  Q2GW: { nombre: "SWITCH 24P", modelo: "MS225" },
  Q2CX: { nombre: "SWITCH 8P", modelo: "MS120" },
  Q2PN: { nombre: "UTM", modelo: "MX84" },
  Q2YN: { nombre: "UTM", modelo: "MX85" },
  Q2TN: { nombre: "Gateway", modelo: "Z3" },
};

const EQUIPO_FIELDS: Record<string, string> = {
  id: "ID (interno — no editar)",
  inventario: "Nº inventario (interno — no editar)",
  nombre: "Nombre",
  descripcion: "Descripción",
  numeroSerie: "Número de Serie",
  modelo: "Modelo",
  marca: "Marca",
  cantidad: "Cantidad",
  estado: "Estado",
  categoria: "Categoría",
  ubicacion: "Ubicación",
  notas: "Notas",
  fecha: "Fecha",
  asignado: "Asignado (Técnico)",
  etiqueta: "Etiqueta",
  proveedor: "Proveedor",
};

// Paleta de colores de etiqueta (igual que la del stock) para asignar un color
// base al importar. Color determinístico por texto: misma etiqueta → mismo color.
const ETIQUETA_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#1e293b"];
function colorParaEtiqueta(texto: string): string {
  const t = texto.trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return ETIQUETA_COLORS[h % ETIQUETA_COLORS.length];
}

// Distingue un error transitorio de conexión/BD (reintentable) de un error de
// datos como una violación de unicidad (no reintentable). Importar listas
// grandes generaba miles de consultas y, bajo carga, algunas fallaban de forma
// intermitente; esas fallas se contaban como "omitido", dando números distintos
// en cada corrida de la MISMA lista. Reintentar los transitorios lo soluciona.
function isTransientError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const code = e?.code || "";
  if (code === "P2002") return false; // unicidad = dato real, no transitorio
  if (["P1001", "P1002", "P1008", "P1011", "P1017", "P2024", "P2028", "P2034"].includes(code)) return true;
  const msg = (e?.message || "").toLowerCase();
  return /invalid invocation|connection|timed out|timeout|econnreset|terminating connection|too many connections|connection pool|server has closed/.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let a = 1; a <= attempts; a++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (a === attempts || !isTransientError(e)) throw e;
      await new Promise((r) => setTimeout(r, 120 * a + Math.floor(Math.random() * 120)));
    }
  }
  throw lastErr;
}

export async function GET() {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  // También devolver estados disponibles y campos personalizados
  const [estados, camposPersonalizados] = await Promise.all([
    prisma.estadoConfig.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
    prisma.campoPersonalizado.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
  ]);
  return NextResponse.json({ 
    predioFields: PREDIO_FIELDS, 
    equipoFields: EQUIPO_FIELDS,
    estados,
    camposPersonalizados,
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  let body: ImportPayload;
  try {
    const parsed = await parseBody(request, importarEjecutarSchema);
    if (isErrorResponse(parsed)) return parsed;
    body = parsed as ImportPayload;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "JSON inválido";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { tipo, mappings, rows, defaultPrioridad, defaultEstadoId, espacioId, updateExisting } = body;

  const fieldMap = new Map<string, number>();
  const customFieldMap = new Map<string, number>(); // custom:clave → excelColumn
  for (const m of mappings) {
    if (m.dbField && m.dbField !== "_skip") {
      if (m.dbField.startsWith("custom:")) {
        customFieldMap.set(m.dbField.substring(7), m.excelColumn);
      } else {
        fieldMap.set(m.dbField, m.excelColumn);
      }
    }
  }

  function safeGet(row: string[], index: number | undefined): string {
    if (index === undefined || index < 0 || index >= row.length) return "";
    return row[index]?.trim() ?? "";
  }

  /** Parsea GPS combinado tipo "-35.123, -62.456" → { lat, lng } */
  function parseGPSCombined(gpsStr: string): { lat: number | null; lng: number | null } {
    if (!gpsStr) return { lat: null, lng: null };
    const parts = gpsStr.split(",").map(s => parseFloat(s.trim().replace(",", ".")));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && !(parts[0] === 0 && parts[1] === 0)) {
      return { lat: parts[0], lng: parts[1] };
    }
    return { lat: null, lng: null };
  }

  function parseDate(val: string): Date | null {
    if (!val) return null;
    // Intentar varios formatos
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
    // Formato DD/MM/YYYY
    const parts = val.split(/[\/\-]/);
    if (parts.length === 3) {
      const [dd, mm, yyyy] = parts;
      const p = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`);
      if (!isNaN(p.getTime())) return p;
    }
    return null;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const duplicates: { fila: number; serial: string; nuevo: Record<string, string>; existente: Record<string, string>; iguales: string[]; diferentes: string[]; accion?: "actualizado" | "omitido" }[] = [];
  // Detalle de lo actualizado (qué campos cambiaron) y desglose de motivos de omisión.
  const updates: { fila: number; serial: string | null; id?: string; cambios: { campo: string; antes: string; despues: string }[] }[] = [];
  const motivos = { duplicado: 0, idNoEncontrado: 0, desalineado: 0, sinNombre: 0, transitorio: 0, error: 0, filaInvalida: 0 };

  try {
    if (tipo === "PREDIO") {
      // Requiere al menos "nombre" o "codigo" (para updates)
      if (!fieldMap.has("nombre") && !fieldMap.has("codigo")) {
        return NextResponse.json({ error: 'Debes mapear al menos "Nombre / CUE" o "Código"' }, { status: 400 });
      }

      // Pre-cargar usuarios para matching de asignado en predios
      let predioUsers: { id: string; nombre: string; email: string }[] = [];
      if (fieldMap.has("asignado")) {
        predioUsers = await prisma.user.findMany({
          where: { activo: true },
          select: { id: true, nombre: true, email: true },
        });
      }

      // Pre-cargar estados para auto-matching por nombre
      const allEstados = await prisma.estadoConfig.findMany({
        where: { activo: true },
        select: { id: true, nombre: true, clave: true },
      });

      const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[\s_-]+/g, " ");

      /** Match usuario por nombre, email o alias (ej: "Daniel c01" → th01@thnet.com) */
      const matchUser = (val: string): string | null => {
        if (!val || predioUsers.length === 0) return null;
        const needle = norm(val);
        const match = predioUsers.find(u => {
          const n = norm(u.nombre);
          const e = norm(u.email).split("@")[0]; // th01, th07, etc.
          return n === needle || n.includes(needle) || needle.includes(n) || e === needle;
        });
        return match?.id || null;
      }

      /** Match estado por nombre (ej: "sin asignar" → SIN ASIGNAR) */
      const matchEstado = (val: string): string | null => {
        if (!val) return null;
        const needle = norm(val);
        // Priorizar match exacto
        const exact = allEstados.find(e => norm(e.nombre) === needle || norm(e.clave) === needle);
        if (exact) return exact.id;
        // Fallback: match parcial (solo si uno de los dos contiene al otro)
        const partial = allEstados.find(e => {
          const n = norm(e.nombre);
          return n.includes(needle) || needle.includes(n);
        });
        return partial?.id || null;
      }

      // Track codes created in this batch to handle within-batch duplicates
      const batchCreatedCodes = new Map<string, string>(); // codigo → predioId

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !Array.isArray(row)) { skipped++; continue; }

        try {
          const nombre = safeGet(row, fieldMap.get("nombre"));
          const codigo = safeGet(row, fieldMap.get("codigo"));
          if (!nombre && !codigo) { skipped++; continue; }

          const data: Record<string, unknown> = {
            prioridad: defaultPrioridad || "MEDIA",
            creadorId: session.userId,
          };
          if (nombre) data.nombre = nombre;
          if (codigo) data.codigo = codigo;
          // Si nombre es numérico y no hay codigo mapeado, usar nombre como codigo
          if (nombre && !codigo && !fieldMap.has("codigo") && /^\d+$/.test(nombre)) {
            data.codigo = nombre;
          }
          // Si no hay nombre pero sí código, usar código como nombre (campo requerido en BD)
          if (!nombre && codigo) data.nombre = codigo;

          if (defaultEstadoId) data.estadoId = defaultEstadoId;
          if (espacioId) data.espacioId = espacioId;

          // Campos básicos
          const direccion = safeGet(row, fieldMap.get("direccion"));
          if (direccion) data.direccion = direccion;
          const ciudad = safeGet(row, fieldMap.get("ciudad"));
          if (ciudad) data.ciudad = ciudad;
          const tipoVal = safeGet(row, fieldMap.get("tipo"));
          if (tipoVal) data.tipo = tipoVal;
          const notas = safeGet(row, fieldMap.get("notas"));
          if (notas) data.notas = notas;
          const seccion = safeGet(row, fieldMap.get("seccion"));
          if (seccion) data.seccion = seccion;

          const prioridadVal = safeGet(row, fieldMap.get("prioridad")).toUpperCase();
          if (["BAJA", "MEDIA", "ALTA", "URGENTE"].includes(prioridadVal)) data.prioridad = prioridadVal;

          const latStr = safeGet(row, fieldMap.get("latitud"));
          if (latStr) { const v = parseFloat(latStr.replace(',', '.')); if (!isNaN(v)) data.latitud = v; }
          const lonStr = safeGet(row, fieldMap.get("longitud"));
          if (lonStr) { const v = parseFloat(lonStr.replace(',', '.')); if (!isNaN(v)) data.longitud = v; }

          // Campos del cronograma
          const incidencias = safeGet(row, fieldMap.get("incidencias"));
          if (incidencias) data.incidencias = incidencias;
          const lacR = safeGet(row, fieldMap.get("lacR"));
          if (lacR) data.lacR = lacR.toUpperCase();
          const cue = safeGet(row, fieldMap.get("cue"));
          if (cue) data.cue = cue;
          const ambito = safeGet(row, fieldMap.get("ambito"));
          if (ambito) data.ambito = ambito;
          const provincia = safeGet(row, fieldMap.get("provincia"));
          if (provincia) data.provincia = provincia;
          const cuePredio = safeGet(row, fieldMap.get("cuePredio"));
          if (cuePredio) data.cuePredio = cuePredio;
          const gpsPredio = safeGet(row, fieldMap.get("gpsPredio"));
          if (gpsPredio) data.gpsPredio = gpsPredio;

          // ── Auto-parsear GPS combinado → latitud/longitud ──
          // Si gpsPredio tiene "-35.xx, -62.xx" y no hay lat/lng mapeados, extraerlos
          if (gpsPredio && !data.latitud && !data.longitud) {
            const parsed = parseGPSCombined(gpsPredio);
            if (parsed.lat !== null) data.latitud = parsed.lat;
            if (parsed.lng !== null) data.longitud = parsed.lng;
          }

          // ── Auto-detectar provincia desde código de predio ──
          // Si no se proporcionó provincia explícita, detectar desde nombre/código
          if (!data.provincia) {
            const codigoForDetect = (data.codigo as string) || (data.nombre as string) || "";
            const detected = detectarProvincia(codigoForDetect);
            if (detected) data.provincia = detected;
          }

          // ── Auto-match estado por nombre si hay columna de estado ──
          // El estado de la fila tiene prioridad sobre el estadoId por defecto
          const estadoText = safeGet(row, fieldMap.get("estado"));
          if (estadoText) {
            const matchedEstadoId = matchEstado(estadoText);
            if (matchedEstadoId) data.estadoId = matchedEstadoId;
          }

          // Campos adicionales
          const tipoRed = safeGet(row, fieldMap.get("tipoRed"));
          if (tipoRed) data.tipoRed = tipoRed;
          const codigoPostal = safeGet(row, fieldMap.get("codigoPostal"));
          if (codigoPostal) data.codigoPostal = codigoPostal;
          const caracteristicaTelefonica = safeGet(row, fieldMap.get("caracteristicaTelefonica"));
          if (caracteristicaTelefonica) data.caracteristicaTelefonica = caracteristicaTelefonica;
          const telefonoVal = safeGet(row, fieldMap.get("telefono"));
          if (telefonoVal) data.telefono = telefonoVal;
          const labVal = safeGet(row, fieldMap.get("lab"));
          if (labVal) data.lab = labVal;
          const nombreInstitucion = safeGet(row, fieldMap.get("nombreInstitucion"));
          if (nombreInstitucion) data.nombreInstitucion = nombreInstitucion;
          const correoVal = safeGet(row, fieldMap.get("correo"));
          if (correoVal) data.correo = correoVal;
          const ordenVal = safeGet(row, fieldMap.get("orden"));
          if (ordenVal) { const v = parseInt(ordenVal); if (!isNaN(v)) data.orden = v; }

          // Fechas
          const fechaDesde = parseDate(safeGet(row, fieldMap.get("fechaDesde")));
          if (fechaDesde) data.fechaDesde = fechaDesde;
          const fechaHasta = parseDate(safeGet(row, fieldMap.get("fechaHasta")));
          if (fechaHasta) data.fechaHasta = fechaHasta;

          // Campos personalizados → camposExtra JSON
          if (customFieldMap.size > 0) {
            const extra: Record<string, string> = {};
            for (const [clave, colIdx] of Array.from(customFieldMap.entries())) {
              const val = safeGet(row, colIdx);
              if (val) extra[clave] = val;
            }
            if (Object.keys(extra).length > 0) data.camposExtra = extra;
          }

          // Helper: update existing predio (merge non-empty fields)
          const updateExistingPredio = async (existingId: string, existingCamposExtra: unknown) => {
            const updateData: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(data)) {
              if (key === "creadorId" || key === "prioridad") continue;
              if (val !== undefined && val !== null && val !== "") {
                if (key === "camposExtra" && existingCamposExtra) {
                  updateData.camposExtra = { ...(existingCamposExtra as Record<string, unknown>), ...(val as Record<string, unknown>) };
                } else {
                  updateData[key] = val;
                }
              }
            }
            if (Object.keys(updateData).length > 0) {
              await prisma.predio.update({ where: { id: existingId }, data: updateData as any });
            }
            const asignadoVal = safeGet(row, fieldMap.get("asignado"));
            if (asignadoVal) {
              const userId = matchUser(asignadoVal);
              if (userId) {
                const exists = await prisma.asignacion.findFirst({ where: { userId, predioId: existingId } });
                if (!exists) {
                  await prisma.asignacion.create({ data: { tipo: "TECNICO", userId, predioId: existingId } });
                }
              }
            }
          };

          // Código efectivo para deduplicación (mapeado o derivado de nombre)
          const effectiveCodigo = (data.codigo as string) || "";

          // Check for within-batch duplicate first
          if (effectiveCodigo && batchCreatedCodes.has(effectiveCodigo)) {
            const existingId = batchCreatedCodes.get(effectiveCodigo)!;
            await updateExistingPredio(existingId, null);
            updated++;
            continue;
          }

          // Si tiene código, buscar existente en DB
          if (effectiveCodigo) {
            const existing = await prisma.predio.findUnique({ where: { codigo: effectiveCodigo } });
            if (existing) {
              if (updateExisting) {
                await updateExistingPredio(existing.id, existing.camposExtra);
                batchCreatedCodes.set(effectiveCodigo, existing.id);
                updated++;
                continue;
              } else {
                // Auto-update within batch (first occurrence already created)
                errors.push(`Fila ${i + 2}: Código duplicado (activá "Actualizar existentes" para actualizar)`);
                skipped++;
                continue;
              }
            }
          }

          const newPredio = await prisma.predio.create({ data: data as any });
          if (effectiveCodigo) batchCreatedCodes.set(effectiveCodigo, newPredio.id);
          // Match asignado y crear Asignacion tras crear el predio
          const asignadoVal = safeGet(row, fieldMap.get("asignado"));
          if (asignadoVal) {
            const userId = matchUser(asignadoVal);
            if (userId) {
              const exists = await prisma.asignacion.findFirst({ where: { userId, predioId: newPredio.id } });
              if (!exists) {
                await prisma.asignacion.create({ data: { tipo: "TECNICO", userId, predioId: newPredio.id } });
              }
            }
          }
          created++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Error desconocido";
          if (msg.includes("Unique constraint") && !updateExisting) {
            errors.push(`Fila ${i + 2}: Código duplicado (activá "Actualizar existentes" para actualizar)`);
          } else {
            errors.push(`Fila ${i + 2}: ${msg}`);
          }
          skipped++;
        }
      }
    } else {
      if (!fieldMap.has("nombre") && !fieldMap.has("numeroSerie")) {
        return NextResponse.json({ error: 'Debes mapear la columna "Nombre" o "Número de Serie"' }, { status: 400 });
      }

      // Pre-cargar usuarios para matching de asignado
      let allUsers: { id: string; nombre: string }[] = [];
      if (fieldMap.has("asignado")) {
        allUsers = await prisma.user.findMany({
          where: { activo: true },
          select: { id: true, nombre: true },
        });
      }

      // Fecha de hoy en formato DD/MM/AAAA para auto-rellenar
      const hoy = new Date();
      const fechaHoy = `${String(hoy.getDate()).padStart(2, "0")}/${String(hoy.getMonth() + 1).padStart(2, "0")}/${hoy.getFullYear()}`;

      // ── Precarga en bloque (1-2 consultas) ──
      // Antes se hacía un findUnique por fila (miles de round-trips por lista),
      // lo que bajo carga producía fallas transitorias contadas como "omitido"
      // → conteos no deterministas. Acá traemos de una sola vez los equipos por
      // serial y por ID, y en el loop solo quedan las escrituras (con reintento).
      const serialsEnLista = new Set<string>();
      const idsEnLista = new Set<string>();
      for (const r of rows) {
        if (!Array.isArray(r)) continue;
        const s = safeGet(r, fieldMap.get("numeroSerie")); if (s) serialsEnLista.add(s);
        const idv = safeGet(r, fieldMap.get("id")); if (idv) idsEnLista.add(idv);
      }
      const equipoInclude = { asignado: { select: { nombre: true } } } as const;
      const existingBySerial = new Map<string, any>();
      if (serialsEnLista.size > 0) {
        const found = await prisma.equipo.findMany({ where: { numeroSerie: { in: Array.from(serialsEnLista) } }, include: equipoInclude });
        for (const e of found) if (e.numeroSerie) existingBySerial.set(e.numeroSerie, e);
      }
      const existingById = new Map<string, any>();
      if (idsEnLista.size > 0) {
        const found = await prisma.equipo.findMany({ where: { id: { in: Array.from(idsEnLista) } }, include: equipoInclude });
        for (const e of found) existingById.set(e.id, e);
      }
      // Precarga por Nº inventario para el cruce de seguridad ID ↔ inventario.
      const inventariosEnLista = new Set<number>();
      for (const r of rows) {
        if (!Array.isArray(r)) continue;
        const iv = safeGet(r, fieldMap.get("inventario"));
        if (iv) { const n = parseInt(iv, 10); if (!Number.isNaN(n)) inventariosEnLista.add(n); }
      }
      const existingByInventario = new Map<number, any>();
      if (inventariosEnLista.size > 0) {
        const found = await prisma.equipo.findMany({ where: { inventario: { in: Array.from(inventariosEnLista) } }, include: equipoInclude });
        for (const e of found) existingByInventario.set(e.inventario, e);
      }

      const COMPARE_FIELDS = ["nombre", "modelo", "estado", "ubicacion", "fecha", "notas", "marca", "categoria", "proveedor"];
      // Compara la fila nueva contra el equipo existente y arma el diff + la lista
      // de cambios reales (campos con valor nuevo distinto al actual).
      const calcularDiff = (data: Record<string, unknown>, existing: any, asignadoVal: string) => {
        const nuevo: Record<string, string> = {}; const existente: Record<string, string> = {};
        const iguales: string[] = []; const diferentes: string[] = [];
        const cmp = (campo: string, nv: unknown, ov: unknown) => {
          const newVal = String(nv ?? "").trim(); const oldVal = String(ov ?? "").trim();
          nuevo[campo] = newVal; existente[campo] = oldVal;
          if (newVal && oldVal && newVal.toUpperCase() === oldVal.toUpperCase()) iguales.push(campo);
          else if (newVal || oldVal) diferentes.push(campo);
        };
        for (const f of COMPARE_FIELDS) cmp(f, data[f], existing?.[f]);
        cmp("asignado", asignadoVal || "", existing?.asignado?.nombre || "");
        cmp("etiqueta", data.etiqueta ?? "", existing?.etiqueta ?? "");
        const cambios = diferentes.filter((f) => nuevo[f]).map((f) => ({ campo: f, antes: existente[f] || "—", despues: nuevo[f] }));
        return { nuevo, existente, iguales, diferentes, cambios };
      };

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !Array.isArray(row)) { skipped++; motivos.filaInvalida++; continue; }

        try {
          const nombre = safeGet(row, fieldMap.get("nombre"));
          const ns = safeGet(row, fieldMap.get("numeroSerie"));

          // Auto-fill por prefijo de serial
          const prefixMatch = ns ? SERIAL_PREFIX_MAP[ns.slice(0, 4).toUpperCase()] : null;
          const finalNombre = nombre || prefixMatch?.nombre || "";
          if (!finalNombre) { skipped++; motivos.sinNombre++; errors.push(`Fila ${i + 2}: sin Nombre ni Número de Serie reconocible — omitida`); continue; }

          const data: Record<string, unknown> = { nombre: finalNombre };

          const desc = safeGet(row, fieldMap.get("descripcion"));
          if (desc) data.descripcion = desc;
          if (ns) data.numeroSerie = ns;
          const modelo = safeGet(row, fieldMap.get("modelo"));
          data.modelo = modelo || prefixMatch?.modelo || "";
          const marca = safeGet(row, fieldMap.get("marca"));
          if (marca) data.marca = marca;
          const cat = safeGet(row, fieldMap.get("categoria"));
          if (cat) data.categoria = cat;
          const ub = safeGet(row, fieldMap.get("ubicacion"));
          if (ub) data.ubicacion = ub;
          const notas = safeGet(row, fieldMap.get("notas"));
          if (notas) data.notas = notas;
          const etiquetaVal = safeGet(row, fieldMap.get("etiqueta"));
          if (etiquetaVal) {
            data.etiqueta = etiquetaVal;
            data.etiquetaColor = colorParaEtiqueta(etiquetaVal); // color base para que la etiqueta se vea
          }
          const proveedorVal = safeGet(row, fieldMap.get("proveedor"));
          if (proveedorVal) data.proveedor = proveedorVal.toUpperCase().trim();
          const fecha = safeGet(row, fieldMap.get("fecha"));
          // Auto-rellenar fecha con hoy si está vacía
          data.fecha = fecha || fechaHoy;

          const cantStr = safeGet(row, fieldMap.get("cantidad"));
          if (cantStr) { const v = parseInt(cantStr); if (!isNaN(v) && v > 0) data.cantidad = v; }

          // Matching de estado: normalizar y buscar coincidencia parcial entre estados válidos
          const ESTADOS_VALIDOS = ["DISPONIBLE", "INSTALADO", "EN_TRANSITO", "ROTO", "PERDIDO", "EN_REPARACION", "BAJA"];
          const estadoVal = safeGet(row, fieldMap.get("estado"));
          if (estadoVal) {
            const normE = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/[\s_-]+/g, "_");
            const needle = normE(estadoVal);
            const match = ESTADOS_VALIDOS.find(e => {
              const n = normE(e);
              return n === needle || n.includes(needle) || needle.includes(n);
            });
            data.estado = match || "DISPONIBLE";
          } else {
            data.estado = "DISPONIBLE";
          }

          // Matching de asignado: normalizar (sin acentos, minúsculas) y match parcial
          const asignadoVal = safeGet(row, fieldMap.get("asignado"));
          if (asignadoVal && allUsers.length > 0) {
            const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            const needle = norm(asignadoVal);
            const match = allUsers.find(u => {
              const n = norm(u.nombre);
              return n === needle || n.includes(needle) || needle.includes(n);
            });
            if (match) data.asignadoId = match.id;
          }

          // Arma el objeto de update con solo los campos que traen valor.
          const buildUpdateData = (excludeSerial: boolean) => {
            const u: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(data)) {
              if (excludeSerial && key === "numeroSerie") continue; // no cambiar el serial
              if (val !== undefined && val !== null && val !== "") u[key] = val;
            }
            return u;
          };

          // ── Match por identidad (ID interno + Nº inventario) con CRUCE DE SEGURIDAD ──
          // Ambas columnas se exportan VISIBLES. Si una fila trae las dos y NO apuntan al
          // mismo equipo (o alguna no existe), es una fila DESALINEADA — típico de mover/
          // reordenar/ordenar datos en el Excel sin que el identificador acompañe a la
          // fila. En ese caso se OMITE sin escribir, para nunca pisar el equipo equivocado.
          const idVal = safeGet(row, fieldMap.get("id"));
          const invStr = safeGet(row, fieldMap.get("inventario"));
          const invNum = invStr ? parseInt(invStr, 10) : NaN;
          const hasId = !!idVal;
          const hasInv = !Number.isNaN(invNum);

          if (hasId || hasInv) {
            const byId = hasId ? existingById.get(idVal) : null;
            const byInv = hasInv ? existingByInventario.get(invNum) : null;
            let target: any = null;

            if (hasId && hasInv) {
              if (byId && byInv && byId.id === byInv.id) {
                target = byId; // identidad consistente
              } else {
                const detalle = (!byId && !byInv) ? `ni el ID ni el Nº inventario (${invNum}) existen`
                  : !byId ? `el ID no existe pero el Nº inventario ${invNum} pertenece a otro equipo`
                  : !byInv ? `el Nº inventario ${invNum} no existe pero el ID pertenece a otro equipo`
                  : `el ID y el Nº inventario ${invNum} apuntan a equipos DISTINTOS`;
                errors.push(`Fila ${i + 2}: fila desalineada — ${detalle}. NO se modificó (revisá que no se hayan movido/ordenado las columnas o filas en el Excel).`);
                skipped++; motivos.desalineado++;
                continue;
              }
            } else if (hasId) {
              if (!byId) {
                errors.push(`Fila ${i + 2}: ID "${idVal}" no encontrado (¿se editó/desordenó la columna ID?). Omitido para no pisar otro equipo.`);
                skipped++; motivos.idNoEncontrado++;
                continue;
              }
              target = byId;
            } else { // solo Nº inventario
              if (!byInv) {
                errors.push(`Fila ${i + 2}: Nº inventario ${invNum} no existe. Omitido (dejá esa celda vacía si es un equipo nuevo).`);
                skipped++; motivos.idNoEncontrado++;
                continue;
              }
              target = byInv;
            }

            const diff = calcularDiff(data, target, asignadoVal);
            await withRetry(() => prisma.equipo.update({ where: { id: target.id }, data: buildUpdateData(false) as any }));
            updated++;
            updates.push({ fila: i + 2, id: target.id, serial: target.numeroSerie || ns || null, cambios: diff.cambios });
            continue;
          }

          // ── Match por número de serie (precargado) ──
          if (ns) {
            const existing = existingBySerial.get(ns);
            if (existing) {
              const diff = calcularDiff(data, existing, asignadoVal);
              if (updateExisting) {
                await withRetry(() => prisma.equipo.update({ where: { id: existing.id }, data: buildUpdateData(true) as any }));
                updated++;
                duplicates.push({ fila: i + 2, serial: ns, nuevo: diff.nuevo, existente: diff.existente, iguales: diff.iguales, diferentes: diff.diferentes, accion: "actualizado" });
                updates.push({ fila: i + 2, serial: ns, cambios: diff.cambios });
              } else {
                errors.push(`Fila ${i + 2}: Número de serie duplicado`);
                skipped++; motivos.duplicado++;
                duplicates.push({ fila: i + 2, serial: ns, nuevo: diff.nuevo, existente: diff.existente, iguales: diff.iguales, diferentes: diff.diferentes, accion: "omitido" });
              }
              continue;
            }
          }

          const creado = await withRetry(() => prisma.equipo.create({ data: data as any, include: equipoInclude }));
          created++;
          // Registrar en el map para deduplicar repeticiones del mismo serial dentro de la lista.
          if (ns) existingBySerial.set(ns, creado);
        } catch (err: unknown) {
          const e = err as { code?: string; message?: string };
          const msg = e?.message || "Error desconocido";
          if (e?.code === "P2002" || /unique constraint/i.test(msg)) {
            errors.push(`Fila ${i + 2}: Número de serie duplicado`);
            skipped++; motivos.duplicado++;
          } else if (isTransientError(err)) {
            errors.push(`Fila ${i + 2}: error transitorio de base de datos tras reintentos — reintentá la importación de esta fila`);
            skipped++; motivos.transitorio++;
          } else {
            errors.push(`Fila ${i + 2}: ${msg.slice(0, 200)}`);
            skipped++; motivos.error++;
          }
        }
      }
    }

    try {
      await prisma.actividad.create({
        data: {
          accion: "CREAR",
          descripcion: `Importación masiva: ${created} creados${updated > 0 ? `, ${updated} actualizados` : ""} (${tipo === "PREDIO" ? "predios" : "equipos"})`,
          entidad: tipo,
          entidadId: "bulk-import",
          userId: session.userId,
          metadata: {
            tipo,
            created,
            updated,
            skipped,
            total: rows.length,
            motivos,
            errors: errors.slice(0, 50),
            duplicates: duplicates.slice(0, 50),
            updateExisting: Boolean(updateExisting),
            espacioId: espacioId || null,
            mappingsCount: mappings.length,
          },
        },
      });
    } catch { /* no bloquear por log */ }

    return NextResponse.json({
      success: true,
      created,
      updated,
      skipped,
      total: rows.length,
      // Desglose amplio para que se vea qué pasó con cada fila.
      resumen: {
        creados: created,
        actualizados: updated,
        omitidos: skipped,
        omitidoPorDuplicado: motivos.duplicado,
        omitidoPorDesalineacion: motivos.desalineado,
        omitidoPorIdNoEncontrado: motivos.idNoEncontrado,
        omitidoSinNombre: motivos.sinNombre,
        falladoTransitorio: motivos.transitorio,
        falladoOtro: motivos.error,
        filaInvalida: motivos.filaInvalida,
      },
      errors: errors.slice(0, 300),
      duplicates: duplicates.slice(0, 300),
      updates: updates.slice(0, 300),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("Import error:", msg);
    return NextResponse.json({ error: `Error al importar: ${msg}` }, { status: 500 });
  }
}
