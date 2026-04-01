// scripts/importPBA.mjs
// Importa predios Excel "Predios DANI PBA" a subcarpeta PBA dentro de Predios 2026
// Y luego quita asignaciones TH01 de la carpeta PBA-2
// Run: node scripts/importPBA.mjs

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// ─── DATOS DEL EXCEL (Predios DANI PBA.xlsx) ───────
// Columnas: #, CUE, Persona asignada, Estado, GPS, Orden, email,
//   Nombre Institucion, Departamento, telefono, codigo_postal,
//   Ambito, Tipo de Red, Proveedor LAB, caracteristica_telefonica,
//   Consolidado CUEs, Incidencias, Equipo
const PREDIOS_PBA = [
  { cue: "612811", orden: 45, email: "ji106907@gmail.com", nombre: 'JARDÍN DE INFANTES Nº907 "LIHUEN"', depto: "TRENQUE LAUQUEN", tel: "43-2802", cp: "6400", ambito: "Urbano", tipoRed: "GAP", lab: "Sin-Adjudicar", carTel: "2392", cueCons: "60624800", incidencias: "NI-000133835", gps: "-35.985907922674244, -62.737579181994406" },
  { cue: "612832", orden: 46, email: "ji905tl@gmail.com", nombre: 'JARDÍN DE INFANTES Nº905 "JAIME GLATTSTEIN"', depto: "TRENQUE LAUQUEN", tel: "43-1873", cp: "6400", ambito: "Urbano", tipoRed: "GAP", lab: "Sin-Adjudicar", carTel: "2392", cueCons: "60643400", incidencias: "NI-000133842", gps: "-35.959175955150066, -62.745306171932135" },
  { cue: "611349", orden: 47, email: "primaria40trenquelauquen@abc.gob.ar", nombre: 'ESCUELA DE EDUCACIÓN PRIMARIA Nº40 "RICARDO GÜIRALDES"', depto: "TRENQUE LAUQUEN", tel: "15-63-8067", cp: "6405", ambito: "Rural", tipoRed: "GAP", lab: "Sin-Adjudicar", carTel: "2392", cueCons: "60475000", incidencias: "NI-000133538", gps: "-36.39921540085317, -62.598416085056854" },
  { cue: "611858", orden: 48, email: "myriam_rossi@hotmail.com", nombre: 'ESCUELA DE EDUCACIÓN PRIMARIA Nº43 "LUIS PIEDRABUENA"', depto: "TRENQUE LAUQUEN", tel: "52-1544", cp: "6405", ambito: "Rural", tipoRed: "GAP", lab: "Sin-Adjudicar", carTel: "2392", cueCons: "61122000", incidencias: "NI-000133642", gps: "-36.344549474465936, -62.479532486052854" },
  { cue: "612149", orden: 49, email: "ximearguello82@gmail.com", nombre: 'JARDÍN DE INFANTES Nº912  "MARÍA ELENA WALSH"', depto: "TRENQUE LAUQUEN", tel: "41-9247", cp: "6407", ambito: "Rural Disperso", tipoRed: "GAP", lab: "Sin-Adjudicar", carTel: "2392", cueCons: "60074700", incidencias: "NI-000133686", gps: "-36.361518166769486, -62.35697844117488" },
  { cue: "613402", orden: 50, email: "cfl1renquelauquen@abc.gob.ar", nombre: 'CENTRO DE FORMACIÓN INTEGRAL Nº1 "LUIS PEREGO"', depto: "TRENQUE LAUQUEN", tel: "60-8485", cp: "6400", ambito: "Urbano", tipoRed: "GAP", lab: "Sin-Adjudicar", carTel: "2392", cueCons: "61518700", incidencias: "NI-000133940", gps: "-36.0187930575612, -62.749735145819905" },
  { cue: "614112", orden: 51, email: "jirimm12@gmail.com", nombre: 'JARDÍN DE INFANTES RURAL Nº12', depto: "TRENQUE LAUQUEN", tel: "42-3946", cp: "6400", ambito: "Rural Disperso", tipoRed: "GAP", lab: "Sin-Adjudicar", carTel: "2396", cueCons: "62162700", incidencias: "NI-000134069", gps: "-36.20337810197875, -62.23601329969187" },
  { cue: "614139", orden: 52, email: "jardinrural14trenquelauquen@abc.gob.ar", nombre: 'JARDÍN DE INFANTES RURAL Nº14', depto: "TRENQUE LAUQUEN", tel: "15-51-7134", cp: "6400", ambito: "Rural", tipoRed: "GAP", lab: "Sin-Adjudicar", carTel: "2392", cueCons: "62167400", incidencias: "NI-000134080", gps: "-35.75932370998977, -62.811059469665274" },
  { cue: "607665", orden: 80, email: "primaria4carloscasares@abc.gob.ar", nombre: 'ESCUELA DE EDUCACIÓN PRIMARIA Nº4 "MANUEL BELGRANO"', depto: "CARLOS CASARES", tel: "41-0387", cp: "6530", ambito: "Rural", tipoRed: "GAP", lab: "Sin-Adjudicar", carTel: "2396", cueCons: "60224300", incidencias: "NI-000133102", gps: "-35.58301574448039, -61.43782530219675" },
  { cue: "613117", orden: 93, email: "adrimarjunco@hotmail.com", nombre: 'JARDÍN DE INFANTES Nº904 "DARDO ROCHA"', depto: "PEHUAJO", tel: "49-8393", cp: "6474", ambito: "Urbano", tipoRed: "GAP", lab: "Sin-Adjudicar", carTel: "2396", cueCons: "61112100", incidencias: "NI-000133888", gps: "-35.85040254573313, -62.293482011896806" },
  { cue: "612665", orden: 96, email: "jardin916pehuajo@abc.gob.ar", nombre: 'JARDÍN DE INFANTES Nº916 "JUANA MANSO"', depto: "PEHUAJO", tel: "47-6882", cp: "6450", ambito: "Urbano", tipoRed: "GAP", lab: "Marcelo De Ambrosio", carTel: "2396", cueCons: "60465700", incidencias: "NI-000127288", gps: "-35.823291984563916, -61.897362665053954" },
];

