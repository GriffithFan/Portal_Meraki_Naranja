const XLSX = require('xlsx');
const wb = XLSX.readFile('../Nuevos para cargar en carrot.xlsx');
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Hoja1'], { header:1, raw:false, defval:'' });
const data = rows.slice(1).filter(r=>(r[2]||'').toString().trim());
const C={prov:9,dep:10,cod:2,ni:0,esc:11,dir:12,gps:13,orden:28,prio:1,cue:8,lab:15,desc:17};
const isBA=r=>(r[C.prov]||'').toString().trim().toLowerCase()==='buenos aires';
const isSF=r=>(r[C.prov]||'').toString().trim().toLowerCase()==='santa fe';
const dep=r=>(r[C.dep]||'').toString().trim().toLowerCase();

// SF orden presence
const sf=data.filter(isSF);
const sfWithOrden=sf.filter(r=>(r[C.orden]||'').toString().trim() && !/n\/?a|#/i.test((r[C.orden]||'').toString()));
console.log('SF rows:',sf.length,'| con Orden numérico:',sfWithOrden.length);
console.log('SF orden sample values:', sf.slice(0,5).map(r=>JSON.stringify(r[C.orden])));

// BA orden as integers - verify all parse
const ba=data.filter(isBA);
const badOrden=ba.filter(r=>{const v=parseInt((r[C.orden]||'').toString().trim());return isNaN(v);});
console.log('\nBA rows:',ba.length,'| Orden que NO parsea a entero:',badOrden.length);
const ordenRange=ba.map(r=>parseInt(r[C.orden])).filter(n=>!isNaN(n));
console.log('BA orden min/max:', Math.min(...ordenRange), '/', Math.max(...ordenRange));

// código format check (numeric? length?)
const codes=data.map(r=>(r[C.cod]||'').toString().trim());
const nonNumeric=codes.filter(c=>!/^\d+$/.test(c));
console.log('\nCódigos no numéricos:', nonNumeric.length, JSON.stringify(nonNumeric.slice(0,10)));
const blankCod=codes.filter(c=>!c).length;
console.log('Códigos en blanco:', blankCod);
const blankNI=data.filter(r=>!(r[C.ni]||'').toString().trim()).length;
console.log('Incidencia en blanco:', blankNI);

// prioridad distinct
const prio={}; data.forEach(r=>{const p=(r[C.prio]||'').toString().trim();prio[p]=(prio[p]||0)+1;});
console.log('\nPrioridad distinct:', JSON.stringify(prio));

// full sample BA + SF row mapped
const show=r=>({cod:r[C.cod],ni:r[C.ni],prov:r[C.prov],dep:r[C.dep],esc:(r[C.esc]||'').slice(0,40),dir:(r[C.dir]||'').slice(0,30),gps:r[C.gps],orden:r[C.orden],prio:r[C.prio]});
console.log('\nBA sample:', JSON.stringify(show(ba[0]),null,0));
console.log('SF LaCapital sample:', JSON.stringify(show(sf.find(r=>dep(r)==='la capital')),null,0));
console.log('SF Rosario sample:', JSON.stringify(show(sf.find(r=>dep(r)==='rosario')),null,0));
