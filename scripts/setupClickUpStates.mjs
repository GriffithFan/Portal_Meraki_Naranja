// scripts/setupClickUpStates.mjs
// Configura estados, espacios y asignaciones para replicar ClickUp
// Run: node scripts/setupClickUpStates.mjs

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// ─── ESTADOS EXACTOS DE CLICKUP (en orden) ─────────
// Colores extraídos de las capturas del usuario
const ESTADOS_CLICKUP = [
  // Abiertos
  { nombre: "SIN ASIGNAR",           clave: "sin_asignar",          color: "#6b7280", orden: 0  },  // gris
  { nombre: "BLOCKEADO",             clave: "blockeado",            color: "#4b5563", orden: 1  },  // gris oscuro
  { nombre: "REVISION INSTALACION",  clave: "revision_instalacion", color: "#4f46e5", orden: 2  },  // índigo
  { nombre: "RELEVAR",               clave: "relevar",              color: "#0ea5e9", orden: 3  },  // azul cielo
  { nombre: "RELEVADO",              clave: "relevado",             color: "#14b8a6", orden: 4  },  // teal (no verde, distingue de CERRADO)
  { nombre: "CAMBIO LAC",            clave: "cambio_lac",           color: "#a16207", orden: 5  },  // marrón
  { nombre: "EN PROGRESO",           clave: "en_progreso",          color: "#e11d8a", orden: 6  },  // magenta
  { nombre: "INSTALADO",             clave: "instalado",            color: "#facc15", orden: 7  },  // amarillo
  { nombre: "AUDITAR",               clave: "auditar",              color: "#f97316", orden: 8  },  // naranja
  { nombre: "NO CONFORME",           clave: "no_conforme",          color: "#dc2626", orden: 9  },  // rojo fuerte
  { nombre: "NO APTO",               clave: "no_apto",              color: "#2563eb", orden: 10 },  // azul intenso
  { nombre: "CONFORME",              clave: "conforme",             color: "#a855f7", orden: 11 },  // púrpura (con check)
  // Cerrado
  { nombre: "CERRADO",               clave: "cerrado",              color: "#16a34a", orden: 12 },  // verde check
];

async function main() {
  console.log("\n🔧 Configurando estados, espacios y asignaciones de ClickUp...\n");

  // ── 1. ACTUALIZAR ESTADOS ──
  console.log("1️⃣  Sincronizando estados...");
  
  // Primero, desactivar estados que ya no se usan
  const obsoletos = ["pendiente", "en_proceso", "cancelado"];
  for (const clave of obsoletos) {
    const e = await prisma.estadoConfig.findUnique({ where: { clave } });
    if (e) {
      await prisma.estadoConfig.update({ where: { clave }, data: { activo: false } });
      console.log(`   🔴 Desactivado: ${e.nombre}`);
    }
  }

  // Crear o actualizar cada estado de ClickUp
  for (const est of ESTADOS_CLICKUP) {
    const existing = await prisma.estadoConfig.findUnique({ where: { clave: est.clave } });
    if (existing) {
      await prisma.estadoConfig.update({
        where: { clave: est.clave },
        data: { nombre: est.nombre, color: est.color, orden: est.orden, activo: true },
      });
      console.log(`   ✏️  Actualizado: ${est.nombre} (${est.color})`);
    } else {
      await prisma.estadoConfig.create({ data: est });
      console.log(`   ✅ Creado: ${est.nombre} (${est.color})`);
    }
  }

  // ── 2. CREAR JERARQUÍA DE ESPACIOS ──
  console.log("\n2️⃣  Creando espacios de trabajo...");
  
  // Buscar admin para creadorId
  const admin = await prisma.user.findUnique({ where: { email: "griffith@thnet.com" } });
  if (!admin) {
    console.error("   ❌ Admin user not found!");
    return;
  }

  // Crear espacio raíz "Predios 2026"
  let predios2026 = await prisma.espacioTrabajo.findFirst({
    where: { nombre: "Predios 2026", parentId: null },
  });
  if (!predios2026) {
    predios2026 = await prisma.espacioTrabajo.create({
      data: {
        nombre: "Predios 2026",
        color: "#f97316", // naranja
        icono: "folder",
        orden: 0,
        creadorId: admin.id,
      },
    });
    console.log('   ✅ Creado espacio raíz: "Predios 2026"');
  } else {
    console.log('   ✓ Espacio "Predios 2026" ya existe');
  }

  // Crear sub-espacio "PBA 2026" dentro de "Predios 2026"
  let pba2026 = await prisma.espacioTrabajo.findFirst({
    where: { nombre: "PBA 2026", parentId: predios2026.id },
  });
  if (!pba2026) {
    pba2026 = await prisma.espacioTrabajo.create({
      data: {
        nombre: "PBA 2026",
        color: "#3b82f6", // azul
        icono: "list",
        orden: 0,
        parentId: predios2026.id,
        creadorId: admin.id,
      },
    });
    console.log('   ✅ Creado sub-espacio: "PBA 2026" dentro de "Predios 2026"');
  } else {
    console.log('   ✓ Sub-espacio "PBA 2026" ya existe');
  }

  // ── 3. ASIGNAR PREDIOS A "PBA 2026" ──
  console.log("\n3️⃣  Asignando predios a PBA 2026...");
  
  const predios = await prisma.predio.findMany({
    where: { espacioId: null },
    select: { id: true, nombre: true },
  });

  let assigned = 0;
  for (const p of predios) {
    await prisma.predio.update({
      where: { id: p.id },
      data: { espacioId: pba2026.id },
    });
    assigned++;
  }
  console.log(`   ✅ ${assigned} predios asignados a PBA 2026`);

  // ── RESUMEN ──
  console.log("\n✅ Configuración completa!");
  console.log("   📋 Estados:", ESTADOS_CLICKUP.map(e => e.nombre).join(", "));
  console.log("   📁 Predios 2026 > PBA 2026");
  console.log(`   📊 ${assigned} predios en PBA 2026`);
}

main()
  .catch(e => { console.error("❌ Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
