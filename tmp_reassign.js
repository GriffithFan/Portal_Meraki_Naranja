const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

const TH03_ID = "cmmw22hzx000acaad7j0n1nve";
const TH07_ID = "cmmw22hzy000ccaad0y4tf1z6";
const JORGE_ID = "cmo2w9wps0002uo2vgg3degou";
const FEDE_ID = "cmo2w9xdx0004uo2vvanptr7t";
const LUCIO_ID = "cmo2w9x3d0003uo2vow2sno15";

(async () => {
  // 1. Reasignar asignaciones TH03 → Jorge
  const r1 = await p.asignacion.updateMany({
    where: { userId: TH03_ID },
    data: { userId: JORGE_ID }
  });
  console.log(`✅ ${r1.count} asignaciones movidas de TH03 → Jorge`);

  // 2. Reasignar asignaciones TH07 → Fede
  const r2 = await p.asignacion.updateMany({
    where: { userId: TH07_ID },
    data: { userId: FEDE_ID }
  });
  console.log(`✅ ${r2.count} asignaciones movidas de TH07 → Fede`);

  // 3. Crear asignaciones para predios con equipoAsignado "LUCIO" que no tengan asignación a Lucio
  const prediosLucio = await p.predio.findMany({
    where: { equipoAsignado: "LUCIO" },
    select: { id: true, nombre: true, asignaciones: { where: { userId: LUCIO_ID } } }
  });
  
  let lucioCreadas = 0;
  for (const pr of prediosLucio) {
    if (pr.asignaciones.length === 0) {
      await p.asignacion.create({
        data: { tipo: "TECNICO", userId: LUCIO_ID, predioId: pr.id }
      });
      lucioCreadas++;
      console.log(`  + Asignación creada: Lucio → predio ${pr.nombre}`);
    } else {
      console.log(`  ⏭ Predio ${pr.nombre} ya tiene asignación a Lucio`);
    }
  }
  console.log(`✅ ${lucioCreadas} asignaciones creadas para Lucio (de ${prediosLucio.length} predios)`);

  // Verificación final
  console.log("\n=== Verificación ===");
  const th03Count = await p.asignacion.count({ where: { userId: TH03_ID } });
  const th07Count = await p.asignacion.count({ where: { userId: TH07_ID } });
  const jorgeCount = await p.asignacion.count({ where: { userId: JORGE_ID } });
  const fedeCount = await p.asignacion.count({ where: { userId: FEDE_ID } });
  const lucioCount = await p.asignacion.count({ where: { userId: LUCIO_ID } });
  console.log(`TH03: ${th03Count} asignaciones (debe ser 0)`);
  console.log(`TH07: ${th07Count} asignaciones (debe ser 0)`);
  console.log(`Jorge: ${jorgeCount} asignaciones`);
  console.log(`Fede: ${fedeCount} asignaciones`);
  console.log(`Lucio: ${lucioCount} asignaciones`);

  await p.$disconnect();
})();
