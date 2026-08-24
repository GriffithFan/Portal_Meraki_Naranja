// READ-ONLY: investiga el conteo de "Predios 2026" y detecta espacios/predios duplicados.
const { PrismaClient } = require('./node_modules/.prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    const espacios = await p.espacioTrabajo.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, parentId: true },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
    console.log('TOTAL espacios activos:', espacios.length);

    // Duplicados por nombre
    const porNombre = {};
    for (const e of espacios) (porNombre[e.nombre] ||= []).push(e.id);
    const dupNombres = Object.entries(porNombre).filter(([, ids]) => ids.length > 1);
    console.log('Espacios con NOMBRE duplicado:', dupNombres.length);
    dupNombres.forEach(([n, ids]) => console.log(`  "${n}" x${ids.length}: ${ids.join(', ')}`));

    // Conteo directo por espacio
    const grupos = await p.predio.groupBy({ by: ['espacioId'], _count: { _all: true } });
    const directo = new Map(grupos.map(g => [g.espacioId, g._count._all]));
    const totalPredios = await p.predio.count();
    const sinEspacio = directo.get(null) || 0;
    console.log('\nTOTAL predios en DB:', totalPredios, '| sin espacio:', sinEspacio);

    // Árbol + subtree count
    const byParent = new Map();
    for (const e of espacios) {
      if (!e.parentId) continue;
      if (!byParent.has(e.parentId)) byParent.set(e.parentId, []);
      byParent.get(e.parentId).push(e);
    }
    function subtree(id) {
      let total = directo.get(id) || 0;
      for (const c of (byParent.get(id) || [])) total += subtree(c.id);
      return total;
    }
    const p2026 = espacios.filter(e => /^Predios 2026$/i.test((e.nombre || '').trim()));
    console.log('\n"Predios 2026" encontrados:', p2026.length);
    for (const root of p2026) {
      console.log(`\n=== ${root.nombre} (id=${root.id}) ===`);
      console.log('  directo:', directo.get(root.id) || 0, '| subtree TOTAL:', subtree(root.id));
      const hijos = (byParent.get(root.id) || []);
      console.log('  hijos:', hijos.length);
      for (const h of hijos) {
        console.log(`    - ${h.nombre} (id=${h.id}) directo=${directo.get(h.id) || 0} subtree=${subtree(h.id)} hijos=${(byParent.get(h.id) || []).length}`);
      }
    }

    // Predios con código duplicado (no debería por unique, pero revisamos null)
    const sinCodigo = await p.predio.count({ where: { codigo: null } });
    console.log('\nPredios con codigo NULL:', sinCodigo);

    // Distribución de createdAt reciente (para ver si hubo carga masiva doble)
    const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const recientes = await p.predio.count({ where: { createdAt: { gte: desde } } });
    console.log('Predios creados en últimos 7 días:', recientes);
  } catch (e) { console.error('ERR', e.message); } finally { await p.$disconnect(); }
})();
