const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  // Qué tipos de asignación existen
  const tipos = await p.$queryRaw`SELECT DISTINCT tipo, COUNT(*)::int as cnt FROM "Asignacion" GROUP BY tipo`;
  console.log("Tipos de asignación:", tipos);

  // Verificar predio 606915
  const predio = await p.predio.findFirst({
    where: { nombre: { contains: "606915" } },
    select: { id: true, nombre: true, equipoAsignado: true },
  });
  if (predio) {
    const asigs = await p.asignacion.findMany({
      where: { predioId: predio.id },
      include: { usuario: { select: { nombre: true } } },
    });
    console.log("Predio 606915:", predio);
    console.log("Asignaciones:", JSON.stringify(asigs, null, 2));
  } else {
    console.log("Predio 606915 no encontrado");
  }

  await p.$disconnect();
})();
