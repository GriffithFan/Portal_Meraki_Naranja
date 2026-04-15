const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  // Encontrar usuario TH01
  const th01 = await p.user.findFirst({ where: { nombre: "TH01" } });
  console.log("Usuario TH01:", th01?.id, th01?.nombre, th01?.rol);

  // Variantes de equipo para TH01
  const variants = ["TH01", "DANIEL", "DANI", "DANIEL C01"];

  // Todos los predios de TH01 (por equipoAsignado o asignacion)
  const allPredios = await p.predio.findMany({
    where: {
      OR: [
        { equipoAsignado: { in: variants, mode: "insensitive" } },
        { asignaciones: { some: { userId: th01.id } } },
      ],
    },
    select: {
      id: true, nombre: true, codigo: true,
      equipoAsignado: true,
      latitud: true, longitud: true,
      espacioId: true,
      estado: { select: { nombre: true, clave: true } },
    },
  });

  console.log(`\n=== TOTAL predios de TH01: ${allPredios.length} ===\n`);

  // Agrupar por espacio
  const byEspacio = {};
  for (const p2 of allPredios) {
    const eid = p2.espacioId || "SIN_ESPACIO";
    if (!byEspacio[eid]) byEspacio[eid] = [];
    byEspacio[eid].push(p2);
  }

  // Buscar nombres de espacios
  const espacios = await p.espacioTrabajo.findMany({
    where: { id: { in: Object.keys(byEspacio).filter(k => k !== "SIN_ESPACIO") } },
    select: { id: true, nombre: true },
  });
  const espMap = {};
  for (const e of espacios) espMap[e.id] = e.nombre;

  for (const [eid, preds] of Object.entries(byEspacio)) {
    const nombre = espMap[eid] || eid;
    console.log(`\n--- Espacio: ${nombre} (${preds.length} predios) ---`);
    
    let conGPS = 0, sinGPS = 0;
    const byEstado = {};
    for (const pp of preds) {
      const hasGPS = pp.latitud !== null && pp.longitud !== null;
      if (hasGPS) conGPS++; else sinGPS++;
      const estado = pp.estado?.nombre || "SIN ESTADO";
      if (!byEstado[estado]) byEstado[estado] = { total: 0, conGPS: 0, sinGPS: 0 };
      byEstado[estado].total++;
      if (hasGPS) byEstado[estado].conGPS++; else byEstado[estado].sinGPS++;
    }
    console.log(`  Con GPS: ${conGPS}, Sin GPS: ${sinGPS}`);
    for (const [est, counts] of Object.entries(byEstado)) {
      console.log(`  Estado "${est}": ${counts.total} (GPS: ${counts.conGPS}, sin: ${counts.sinGPS})`);
    }
  }

  // Verificar permisos de estado ocultos para TECNICO
  const permsRol = await p.permisoEstado.findMany({
    where: { rol: "TECNICO", visible: false },
    include: { estado: { select: { nombre: true } } },
  });
  console.log("\n=== Estados ocultos para TECNICO ===");
  for (const pr of permsRol) {
    console.log(`  ${pr.estado.nombre} (${pr.estadoId})`);
  }

  // Permisos por usuario
  const permsUser = await p.permisoEstadoUsuario.findMany({
    where: { userId: th01.id },
    include: { estado: { select: { nombre: true } } },
  });
  if (permsUser.length > 0) {
    console.log("\n=== Permisos de estado específicos de TH01 ===");
    for (const pu of permsUser) {
      console.log(`  ${pu.estado.nombre}: visible=${pu.visible}`);
    }
  }

  // Simular query exacta del mapa para TH01
  const hidden = new Set(permsRol.map(pr => pr.estadoId));
  for (const pu of permsUser) {
    if (!pu.visible) hidden.add(pu.estadoId);
    else hidden.delete(pu.estadoId);
  }

  const mapaQuery = {
    latitud: { not: null },
    longitud: { not: null },
    equipoAsignado: { in: variants, mode: "insensitive" },
    OR: [
      { equipoAsignado: { in: variants, mode: "insensitive" } },
      { asignaciones: { some: { userId: th01.id } } },
    ],
  };
  if (hidden.size > 0) {
    mapaQuery.estadoId = { notIn: Array.from(hidden) };
  }

  const mapaResult = await p.predio.findMany({
    where: mapaQuery,
    select: { id: true, nombre: true, estado: { select: { nombre: true } }, espacioId: true, latitud: true, longitud: true },
  });
  console.log(`\n=== Simulación query mapa: ${mapaResult.length} predios ===`);

  // Sin el filtro equipoParam duplicado (como debería ser sin login de tecnico mandando equipo)
  const mapaQuery2 = {
    latitud: { not: null },
    longitud: { not: null },
    OR: [
      { equipoAsignado: { in: variants, mode: "insensitive" } },
      { asignaciones: { some: { userId: th01.id } } },
    ],
  };
  if (hidden.size > 0) {
    mapaQuery2.estadoId = { notIn: Array.from(hidden) };
  }
  const mapaResult2 = await p.predio.findMany({
    where: mapaQuery2,
    select: { id: true, nombre: true, estado: { select: { nombre: true } }, espacioId: true },
  });
  console.log(`Sin equipo param (solo OR): ${mapaResult2.length} predios`);
}

main().finally(() => p.$disconnect());
