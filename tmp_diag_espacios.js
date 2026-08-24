const { PrismaClient } = require('./node_modules/.prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const esp = await p.espacioTrabajo.findMany({ select: { id:true, nombre:true, parentId:true, orden:true, camposConfig:true, estadosConfig:true } });
    console.log('=== ESPACIOS ===');
    for (const e of esp) {
      console.log(`- ${e.nombre} | id=${e.id} | parent=${e.parentId||'-'} | orden=${e.orden}`);
    }
    const targets = esp.filter(e => /^(PBA|SF Capital|SF 2026)$/i.test((e.nombre||'').trim()));
    for (const t of targets) {
      const cnt = await p.predio.count({ where: { espacioId: t.id } });
      console.log(`\n##### ${t.nombre} (id=${t.id}) predios=${cnt} #####`);
      console.log('camposConfig:', JSON.stringify(t.camposConfig));
      console.log('estadosConfig:', JSON.stringify(t.estadosConfig));
      const sample = await p.predio.findMany({ where: { espacioId: t.id }, take: 2, orderBy:{orden:'asc'} });
      sample.forEach((s,i)=>console.log(`SAMPLE ${i}:`, JSON.stringify(s)));
    }
    console.log('\n=== ESTADOS (PREDIO) ===');
    const est = await p.estadoConfig.findMany({ where: { entidad:'PREDIO' }, select:{id:true,nombre:true,clave:true,orden:true,activo:true} });
    est.forEach(e=>console.log(`- ${e.nombre} | clave=${e.clave} | id=${e.id} | orden=${e.orden} | activo=${e.activo}`));
  } catch(e){ console.error('ERR', e.message); } finally { await p.$disconnect(); }
})();
