const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.predio.findMany({
    where: {
      provincia: { contains: 'Santa Fe', mode: 'insensitive' },
      estado: { clave: 'sin_asignar' },
    },
    select: { codigo: true, incidencias: true, nombre: true },
    orderBy: [{ codigo: 'asc' }],
  });
  console.log(`TOTAL\t${rows.length}`);
  for (const row of rows) {
    console.log(`${row.codigo || row.nombre || ''}\t${row.incidencias || '-'}`);
  }
}

main().finally(() => prisma.$disconnect());
