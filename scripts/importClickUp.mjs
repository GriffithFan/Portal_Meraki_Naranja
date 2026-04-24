// scripts/importClickUp.mjs
// Importa predios desde el JSON exportado de ClickUp
// Run: node scripts/importClickUp.mjs

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const prisma = new PrismaClient();

// ─── MAPEO DE ESTADOS ClickUp → clave en DB ────────
const STATUS_MAP = {
  "CONFORME":     { nombre: "CONFORME",     clave: "conforme",      color: "#a855f7", orden: 0 },
  "NO CONFORME":  { nombre: "NO CONFORME",  clave: "no_conforme",   color: "#dc2626", orden: 1 },
  "INSTALADO":    { nombre: "INSTALADO",    clave: "instalado",     color: "#facc15", orden: 2 },
  "EN PROGRESO":  { nombre: "EN PROGRESO",  clave: "en_progreso",   color: "#e11d8a", orden: 3 },
  "RELEVAR":      { nombre: "RELEVAR",      clave: "relevar",       color: "#0ea5e9", orden: 4 },
  "SIN ASIGNAR":  { nombre: "SIN ASIGNAR",  clave: "sin_asignar",   color: "#6b7280", orden: 5 },
};

// ─── MAPEO DE TÉCNICOS ClickUp → email en DB ───────
// Federico Albarracin = TH07, Daniel c01 = TH01, jorge fernandez = TH03, Adolfo W Cruz = TH04
const ASSIGNEE_MAP = {
  "Federico Albarracin": { email: "th07@thnet.com", label: "Federico Albarracin" },
  "Daniel c01":          { email: "th01@thnet.com", label: "Daniel c01" },
  "jorge fernandez":     { email: "th03@thnet.com", label: "jorge fernandez" },
  "Adolfo W Cruz":       { email: "th04@thnet.com", label: "Adolfo W Cruz" },
};

