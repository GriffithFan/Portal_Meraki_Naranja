const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const th03Id = "cmmw22hzx000acaad7j0n1nve";
  const th07Id = "cmmw22hzy000ccaad0y4tf1z6";
  const jorgeId = "cmo2w9wps0002uo2vgg3degou";
  const fedeId = "cmo2w9xdx0004uo2vvanptr7t";
  const lucioId = "cmo2w9x3d0003uo2vow2sno15";

  // Asignaciones de TH03
  const asTh03 = await p.asignacion.findMany({
    where: { userId: th03Id },
    include: { predio: { select: { id: true, nombre: true, equipoAsignado: true } } }
  });
  console.log("=== Asignaciones TH03 ===");
  asTh03.forEach(a => console.log(`  ${a.id} | predio: ${a.predio?.nombre || 'null'} | tipo: ${a.tipo}`));

  // Asignaciones de TH07
  const asTh07 = await p.asignacion.findMany({
    where: { userId: th07Id },
    include: { predio: { select: { id: true, nombre: true, equipoAsignado: true } } }
  });
  console.log("=== Asignaciones TH07 ===");
  asTh07.forEach(a => console.log(`  ${a.id} | predio: ${a.predio?.nombre || 'null'} | tipo: ${a.tipo}`));

  // Buscar predios con nombre que contenga Lucio, Jorge o Fede
  const prediosPersonas = await p.predio.findMany({
    where: {
      nombre: { in: ["LUCIO", "JORGE", "FEDE", "Lucio", "Jorge", "Fede"] }
    },
    select: { id: true, nombre: true, equipoAsignado: true, asignaciones: { select: { userId: true, usuario: { select: { nombre: true } } } } }
  });
  console.log("=== Predios con nombre persona ===");
  prediosPersonas.forEach(pr => {
    const asig = pr.asignaciones.map(a => a.usuario.nombre).join(", ");
    console.log(`  ${pr.nombre} | equipo: ${pr.equipoAsignado} | asignados: [${asig}]`);
  });

  // Buscar predios cuyo nombre contenga Lucio
  const prediosLucio = await p.predio.findMany({
    where: { nombre: { contains: "Lucio", mode: "insensitive" } },
    select: { id: true, nombre: true, equipoAsignado: true, asignaciones: { select: { userId: true, usuario: { select: { nombre: true } } } } }
  });
  console.log("=== Predios con 'Lucio' en nombre ===");
  prediosLucio.forEach(pr => {
    const asig = pr.asignaciones.map(a => a.usuario.nombre).join(", ");
    console.log(`  ${pr.id} | ${pr.nombre} | equipo: ${pr.equipoAsignado} | asignados: [${asig}]`);
  });

  await p.$disconnect();
})();
