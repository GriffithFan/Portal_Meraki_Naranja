const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const users = await p.user.findMany({ where: { activo: true }, select: { id: true, nombre: true }, take: 5, orderBy: { nombre: 'asc' } });
  console.log('=== Users (sample) ===');
  users.forEach(u => console.log(u.id, u.nombre));

  const predios = await p.predio.findMany({ take: 2, select: { id: true, codigo: true, asignaciones: { select: { id: true, userId: true, tipo: true } } } });
  console.log('\n=== Predios (sample) ===');
  predios.forEach(pr => {
    console.log(pr.id, pr.codigo, 'asignaciones:', JSON.stringify(pr.asignaciones));
  });

  // Simulate what the API does for asignadoIds
  const testUserId = users[0].id;
  const testPredioId = predios[0].id;
  console.log('\n=== Test: asignadoIds API simulation ===');
  console.log('value received:', JSON.stringify([testUserId]));
  console.log('Array.isArray check:', Array.isArray([testUserId]));
  
  const validUsers = await p.user.findMany({ where: { id: { in: [testUserId] }, activo: true }, select: { id: true } });
  console.log('validUsers:', JSON.stringify(validUsers));

  await p.$disconnect();
})();
