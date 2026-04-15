const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  // Valores distintos de equipoAsignado
  const raw = await p.$queryRaw`SELECT DISTINCT "equipoAsignado" FROM "Predio" WHERE "equipoAsignado" IS NOT NULL ORDER BY "equipoAsignado"`;
  console.log("=== equipoAsignado distintos ===");
  console.table(raw);

  // Contar predios por equipo
  const counts = await p.$queryRaw`SELECT "equipoAsignado", COUNT(*) as total FROM "Predio" WHERE "equipoAsignado" IS NOT NULL GROUP BY "equipoAsignado" ORDER BY "equipoAsignado"`;
  console.log("\n=== Predios por equipo ===");
  console.table(counts);

  // Verificar asignaciones del usuario TH01
  const th01 = await p.user.findFirst({ where: { nombre: "TH01" } });
  if (th01) {
    const asigs = await p.asignacion.count({ where: { userId: th01.id } });
    console.log(`\nTH01 (${th01.id}) tiene ${asigs} asignaciones`);
    
    // Predios que DEBERÍA ver TH01 (equipoAsignado match)
    const prediosTH01 = await p.predio.count({
      where: {
        equipoAsignado: { in: ["TH01", "DANIEL", "DANI"], mode: "insensitive" },
        latitud: { not: null },
        longitud: { not: null },
      }
    });
    console.log(`Predios con GPS y equipo TH01/DANIEL/DANI: ${prediosTH01}`);
  }
}
main().finally(() => p.$disconnect());
