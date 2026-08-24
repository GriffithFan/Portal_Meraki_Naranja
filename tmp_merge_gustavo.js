// Mueve las asignaciones de th05@thnet.com (Gustavo) -> gustavo@thnet.com y desactiva th05.
// DRY-RUN por defecto. Para ejecutar de verdad: DRY=0 node tmp_merge_gustavo.js
const { PrismaClient } = require('./node_modules/.prisma/client');
const p = new PrismaClient();
const DRY = process.env.DRY !== '0';

const TH05 = 'cmmw22hzs0005caadqa35p43a';      // th05@thnet.com
const GUSTAVO = 'cmnq83s3g0000p5aoth9ul18g';   // gustavo@thnet.com

(async () => {
  try {
    const [uTh05, uGus] = await Promise.all([
      p.user.findUnique({ where: { id: TH05 }, select: { id:true, nombre:true, email:true, activo:true } }),
      p.user.findUnique({ where: { id: GUSTAVO }, select: { id:true, nombre:true, email:true, activo:true } }),
    ]);
    console.log('MODO:', DRY ? 'DRY-RUN (no escribe)' : '*** EJECUCIÓN REAL ***');
    console.log('Origen :', JSON.stringify(uTh05));
    console.log('Destino:', JSON.stringify(uGus));
    if (!uTh05 || !uGus) { console.log('Falta algún usuario, abort.'); return; }

    // Footprint de th05 (para confirmar que desactivar—no borrar—es lo correcto)
    const [espaciosCreados, actasSubidas, tareasCreadas, comentarios, instructivos] = await Promise.all([
      p.espacioTrabajo.count({ where: { creadorId: TH05 } }),
      p.acta.count({ where: { subidoPorId: TH05 } }),
      p.tareaCalendario.count({ where: { creadorId: TH05 } }),
      p.comentario.count({ where: { userId: TH05 } }),
      p.instructivo.count({ where: { creadoPorId: TH05 } }),
    ]);
    console.log('\nFootprint th05 → espaciosCreados:', espaciosCreados, '| actas:', actasSubidas, '| tareasCal:', tareasCreadas, '| comentarios:', comentarios, '| instructivos:', instructivos);

    // Asignaciones de th05
    const asigns = await p.asignacion.findMany({
      where: { userId: TH05 },
      select: { id:true, tipo:true, predioId:true, equipoId:true,
        predio:{ select:{ codigo:true, espacio:{ select:{ nombre:true } } } } },
    });
    console.log('\nAsignaciones de th05:', asigns.length);

    // Asignaciones existentes de gustavo (para dedupe)
    const gusAsigns = await p.asignacion.findMany({ where: { userId: GUSTAVO }, select: { predioId:true, equipoId:true } });
    const gusPredios = new Set(gusAsigns.map(a=>a.predioId).filter(Boolean));
    const gusEquipos = new Set(gusAsigns.map(a=>a.equipoId).filter(Boolean));

    const toMove = [], toDeleteDup = [];
    for (const a of asigns) {
      const dup = (a.predioId && gusPredios.has(a.predioId)) || (a.equipoId && gusEquipos.has(a.equipoId));
      if (dup) toDeleteDup.push(a); else toMove.push(a);
    }
    console.log('  → a MOVER (cambiar userId):', toMove.length);
    console.log('  → duplicadas (destino ya asignado) a ELIMINAR:', toDeleteDup.length);

    // por espacio (lo que se mueve)
    const porEsp = {};
    for (const a of toMove){ const k=a.predio?.espacio?.nombre||'(equipo/otro)'; porEsp[k]=(porEsp[k]||0)+1; }
    console.log('  Movimientos por espacio:', JSON.stringify(porEsp));

    if (DRY) {
      console.log('\nDRY-RUN: no se escribió nada. Códigos a mover (primeros 40):');
      console.log(toMove.map(a=>a.predio?.codigo).filter(Boolean).slice(0,40).join(', '));
      return;
    }

    // EJECUCIÓN
    await p.$transaction(async (tx) => {
      for (const a of toDeleteDup) await tx.asignacion.delete({ where: { id: a.id } });
      if (toMove.length) await tx.asignacion.updateMany({ where: { id: { in: toMove.map(a=>a.id) } }, data: { userId: GUSTAVO } });
      await tx.user.update({ where: { id: TH05 }, data: { activo: false } });
    });
    const restante = await p.asignacion.count({ where: { userId: TH05 } });
    const nuevoGus = await p.asignacion.count({ where: { userId: GUSTAVO } });
    console.log('\n✔ Hecho. th05 desactivado. Asignaciones restantes en th05:', restante, '| total ahora en gustavo@thnet.com:', nuevoGus);
  } catch(e){ console.error('ERR', e.message, e.stack); } finally { await p.$disconnect(); }
})();
