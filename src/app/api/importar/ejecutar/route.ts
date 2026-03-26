import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { parseBody, isErrorResponse, importarEjecutarSchema } from "@/lib/validation";

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

  try {
    if (tipo === "PREDIO") {
      // Requiere al menos "nombre" o "codigo" (para updates)
      if (!fieldMap.has("nombre") && !fieldMap.has("codigo")) {
        return NextResponse.json({ error: 'Debes mapear al menos "Nombre / CUE" o "Código"' }, { status: 400 });
      }

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

          // Si tiene código y updateExisting, hacer upsert
          if (codigo && updateExisting) {
            const existing = await prisma.predio.findUnique({ where: { codigo } });
            if (existing) {
              // Solo actualizar campos que vienen en el Excel (no sobreescribir con vacíos)
              const updateData: Record<string, unknown> = {};
              for (const [key, val] of Object.entries(data)) {
                if (key === "creadorId" || key === "prioridad") continue;
                if (val !== undefined && val !== null && val !== "") {
                  // Merge camposExtra en vez de sobreescribir
                  if (key === "camposExtra" && existing.camposExtra) {
                    updateData.camposExtra = { ...(existing.camposExtra as Record<string, unknown>), ...(val as Record<string, unknown>) };
                  } else {
                    updateData[key] = val;
                  }
                }
              }
              await prisma.predio.update({ where: { codigo }, data: updateData as any });
              updated++;
              continue;
            }
          }
          await prisma.predio.create({ data: data as any });
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
      if (!fieldMap.has("nombre")) {
        return NextResponse.json({ error: 'Debes mapear la columna "Nombre"' }, { status: 400 });
      }

      // Pre-cargar usuarios para matching de asignado
      let allUsers: { id: string; nombre: string }[] = [];
      if (fieldMap.has("asignado")) {
        allUsers = await prisma.user.findMany({
          where: { activo: true },
          select: { id: true, nombre: true },
        });
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !Array.isArray(row)) { skipped++; continue; }

        try {
          const nombre = safeGet(row, fieldMap.get("nombre"));
          if (!nombre) { skipped++; continue; }

          const data: Record<string, unknown> = { nombre };

          const desc = safeGet(row, fieldMap.get("descripcion"));
          if (desc) data.descripcion = desc;
          const ns = safeGet(row, fieldMap.get("numeroSerie"));
          if (ns) data.numeroSerie = ns;
          const modelo = safeGet(row, fieldMap.get("modelo"));
          if (modelo) data.modelo = modelo;
          const marca = safeGet(row, fieldMap.get("marca"));
          if (marca) data.marca = marca;
          const cat = safeGet(row, fieldMap.get("categoria"));
          if (cat) data.categoria = cat;
          const ub = safeGet(row, fieldMap.get("ubicacion"));
          if (ub) data.ubicacion = ub;
          const notas = safeGet(row, fieldMap.get("notas"));
          if (notas) data.notas = notas;

          const cantStr = safeGet(row, fieldMap.get("cantidad"));
          if (cantStr) { const v = parseInt(cantStr); if (!isNaN(v) && v > 0) data.cantidad = v; }

          const estadoVal = safeGet(row, fieldMap.get("estado"));
          if (estadoVal) data.estado = estadoVal.toUpperCase();

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
          descripcion: `Importación masiva: ${created} ${tipo === "PREDIO" ? "predios" : "equipos"}`,
          entidad: tipo,
          entidadId: "bulk-import",
          userId: session.userId,
        },
      });
    } catch { /* no bloquear por log */ }

    return NextResponse.json({ success: true, created, updated, skipped, total: rows.length, errors: errors.slice(0, 20) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("Import error:", msg);
    return NextResponse.json({ error: `Error al importar: ${msg}` }, { status: 500 });
  }
}
