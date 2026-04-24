// scripts/importMtosAbril.mjs
// Importa predios desde el Excel "Mtos.Abril_THNET.xlsx" a un nuevo espacio "OCP" dentro de "Predios 2026".
import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";

const prisma = new PrismaClient();

// Parent "Predios 2026" que contiene ER 2026 / PBA 2026 (2) / SF 2026
const PARENT_PREDIOS_2026_ID = "cmn8x0m5u0003ussdnmmn0chd";
const SPACE_NAME = "OCP";
const EXCEL_PATH = process.argv[2] || "../Mtos.Abril_THNET.xlsx";

// Admin usado como creadorId
const ADMIN_EMAIL = "griffith@thnet.com";

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

async function main() {
  console.log("\n📂 Leyendo Excel:", EXCEL_PATH);
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const dataRows = rows.slice(1).filter((r) => r && r[1]); // requiere columna B (codigo)
  console.log(`   ✅ ${dataRows.length} filas con código`);

  // 1. Verificar/crear espacio OCP
  const parent = await prisma.espacioTrabajo.findUnique({
    where: { id: PARENT_PREDIOS_2026_ID },
  });
  if (!parent) throw new Error(`No existe el espacio padre ${PARENT_PREDIOS_2026_ID}`);
  console.log(`\n📁 Padre confirmado: "${parent.nombre}"`);

  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!admin) throw new Error(`No se encontró usuario admin ${ADMIN_EMAIL}`);

  let espacio = await prisma.espacioTrabajo.findFirst({
    where: { nombre: SPACE_NAME, parentId: PARENT_PREDIOS_2026_ID },
  });
  if (!espacio) {
    espacio = await prisma.espacioTrabajo.create({
      data: {
        nombre: SPACE_NAME,
        parentId: PARENT_PREDIOS_2026_ID,
        creadorId: admin.id,
      },
    });
    console.log(`   ✅ Creado espacio "${SPACE_NAME}" (${espacio.id})`);
  } else {
    console.log(`   ℹ️  Espacio "${SPACE_NAME}" ya existe (${espacio.id})`);
  }

  // 2. Importar cada fila
  console.log("\n📥 Importando predios...");
  let creados = 0, actualizados = 0, saltados = 0;

  for (const r of dataRows) {
    const [
      /* A */ workOrderNumber,
      /* B */ serviceAccount,
      /* C */ ambito,
      /* D */ predioConectadoPnce,
      /* E */ estadoConectividad,
      /* F */ numeroIncidencia,
      /* G */ tipoIncidencia,
      /* H */ subtipoIncidencia,
      /* I */ workOrderType,
      /* J */ primaryIncidentType,
      /* K */ systemStatus,
      /* L */ momentStatus,
      /* M */ provincia,
      /* N */ departamento,
      /* O */ fechaSerial,
      /* P */ ordenStr,
      /* Q */ ciudad,
      /* R */ calle,
      /* S */ latStr,
      /* T */ lngStr,
      /* U */ cuePredio,
      /* V */ consolidadoCues,
      /* W */ telefono,
      /* X */ email,
      /* Y */ ofertaEscolar,
      /* Z */ descripcion,
      /* AA */ cantidadAps,
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
      predioConectadoPnce: clean(predioConectadoPnce),
      estadoConectividad: clean(estadoConectividad),
      tipoIncidencia: clean(tipoIncidencia),
      subtipoIncidencia: clean(subtipoIncidencia),
      workOrderType: clean(workOrderType),
      primaryIncidentType: clean(primaryIncidentType),
      systemStatus: clean(systemStatus),
      momentStatus: clean(momentStatus),
      departamento: clean(departamento),
      consolidadoCues: clean(consolidadoCues),
      ofertaEscolar: clean(ofertaEscolar),
      cantidadApsInstalados: cantidadAps != null ? Number(cantidadAps) : null,
      workOrderNumber: clean(workOrderNumber),
    };
    // Remover nulls
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
