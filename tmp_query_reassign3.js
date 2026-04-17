const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  // Buscar CUALQUIER cosa que diga Lucio, Jorge, Fede
  const prediosLucio = await p.predio.findMany({
    where: { OR: [
      { nombre: { contains: "lucio", mode: "insensitive" } },
      { notas: { contains: "lucio", mode: "insensitive" } },
      { nombreInstitucion: { contains: "lucio", mode: "insensitive" } },
    ]},
    select: { id: true, nombre: true, equipoAsignado: true, nombreInstitucion: true }
  });
  console.log("Predios con 'Lucio':", prediosLucio.length);
  prediosLucio.forEach(p => console.log(`  ${p.id} | ${p.nombre} | equipo: ${p.equipoAsignado} | inst: ${p.nombreInstitucion}`));

  // Check espacios/carpetas
  const espacios = await p.espacioTrabajo.findMany({
    where: { nombre: { contains: "lucio", mode: "insensitive" } },
    select: { id: true, nombre: true, parentId: true }
  });
  console.log("Espacios con 'Lucio':", espacios.length);
  espacios.forEach(e => console.log(`  ${e.id} | ${e.nombre} | parent: ${e.parentId}`));

  // Buscar tareas calendario más amplio
  const tareas = await p.tareaCalendario.findMany({
    where: { OR: [
      { titulo: { contains: "lucio", mode: "insensitive" } },
      { titulo: { contains: "jorge", mode: "insensitive" } },
      { titulo: { contains: "fede", mode: "insensitive" } },
      { titulo: { contains: "TH03", mode: "insensitive" } },
      { titulo: { contains: "TH07", mode: "insensitive" } },
    ]},
    select: { id: true, titulo: true, asignadoId: true, asignado: { select: { nombre: true } } }
  });
  console.log("Tareas calendario con nombres:", tareas.length);
  tareas.forEach(t => console.log(`  ${t.id} | ${t.titulo} | asignado: ${t.asignado?.nombre || 'null'}`));

  // Total asignaciones por usuario (los 5 relevantes)
  const userIds = [
    { id: "cmmw22hzx000acaad7j0n1nve", name: "TH03" },
    { id: "cmmw22hzy000ccaad0y4tf1z6", name: "TH07" },
    { id: "cmo2w9wps0002uo2vgg3degou", name: "Jorge" },
    { id: "cmo2w9xdx0004uo2vvanptr7t", name: "Fede" },
    { id: "cmo2w9x3d0003uo2vow2sno15", name: "Lucio" },
  ];
  
  for (const u of userIds) {
    const count = await p.asignacion.count({ where: { userId: u.id } });
    const predios = await p.predio.count({ where: { equipoAsignado: u.name } });
    console.log(`${u.name}: ${count} asignaciones, ${predios} predios con equipoAsignado`);
  }

  // Show what the UI might be showing - check if there's an "equipoAsignado" that contains these names
  const prediosConEquipo = await p.predio.findMany({
    where: { OR: [
      { equipoAsignado: { contains: "lucio", mode: "insensitive" } },
      { equipoAsignado: { contains: "jorge", mode: "insensitive" } },
      { equipoAsignado: { contains: "fede", mode: "insensitive" } },
    ]},
    select: { id: true, nombre: true, equipoAsignado: true }
  });
  console.log("Predios con equipoAsignado nombre:", prediosConEquipo.length);
  prediosConEquipo.forEach(p => console.log(`  ${p.nombre} -> ${p.equipoAsignado}`));

  await p.$disconnect();
})();
