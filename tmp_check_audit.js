const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.registroAcceso
  .findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { usuario: { select: { nombre: true, email: true } } },
  })
  .then((r) => {
    console.log("Total encontrados:", r.length);
    r.forEach((x) =>
      console.log(
        x.accion,
        "|",
        x.detalle || "-",
        "|",
        x.usuario?.nombre,
        "|",
        x.ip,
        "|",
        x.createdAt
      )
    );
    return p.$disconnect();
  })
  .catch((e) => {
    console.error(e);
    p.$disconnect();
  });
