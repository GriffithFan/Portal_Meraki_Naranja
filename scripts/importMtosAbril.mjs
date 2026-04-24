// scripts/importMtosAbril.mjs
// Importa predios desde el Excel "Mtos.Abril_THNET.xlsx" a un nuevo espacio "OCP"
// dentro de "Predios 2026". También crea los CampoPersonalizado para que las
// columnas extra se muestren como columnas en la grilla.
import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";

const prisma = new PrismaClient();

const PARENT_PREDIOS_2026_ID = "cmn8x0m5u0003ussdnmmn0chd";
const SPACE_NAME = "OCP";
const EXCEL_PATH = process.argv[2] || "../Mtos.Abril_THNET.xlsx";
const ADMIN_EMAIL = "griffith@thnet.com";

// Campos personalizados a crear para cada columna del Excel sin mapping directo.
// La clave la genera el sistema: lowercase + sin acentos + non-alphanum → "_"
const CAMPOS_CUSTOM = [
  { nombre: "Predio Conectado PNCE",    tipo: "text" },
  { nombre: "Estado Conectividad",      tipo: "text" },
  { nombre: "Tipo de Incidencia",       tipo: "text" },
  { nombre: "Subtipo de Incidencia",    tipo: "text" },
  { nombre: "Work Order Type",          tipo: "text" },
  { nombre: "Primary Incident Type",    tipo: "text" },
  { nombre: "System Status",            tipo: "text" },
  { nombre: "Moment Status",            tipo: "text" },
  { nombre: "Departamento",             tipo: "text" },
  { nombre: "Consolidado CUEs",         tipo: "text" },
  { nombre: "Oferta Escolar",           tipo: "text" },
  { nombre: "Cantidad APs Instalados",  tipo: "number" },
  { nombre: "Work Order Number",        tipo: "text" },
];

