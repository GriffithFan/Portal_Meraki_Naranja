// READ-ONLY: por qué aparecen ~38 predios "asignados a Gustavo" en SIN ASIGNAR (ER 2026).
const { PrismaClient } = require('./node_modules/.prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    // 1. TODOS los usuarios que matchean "gustavo"
    const users = await p.user.findMany({
      where: { OR: [ {nombre:{contains:'gustavo',mode:'insensitive'}}, {email:{contains:'gustavo',mode:'insensitive'}} ] },
      select: { id:true, nombre:true, email:true, rol:true, activo:true },
    });
    console.log('USUARIOS "gustavo":', users.length);
    for (const u of users) {
      const total = await p.asignacion.count({ where: { userId: u.id, predioId: { not: null } } });
      console.log(`  - ${u.nombre} <${u.email}> rol=${u.rol} activo=${u.activo} id=${u.id} | asignaciones=${total}`);
    }

    // 2. Espacio ER 2026
    const er = await p.espacioTrabajo.findFirst({ where: { nombre: { equals: 'ER 2026', mode:'insensitive' } }, select: { id:true, nombre:true } });
    console.log('\nER 2026 id=', er?.id);
    if (!er) return;

    const totalER = await p.predio.count({ where: { espacioId: er.id } });
    console.log('Predios en ER 2026:', totalER);

    // 3. ER 2026 por estado
    const porEstado = await p.predio.groupBy({ by:['estadoId'], where:{ espacioId: er.id }, _count:{_all:true} });
    const estados = await p.estadoConfig.findMany({ select:{id:true,nombre:true} });
    const estMap = Object.fromEntries(estados.map(e=>[e.id,e.nombre]));
    console.log('ER 2026 por estado:');
    for (const g of porEstado) console.log(`   ${estMap[g.estadoId]||'(sin estado)'}: ${g._count._all}`);

    // 4. Asignaciones DENTRO de ER 2026 agrupadas por usuario
    const asignsER = await p.asignacion.findMany({
      where: { predio: { espacioId: er.id } },
      select: { userId:true, usuario:{select:{nombre:true}}, predio:{select:{codigo:true, estado:{select:{nombre:true}}}} },
    });
    console.log('\nTotal asignaciones en ER 2026:', asignsER.length);
    const porUser = {};
    for (const a of asignsER){ const k=a.usuario?.nombre||a.userId; porUser[k]=(porUser[k]||0)+1; }
    console.log('Asignaciones ER 2026 por usuario:', JSON.stringify(porUser,null,0));

    // 5. ER 2026 predios SIN estado o estado "sin asignar": ¿tienen asignación?
    const sinAsignarEstado = estados.find(e=>/sin asignar/i.test(e.nombre));
    if (sinAsignarEstado){
      const conEstadoSA = await p.predio.findMany({
        where:{ espacioId: er.id, estadoId: sinAsignarEstado.id },
        select:{ codigo:true, asignaciones:{ select:{ usuario:{select:{nombre:true}} } } },
      });
      console.log(`\nER 2026 en estado "SIN ASIGNAR": ${conEstadoSA.length} predios`);
      const conGustavo = conEstadoSA.filter(pr=>pr.asignaciones.some(a=>/gustavo/i.test(a.usuario?.nombre||'')));
      console.log('  de esos, con asignación a "Gustavo":', conGustavo.length);
      const sinNinguna = conEstadoSA.filter(pr=>pr.asignaciones.length===0);
      console.log('  sin ninguna asignación:', sinNinguna.length);
    } else {
      console.log('\nNo existe un estado llamado "sin asignar".');
    }
  } catch(e){ console.error('ERR', e.message, e.stack); } finally { await p.$disconnect(); }
})();