function parseDate(str) {
  if (!str) return null;
  // Format: DD/MM/YYYY
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`);
  // Format: YYYY-MM-DD HH:MM:SS
  const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return new Date(str.replace(" ", "T") + "Z");
  return null;
}

function parseGPS(gpsStr) {
  if (!gpsStr) return { lat: null, lng: null };
  // Format: "-34.47079, -62.29102"
  const parts = gpsStr.split(",").map(s => parseFloat(s.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    // Filter out 0.0, 0.0 as invalid
    if (parts[0] === 0 && parts[1] === 0) return { lat: null, lng: null };
    return { lat: parts[0], lng: parts[1] };
  }
  return { lat: null, lng: null };
}

async function main() {
  // Read exported JSON
  const raw = readFileSync("clickup_data.json", "utf-8");
  let tasks = JSON.parse(raw);
  // Filter out duplicate header rows
  tasks = tasks.filter(t => t.Status !== "Status" && t["Task Name"]);
  
  console.log(`\n📦 Importing ${tasks.length} predios from ClickUp...\n`);

  // ── 1. Ensure all estados exist ──
  console.log("1️⃣  Sincronizando estados...");
  const estadoIds = {};
  for (const [statusName, config] of Object.entries(STATUS_MAP)) {
    let estado = await prisma.estadoConfig.findUnique({ where: { clave: config.clave } });
    if (!estado) {
      estado = await prisma.estadoConfig.create({ data: config });
      console.log(`   ✅ Creado estado: ${config.nombre}`);
    } else {
      console.log(`   ✓ Estado existe: ${estado.nombre}`);
    }
    estadoIds[statusName] = estado.id;
  }

  // ── 2. Cache user IDs for assignees ──
  console.log("\n2️⃣  Buscando técnicos...");
  const userIds = {};
  for (const [clickupName, info] of Object.entries(ASSIGNEE_MAP)) {
    const user = await prisma.user.findUnique({ where: { email: info.email } });
    if (user) {
      userIds[clickupName] = user.id;
      console.log(`   ✓ ${clickupName} → ${user.nombre} (${info.email})`);
    } else {
      console.log(`   ⚠️ No encontrado: ${info.email} para ${clickupName}`);
    }
  }

  // ── 3. Create tag "dani" if needed ──
  console.log("\n3️⃣  Verificando etiquetas...");
  let etiquetaDani = await prisma.etiqueta.findUnique({ where: { nombre: "dani" } });
  if (!etiquetaDani) {
    etiquetaDani = await prisma.etiqueta.create({ data: { nombre: "dani", color: "#a855f7" } });
    console.log('   ✅ Creada etiqueta: "dani"');
  } else {
    console.log('   ✓ Etiqueta "dani" existe');
  }

  // ── 4. Get admin user for creadorId ──
  const admin = await prisma.user.findUnique({ where: { email: "griffith@thnet.com" } });
  if (!admin) {
    console.error("   ❌ Admin user not found!");
    return;
  }

  // ── 5. Import predios ──
  console.log("\n4️⃣  Importando predios...");
  let created = 0, skipped = 0;

  for (const t of tasks) {
    const nombre = t["Task Name"];
    
    // Check if predio already exists by nombre (predio number)
    const existing = await prisma.predio.findFirst({ where: { nombre } });
    if (existing) {
      console.log(`   = ${nombre} ya existe, saltando`);
      skipped++;
      continue;
    }

    const gps = parseGPS(t["GPS_Decimal (short text)"]);
    const statusName = t.Status;
    const estadoId = estadoIds[statusName] || null;

    // Build camposExtra with all ClickUp fields that don't have dedicated columns
    const camposExtra = {};
    const extraFields = {
      "Comentario_nivel 3": t["Comentario_nivel 3 (short text)"],
      "Descripción": t["Descripción (short text)"],
      "Direccion_SF": t["Direccion_SF (short text)"],
      "Nombre_Escuela_SF": t["Nombre_Escuela_SF (short text)"],
      "Predio: Ambito": t["Predio: Ambito (short text)"],
      "Predio: Estado Conectividad Mined": t["Predio: Estado Conectividad Mined (short text)"],
      "Predio: Proveedor LAB": t["Predio: Proveedor LAB (short text)"],
      "Predio: Tipo de Red": t["Predio: Tipo de Red (short text)"],
      "Momento de la Incidencia": t["Momento de la Incidencia (short text)"],
      "Motivo resuelto Estado Nivel 3": t["Motivo resuelto Estado Nivel 3 (short text)"],
      "Tipo de Incidencia": t["Tipo de Incidencia (short text)"],
      "Departamento": t["Departamento (short text)"],
      "Task ID (ClickUp)": t["Task ID"],
      "Task Content": t["Task Content"],
    };
    for (const [k, v] of Object.entries(extraFields)) {
      if (v && v.trim() && v.trim() !== "&nbsp;") {
        camposExtra[k] = v.trim();
      }
    }

    const predioData = {
      nombre,
      codigo: nombre, // Use predio number as unique code
      estadoId,
      creadorId: admin.id,
      incidencias: t["Incidencias (short text)"] || null,
      cue: t["CUE (short text)"] || null,
      cuePredio: t["CUEs (short text)"] || null,
      lacR: t["LAC-R (drop down)"] || null,
      equipoAsignado: t["Equipo (short text)"] || null, // TH01, TH02, etc.
      provincia: t["Provincia (short text)"] || null,
      gpsPredio: t["GPS_Predio (short text)"] || null,
      merakiNetworkName: t["Meraki_Nombre_Org (short text)"] || null,
      latitud: gps.lat,
      longitud: gps.lng,
      fechaDesde: parseDate(t["DESDE (short text)"]),
      fechaHasta: parseDate(t["HASTA (short text)"]),
      fechaActualizacion: parseDate(t["Date Updated"]),
      notas: t["Task Content"] && t["Task Content"].trim() && t["Task Content"].trim() !== "\n" 
        ? t["Task Content"].trim() 
        : null,
      camposExtra: Object.keys(camposExtra).length > 0 ? camposExtra : undefined,
    };

    const predio = await prisma.predio.create({ data: predioData });

    // ── Assign technician ──
    const assigneeName = t.Assignee;
    if (assigneeName && userIds[assigneeName]) {
      await prisma.asignacion.create({
        data: {
          tipo: "TECNICO",
          userId: userIds[assigneeName],
          predioId: predio.id,
          notas: `Importado de ClickUp - ${assigneeName}`,
        },
      });
    }

    // ── Add tag "dani" if present ──
    const tags = t.tags || "";
    if (tags.includes("dani")) {
      await prisma.predioEtiqueta.create({
        data: {
          predioId: predio.id,
          etiquetaId: etiquetaDani.id,
        },
      });
    }

    const assigneeLabel = assigneeName ? ` → ${assigneeName}` : "";
    const tagLabel = tags.includes("dani") ? " [dani]" : "";
    console.log(`   + ${nombre} (${statusName})${assigneeLabel}${tagLabel}`);
    created++;
  }

  console.log(`\n✅ Importación completa!`);
  console.log(`   📊 Creados: ${created} | Saltados: ${skipped} | Total: ${tasks.length}`);
  console.log(`   📋 Estados: ${Object.keys(estadoIds).join(", ")}`);
}

main()
  .catch(e => { console.error("❌ Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