function genClave(nombre) {
  return nombre
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function excelSerialToDate(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function numFromCommaStr(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/\./g, "").replace(",", ".").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function clean(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

async function ensureCustomFields() {
  console.log("\n🧩 Asegurando Campos Personalizados...");
  const claveMap = {};
  const maxOrdenAgg = await prisma.campoPersonalizado.aggregate({ _max: { orden: true } });
  let nextOrden = (maxOrdenAgg._max.orden ?? 0) + 1;

  for (const c of CAMPOS_CUSTOM) {
    const clave = genClave(c.nombre);
    claveMap[c.nombre] = clave;
    const existing = await prisma.campoPersonalizado.findUnique({ where: { clave } });
    if (existing) {
      if (!existing.activo) {
        await prisma.campoPersonalizado.update({
          where: { clave },
          data: { activo: true, nombre: c.nombre },
        });
        console.log(`   ♻️  Reactivado: ${c.nombre} (${clave})`);
      } else {
        console.log(`   ✓ Ya existe: ${c.nombre} (${clave})`);
      }
    } else {
      await prisma.campoPersonalizado.create({
        data: {
          clave,
          nombre: c.nombre,
          tipo: c.tipo || "text",
          orden: nextOrden++,
        },
      });
      console.log(`   ✅ Creado: ${c.nombre} (${clave})`);
    }
  }
  return claveMap;
}

async function main() {
  console.log("\n📂 Leyendo Excel:", EXCEL_PATH);
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const dataRows = rows.slice(1).filter((r) => r && r[1]);
  console.log(`   ✅ ${dataRows.length} filas con código`);

  const parent = await prisma.espacioTrabajo.findUnique({ where: { id: PARENT_PREDIOS_2026_ID } });
  if (!parent) throw new Error(`No existe el espacio padre ${PARENT_PREDIOS_2026_ID}`);
  console.log(`\n📁 Padre confirmado: "${parent.nombre}"`);

  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!admin) throw new Error(`No se encontró usuario admin ${ADMIN_EMAIL}`);

  let espacio = await prisma.espacioTrabajo.findFirst({
    where: { nombre: SPACE_NAME, parentId: PARENT_PREDIOS_2026_ID },
  });
  if (!espacio) {
    espacio = await prisma.espacioTrabajo.create({
      data: { nombre: SPACE_NAME, parentId: PARENT_PREDIOS_2026_ID, creadorId: admin.id },
    });
    console.log(`   ✅ Creado espacio "${SPACE_NAME}" (${espacio.id})`);
  } else {
    console.log(`   ℹ️  Espacio "${SPACE_NAME}" ya existe (${espacio.id})`);
  }

  const claveMap = await ensureCustomFields();

  console.log("\n📥 Importando predios...");
  let creados = 0, actualizados = 0, saltados = 0;

  for (const r of dataRows) {
    const [
      workOrderNumber,      // A
      serviceAccount,       // B - codigo
      ambito,               // C
      predioConectadoPnce,  // D
      estadoConectividad,   // E
      numeroIncidencia,     // F
      tipoIncidencia,       // G
      subtipoIncidencia,    // H
      workOrderType,        // I
      primaryIncidentType,  // J
      systemStatus,         // K
      momentStatus,         // L
      provincia,            // M
      departamento,         // N
      fechaSerial,          // O
      ordenStr,             // P
      ciudad,               // Q
      calle,                // R
      latStr,               // S
      lngStr,               // T
      cuePredio,            // U
      consolidadoCues,      // V
      telefono,             // W
      email,                // X
      ofertaEscolar,        // Y
      descripcion,          // Z
      cantidadAps,          // AA
    ] = r;

    const codigo = clean(serviceAccount);
    if (!codigo) { saltados++; continue; }

    const direccion = clean(calle);
    const ciudadNom = clean(ciudad);
    const nombre = direccion || ciudadNom || `Predio ${codigo}`;

    const latitud = numFromCommaStr(latStr);
    const longitud = numFromCommaStr(lngStr);
    const fechaProgramada = excelSerialToDate(fechaSerial);
    const ordenNum = Number.isFinite(Number(ordenStr)) ? Number(ordenStr) : 0;

    const camposExtra = {
      [claveMap["Predio Conectado PNCE"]]: clean(predioConectadoPnce),
      [claveMap["Estado Conectividad"]]:   clean(estadoConectividad),
      [claveMap["Tipo de Incidencia"]]:    clean(tipoIncidencia),
      [claveMap["Subtipo de Incidencia"]]: clean(subtipoIncidencia),
      [claveMap["Work Order Type"]]:       clean(workOrderType),
      [claveMap["Primary Incident Type"]]: clean(primaryIncidentType),
      [claveMap["System Status"]]:         clean(systemStatus),
      [claveMap["Moment Status"]]:         clean(momentStatus),
      [claveMap["Departamento"]]:          clean(departamento),
      [claveMap["Consolidado CUEs"]]:      clean(consolidadoCues),
      [claveMap["Oferta Escolar"]]:        clean(ofertaEscolar),
      [claveMap["Cantidad APs Instalados"]]: cantidadAps != null && cantidadAps !== "" ? Number(cantidadAps) : null,
      [claveMap["Work Order Number"]]:     clean(workOrderNumber),
    };
    for (const k of Object.keys(camposExtra)) {
      if (camposExtra[k] == null) delete camposExtra[k];
    }

    const baseData = {
      nombre,
      codigo,
      direccion,
      ciudad: ciudadNom,
      provincia: clean(provincia),
      latitud,
      longitud,
      fechaProgramada,
      orden: ordenNum,
      incidencias: clean(numeroIncidencia),
      ambito: clean(ambito),
      cue: clean(cuePredio),
      cuePredio: clean(cuePredio),
      telefono: clean(telefono),
      correo: clean(email),
      notas: clean(descripcion),
      gpsPredio: latitud != null && longitud != null ? `${latitud},${longitud}` : null,
      camposExtra: Object.keys(camposExtra).length ? camposExtra : null,
      espacioId: espacio.id,
      creadorId: admin.id,
    };

    const existing = await prisma.predio.findUnique({ where: { codigo } });
    if (existing) {
      await prisma.predio.update({ where: { codigo }, data: baseData });
      actualizados++;
      console.log(`   ✏️  ${codigo} — ${nombre}`);
    } else {
      await prisma.predio.create({ data: baseData });
      creados++;
      console.log(`   ✅ ${codigo} — ${nombre}`);
    }
  }

  console.log("\n📊 Resumen:");
  console.log(`   Creados: ${creados}`);
  console.log(`   Actualizados: ${actualizados}`);
  console.log(`   Saltados (sin código): ${saltados}`);
  console.log(`   Espacio OCP: ${espacio.id}`);
}

main()
  .catch((e) => { console.error("❌ Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
