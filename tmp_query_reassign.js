const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const users = await p.user.findMany({
    where: { nombre: { in: ["TH03","TH07","Jorge","Fede","Lucio"] } },
    select: { id: true, nombre: true, email: true }
  });
  console.log("USERS:", JSON.stringify(users, null, 2));

  const th03 = users.find(u => u.nombre === "TH03");
  const th07 = users.find(u => u.nombre === "TH07");

  if (th03) {
    const t3 = await p.tareaCalendario.count({ where: { asignadoId: th03.id } });
    const a3 = await p.asignacion.count({ where: { userId: th03.id } });
    console.log("TH03 tareas:", t3, "asignaciones:", a3);
  }
  if (th07) {
    const t7 = await p.tareaCalendario.count({ where: { asignadoId: th07.id } });
    const a7 = await p.asignacion.count({ where: { userId: th07.id } });
    console.log("TH07 tareas:", t7, "asignaciones:", a7);
  }

  // Tareas con "Lucio" en titulo
  const lucioTareas = await p.tareaCalendario.findMany({
    where: { titulo: { contains: "Lucio", mode: "insensitive" } },
    select: { id: true, titulo: true, asignadoId: true }
  });
  console.log("Tareas con Lucio en titulo:", JSON.stringify(lucioTareas, null, 2));

  // Nombre asignado que contiene Lucio (via asignado relacion)
  const lucioUser = users.find(u => u.nombre === "Lucio");
  if (lucioUser) {
    const lucioAsignadas = await p.tareaCalendario.count({ where: { asignadoId: lucioUser.id } });
    console.log("Tareas ya asignadas a Lucio user:", lucioAsignadas);
  }

  // Predios con equipoAsignado TH03 o TH07
  const p03 = await p.predio.count({ where: { equipoAsignado: "TH03" } });
  const p07 = await p.predio.count({ where: { equipoAsignado: "TH07" } });
  console.log("Predios equipoAsignado TH03:", p03, "TH07:", p07);

  await p.$disconnect();
})();
