const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const users = await p.user.findMany({
    select: { id: true, nombre: true, email: true, rol: true },
    orderBy: { nombre: "asc" },
  });
  console.table(users.map(u => ({ nombre: u.nombre, email: u.email, rol: u.rol })));
}
main().finally(() => p.$disconnect());
