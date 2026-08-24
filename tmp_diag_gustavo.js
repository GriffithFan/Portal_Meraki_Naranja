// READ-ONLY: diagnostica por qué un técnico ve pocos de sus predios asignados.
const { PrismaClient } = require('./node_modules/.prisma/client');
const p = new PrismaClient();

// mismo criterio que isDefaultHiddenStateForTecnico
function norm(s){return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function ocultoTecnico(nombre, clave){
  const label = `${norm(clave)} ${norm(nombre)}`.trim();
  if(!label) return false;
  if(label.includes('no conforme')) return false;
  return ['conforme','cerrad','finaliz','bloque','blocke','instalado'].some(t=>label.includes(t));
}

(async()=>{
  try{
    const u = await p.user.findFirst({
      where: { OR: [ {nombre:{contains:'Gustavo',mode:'insensitive'}}, {email:{contains:'gustavo',mode:'insensitive'}} ] },
      select: { id:true, nombre:true, email:true, rol:true, activo:true },
    });
    if(!u){ console.log('No se encontró usuario Gustavo'); return; }
    console.log('USUARIO:', JSON.stringify(u));

    const accesos = await p.accesoEspacio.findMany({ where:{ userId:u.id }, select:{ espacioId:true } });
    const accesosRol = await p.accesoEspacioRol.findMany({ where:{ rol:u.rol }, select:{ espacioId:true } });
    console.log('AccesoEspacio (propios):', accesos.length, JSON.stringify(accesos.map(a=>a.espacioId)));
    console.log('AccesoEspacioRol ('+u.rol+'):', accesosRol.length, JSON.stringify(accesosRol.map(a=>a.espacioId)));

    // todas las asignaciones del usuario (lo que admin cuenta como "38 asignados")
    const asigns = await p.asignacion.findMany({
      where:{ userId:u.id, predioId:{ not:null } },
      select:{ predio:{ select:{ id:true, codigo:true, espacioId:true,
        espacio:{ select:{ id:true, nombre:true } },
        estado:{ select:{ nombre:true, clave:true } } } } },
    });
    const predios = asigns.map(a=>a.predio).filter(Boolean);
    console.log('\nASIGNACIONES (predios):', predios.length);

    // por espacio
    const porEspacio = {};
    for(const pr of predios){ const k = pr.espacio?.nombre || '(sin espacio)'; porEspacio[k]=(porEspacio[k]||0)+1; }
    console.log('Por espacio:', JSON.stringify(porEspacio,null,0));

    // por estado + visibilidad técnico
    const porEstado = {}; let visibles=0, ocultosPorEstado=0;
    for(const pr of predios){
      const en = pr.estado?.nombre || '(sin estado)';
      porEstado[en]=(porEstado[en]||0)+1;
      const oculto = pr.estado ? ocultoTecnico(pr.estado.nombre, pr.estado.clave) : false;
      if(oculto) ocultosPorEstado++; else visibles++;
    }
    console.log('Por estado:', JSON.stringify(porEstado,null,0));
    console.log('\nEn estado VISIBLE para técnico:', visibles, '| ocultos por estado (conforme/instalado/etc.):', ocultosPorEstado);

    // espacios asignados (distinct)
    const espaciosAsignados = [...new Set(predios.map(pr=>pr.espacio?.nombre).filter(Boolean))];
    console.log('Espacios DONDE tiene asignados:', JSON.stringify(espaciosAsignados));

    // ¿el acceso configurado es más angosto que sus asignaciones?
    const tieneConfig = accesos.length>0 || accesosRol.length>0;
    console.log('\n¿Tiene acceso configurado?', tieneConfig, '→ con el bug actual, la INTERSECCIÓN recorta a esos espacios.');
  }catch(e){ console.error('ERR', e.message); } finally { await p.$disconnect(); }
})();
