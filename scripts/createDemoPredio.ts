import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.predio.findFirst({ where: { codigo: "111111" } });
  if (existing) {
    console.log("Predio 111111 ya existe:", existing.id);
    // Asegurar que el networkId sea correcto
    await prisma.predio.update({
      where: { id: existing.id },
      data: { merakiNetworkId: "DEMO_111111", merakiNetworkName: "DEMO_111111" },
    });
    console.log("NetworkId actualizado a DEMO_111111");
  } else {
    const predio = await prisma.predio.create({
      data: {
        codigo: "111111",
        nombre: "DEMO - Predio Prueba Estados AP",
        merakiNetworkId: "DEMO_111111",
        merakiNetworkName: "DEMO_111111",
        provincia: "Demo",
        equipoAsignado: "DEMO",
      },
    });
    console.log("Predio creado:", predio.id);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
