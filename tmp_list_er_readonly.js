const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listBySpace(spaceName) {
  const space = await prisma.espacioTrabajo.findFirst({
    where: { nombre: spaceName, activo: true },
    select: { id: true, nombre: true },
  });
  if (!space) return { spaceName, rows: [] };
  const rows = await prisma.predio.findMany({
    where: { espacioId: space.id, estado: { clave: 'sin_asignar' } },
    select: { codigo: true, incidencias: true, nombre: true },
    orderBy: [{ codigo: 'asc' }],
  });
  return { spaceName: space.nombre, rows };
}

async function main() {
  for (const result of [await listBySpace('ER'), await listBySpace('ER 2026')]) {
    console.log(`## ${result.spaceName}\t${result.rows.length}`);
    for (const row of result.rows) {
      console.log(`${row.codigo || row.nombre || ''}\t${row.incidencias || '-'}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
