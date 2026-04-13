const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const total = await p.predio.count();
  console.log("Total predios:", total);

  const byEspacio = await p.predio.groupBy({
    by: ["espacioId"],
    _count: true,
  });
  console.log("Por espacio:", JSON.stringify(byEspacio, null, 2));

  const espacios = await p.espacio.findMany({ select: { id: true, nombre: true } });
  console.log("Espacios:", JSON.stringify(espacios, null, 2));

  const enFact = await p.predio.count({ where: { enFacturacion: true } });
  console.log("En facturacion:", enFact);

  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
