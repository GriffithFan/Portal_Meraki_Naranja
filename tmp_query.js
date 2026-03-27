const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const r = await p.predio.findMany({
    where: { OR: [{ provincia: null }, { provincia: "" }] },
    select: { codigo: true },
    take: 5,
    orderBy: { codigo: "asc" },
  });
  r.forEach(x => {
    const c = x.codigo;
    console.log(JSON.stringify(c), "len:", c?.length, "chars:", c ? [...c].map(ch => ch.charCodeAt(0)) : null, "prefix:", c?.substring(0,2));
  });
  await p.$disconnect();
})();
