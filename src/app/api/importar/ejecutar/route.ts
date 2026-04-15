import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { parseBody, isErrorResponse, importarEjecutarSchema } from "@/lib/validation";
import { detectarProvincia } from "@/utils/provinciaUtils";
import { resolveEquipoKey } from "@/utils/equipoUtils";

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
  equipoAsignado: "Equipo (TH01-TH10)",
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
};

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
  const duplicates: { fila: number; serial: string; nuevo: Record<string, string>; existente: Record<string, string>; iguales: string[]; diferentes: string[] }[] = [];

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

      // Mapeo de nombres/alias de t\u00e9cnicos → código de equipo (TH01, TH02, etc.)
      // Usa el módulo centralizado equipoUtils

      /** Detectar equipo a partir de un nombre de técnico */
      const detectEquipoFromName = (val: string): string | null => {
        if (!val) return null;
        return resolveEquipoKey(val);
      };

      /** Match usuario por nombre, email o alias (ej: "Daniel c01" → th01@thnet.com) */
      const matchUser = (val: string): string | null => {
        if (!val || predioUsers.length === 0) return null;
        const needle = norm(val);

        // 1. Intento con equipo detectado → buscar user por email que empiece con THxx
        const equipo = detectEquipoFromName(val);
        if (equipo) {
          const eqLower = equipo.toLowerCase();
          const byEmail = predioUsers.find(u => norm(u.email).split("@")[0] === eqLower);
          if (byEmail) return byEmail.id;
        }

        // 2. Match por nombre directo
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
          const equipoAsignado = safeGet(row, fieldMap.get("equipoAsignado"));
          if (equipoAsignado) data.equipoAsignado = equipoAsignado.toUpperCase();
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

          // ── Auto-detectar equipoAsignado desde nombre de asignado ──
          // Si no viene equipo explícito pero sí hay columna "asignado" con nombre de técnico
          if (!data.equipoAsignado) {
            const asignadoRaw = safeGet(row, fieldMap.get("asignado"));
            if (asignadoRaw) {
              const detectedEquipo = detectEquipoFromName(asignadoRaw);
              if (detectedEquipo) data.equipoAsignado = detectedEquipo;
            }
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

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !Array.isArray(row)) { skipped++; continue; }

        try {
          const nombre = safeGet(row, fieldMap.get("nombre"));
          const ns = safeGet(row, fieldMap.get("numeroSerie"));

          // Auto-fill por prefijo de serial
          const prefixMatch = ns ? SERIAL_PREFIX_MAP[ns.slice(0, 4).toUpperCase()] : null;
          const finalNombre = nombre || prefixMatch?.nombre || "";
          if (!finalNombre) { skipped++; continue; }

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
          const fecha = safeGet(row, fieldMap.get("fecha"));
          // Auto-rellenar fecha con hoy si está vacía
          data.fecha = fecha || fechaHoy;

          const cantStr = safeGet(row, fieldMap.get("cantidad"));
          if (cantStr) { const v = parseInt(cantStr); if (!isNaN(v) && v > 0) data.cantidad = v; }

          // Matching de estado: normalizar y buscar coincidencia parcial entre estados válidos
          const ESTADOS_VALIDOS = ["DISPONIBLE", "INSTALADO", "EN_TRANSITO", "ROTO", "PERDIDO", "EN_REPARACION"];
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

          // Verificar si serial ya existe antes de crear (para detalle de duplicados)
          if (ns) {
            const existing = await prisma.equipo.findUnique({ where: { numeroSerie: ns }, include: { asignado: { select: { nombre: true } } } });
            if (existing) {
              const COMPARE_FIELDS = ["nombre", "modelo", "estado", "ubicacion", "fecha", "notas", "marca", "categoria"];
              const nuevoObj: Record<string, string> = {};
              const existenteObj: Record<string, string> = {};
              const iguales: string[] = [];
              const diferentes: string[] = [];
              for (const f of COMPARE_FIELDS) {
                const newVal = String(data[f] ?? "").trim();
                const oldVal = String((existing as any)[f] ?? "").trim();
                nuevoObj[f] = newVal;
                existenteObj[f] = oldVal;
                if (newVal && oldVal && newVal.toUpperCase() === oldVal.toUpperCase()) iguales.push(f);
                else if (newVal || oldVal) diferentes.push(f);
              }
              // Asignado
              const newAsignado = asignadoVal || "";
              const oldAsignado = existing.asignado?.nombre || "";
              nuevoObj.asignado = newAsignado;
              existenteObj.asignado = oldAsignado;
              if (newAsignado && oldAsignado && newAsignado.toLowerCase() === oldAsignado.toLowerCase()) iguales.push("asignado");
              else if (newAsignado || oldAsignado) diferentes.push("asignado");

              duplicates.push({ fila: i + 2, serial: ns, nuevo: nuevoObj, existente: existenteObj, iguales, diferentes });

              // Si updateExisting está activo, sobreescribir con los datos nuevos (solo campos con valor)
              if (updateExisting) {
                const updateData: Record<string, unknown> = {};
                for (const [key, val] of Object.entries(data)) {
                  if (key === "numeroSerie") continue; // no cambiar el serial
                  if (val !== undefined && val !== null && val !== "") {
                    updateData[key] = val;
                  }
                }
                await prisma.equipo.update({ where: { id: existing.id }, data: updateData as any });
                updated++;
              } else {
                errors.push(`Fila ${i + 2}: Número de serie duplicado`);
                skipped++;
              }
              continue;
            }
          }

          await prisma.equipo.create({ data: data as any });
          created++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Error desconocido";
          errors.push(`Fila ${i + 2}: ${msg.includes("Unique constraint") ? "Número de serie duplicado" : msg}`);
          skipped++;
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
        },
      });
    } catch { /* no bloquear por log */ }

    return NextResponse.json({ success: true, created, updated, skipped, total: rows.length, errors: errors.slice(0, 20), duplicates: duplicates.slice(0, 20) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("Import error:", msg);
    return NextResponse.json({ error: `Error al importar: ${msg}` }, { status: 500 });
  }
}
