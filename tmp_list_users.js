const { PrismaClient } = require("./node_modules/.prisma/client");
const p = new PrismaClient();
(async () => {
  const all = await p.user.findMany({
    select: { id: true, nombre: true, activo: true, rol: true },
    orderBy: { nombre: "asc" },
  });
  console.log("TOTAL:", all.length);
  console.log("ACTIVOS:", all.filter(u => u.activo).length);
  console.log("INACTIVOS:", all.filter(u => !u.activo).length);
  console.log("---");
  all.forEach(u => console.log(u.activo ? "OK" : "XX", u.nombre, "-", u.rol));
  await p.$disconnect();
})();