function parseGPS(gpsStr) {
  if (!gpsStr) return { lat: null, lng: null };
  const parts = gpsStr.split(",").map(s => parseFloat(s.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { lat: parts[0], lng: parts[1] };
  }
  return { lat: null, lng: null };
}

async function main() {
  console.log("\n🔧 Importando predios PBA y limpiando PBA-2...\n");

  // ── 1. Buscar admin ──
  const admin = await prisma.user.findUnique({ where: { email: "griffith@thnet.com" } });
  if (!admin) { console.error("❌ Admin not found"); return; }

  // ── 2. Buscar TH01 user (Daniel c01) ──
  const th01 = await prisma.user.findUnique({ where: { email: "th01@thnet.com" } });
  if (!th01) console.warn("⚠️  TH01 user not found, no se crearán asignaciones");

  // ── 3. Buscar estado "SIN ASIGNAR" ──
  const sinAsignar = await prisma.estadoConfig.findUnique({ where: { clave: "sin_asignar" } });
  if (!sinAsignar) { console.error("❌ Estado SIN ASIGNAR no existe"); return; }

  // ── 4. Buscar/crear espacio "Predios 2026" ──
  let predios2026 = await prisma.espacioTrabajo.findFirst({
    where: { nombre: "Predios 2026", parentId: null },
  });
  if (!predios2026) {
    predios2026 = await prisma.espacioTrabajo.create({
      data: { nombre: "Predios 2026", color: "#f97316", icono: "folder", orden: 0, creadorId: admin.id },
    });
    console.log('✅ Creado espacio raíz "Predios 2026"');
  } else {
    console.log(`✓ Espacio "Predios 2026" existe (${predios2026.id})`);
  }

  // ── 5. Crear subcarpeta "PBA" dentro de "Predios 2026" ──
  let pba = await prisma.espacioTrabajo.findFirst({
    where: { nombre: "PBA", parentId: predios2026.id },
  });
  if (!pba) {
    pba = await prisma.espacioTrabajo.create({
      data: {
        nombre: "PBA",
        color: "#8b5cf6", // violeta
        icono: "list",
        orden: 1,
        parentId: predios2026.id,
        creadorId: admin.id,
      },
    });
    console.log('✅ Creada subcarpeta "PBA" dentro de "Predios 2026"');
  } else {
    console.log(`✓ Subcarpeta "PBA" ya existe (${pba.id})`);
  }

  // ── 6. Importar predios ──
  console.log(`\n📦 Importando ${PREDIOS_PBA.length} predios...\n`);
  let created = 0, skipped = 0;

  for (const p of PREDIOS_PBA) {
    // Check si ya existe por CUE (nombre)
    const existing = await prisma.predio.findFirst({ where: { nombre: p.cue } });
    if (existing) {
      console.log(`   = ${p.cue} "${p.nombre}" ya existe (espacio: ${existing.espacioId}), saltando`);
      skipped++;
      continue;
    }

    const gps = parseGPS(p.gps);

    const predio = await prisma.predio.create({
      data: {
        nombre: p.cue,
        codigo: p.cue,
        nombreInstitucion: p.nombre,
        correo: p.email,
        gpsPredio: p.gps,
        latitud: gps.lat,
        longitud: gps.lng,
        orden: p.orden,
        ciudad: p.depto,
        telefono: p.tel,
        codigoPostal: p.cp,
        ambito: p.ambito,
        tipoRed: p.tipoRed,
        lab: p.lab,
        caracteristicaTelefonica: p.carTel,
        cuePredio: p.cueCons,
        incidencias: p.incidencias,
        equipoAsignado: "Daniel",
        estadoId: sinAsignar.id,
        espacioId: pba.id,
        creadorId: admin.id,
      },
    });

    // Asignar a TH01 (Daniel c01)
    if (th01) {
      await prisma.asignacion.create({
        data: {
          tipo: "TECNICO",
          userId: th01.id,
          predioId: predio.id,
          notas: "Importado desde Excel PBA - Daniel c01",
        },
      });
    }

    console.log(`   + ${p.cue} - ${p.nombre} (orden ${p.orden})`);
    created++;
  }

  console.log(`\n✅ Importación PBA: ${created} creados, ${skipped} existentes\n`);

  // ═══════════════════════════════════════════════
  // ── 7. QUITAR ASIGNACIONES TH01 DE PBA-2 ──
  // ═══════════════════════════════════════════════
  console.log("🧹 Buscando carpeta PBA-2 para limpiar asignaciones TH01...\n");

  // Buscar carpeta PBA-2 (puede llamarse "PBA 2026", "PBA-2", "PBA2", etc.)
  const pba2Candidates = await prisma.espacioTrabajo.findMany({
    where: {
      OR: [
        { nombre: { contains: "PBA 2" } },
        { nombre: { contains: "PBA-2" } },
        { nombre: { contains: "PBA2" } },
      ],
    },
  });

  console.log(`   Espacios encontrados con "PBA 2/PBA-2":`, pba2Candidates.map(e => `${e.nombre} (${e.id})`));

  if (pba2Candidates.length === 0) {
    console.log("   ⚠️ No se encontró carpeta PBA-2");
  } else {
    for (const espacio of pba2Candidates) {
      // Excluir la nueva carpeta PBA que acabamos de crear
      if (espacio.id === pba.id) continue;

      console.log(`\n   📂 Procesando "${espacio.nombre}" (${espacio.id})...`);

      // Buscar predios en este espacio
      const prediosEnEspacio = await prisma.predio.findMany({
        where: { espacioId: espacio.id },
        select: { id: true, nombre: true },
      });

      if (prediosEnEspacio.length === 0) {
        console.log("      Sin predios en este espacio");
        continue;
      }

      // Buscar asignaciones TH01 en predios de este espacio
      if (!th01) {
        console.log("      ⚠️ TH01 user no encontrado, no se pueden buscar asignaciones");
        continue;
      }

      const asignacionesTH01 = await prisma.asignacion.findMany({
        where: {
          userId: th01.id,
          predioId: { in: prediosEnEspacio.map(p => p.id) },
        },
        include: { predio: { select: { nombre: true } } },
      });

      console.log(`      Asignaciones TH01 encontradas: ${asignacionesTH01.length}`);

      for (const a of asignacionesTH01) {
        await prisma.asignacion.delete({ where: { id: a.id } });
        console.log(`      ✖ Quitada asignación TH01 de predio ${a.predio.nombre}`);
      }

      console.log(`      ✅ ${asignacionesTH01.length} asignaciones TH01 eliminadas de "${espacio.nombre}"`);
    }
  }

  console.log("\n🏁 Proceso completo.\n");
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
