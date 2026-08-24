const XLSX = require('xlsx');
const wb = XLSX.readFile('../Nuevos para cargar en carrot.xlsx');
const ws = wb.Sheets['Hoja1'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
const H = rows[0];
const data = rows.slice(1).filter(r => (r[2]||'').toString().trim()); // has código col C
console.log('Data rows (con código):', data.length);

// indices
const cProv = 9, cDep = 10, cCod = 2, cNI = 0, cOrden = 28;
console.log('Header[9]=', H[9], '| Header[10]=', H[10], '| Header[2]=', H[2], '| Header[28]=', H[28]);

// Provincia counts
const prov = {};
for (const r of data) { const p=(r[cProv]||'').toString().trim(); prov[p]=(prov[p]||0)+1; }
console.log('\n== PROVINCIA =='); console.log(prov);

// Santa Fe departamento counts
const sfDep = {};
for (const r of data) { if((r[cProv]||'').toString().trim().toLowerCase()==='santa fe'){ const d=(r[cDep]||'').toString().trim(); sfDep[d]=(sfDep[d]||0)+1; } }
console.log('\n== SANTA FE x DEPARTAMENTO =='); console.log(sfDep);

// BA orden distribution (count distinct orden values & blanks)
let baTotal=0, baOrdenBlank=0; const ordenVals={};
const baDeps={};
for (const r of data) { if((r[cProv]||'').toString().trim().toLowerCase()==='buenos aires'){ baTotal++; const o=(r[cOrden]||'').toString().trim(); if(!o) baOrdenBlank++; else ordenVals[o]=(ordenVals[o]||0)+1; const d=(r[cDep]||'').toString().trim(); baDeps[d]=(baDeps[d]||0)+1; } }
console.log('\n== BUENOS AIRES: total',baTotal,'orden vacío:',baOrdenBlank);
console.log('Orden distinct values count:', Object.keys(ordenVals).length);
console.log('Orden values sample:', JSON.stringify(Object.fromEntries(Object.entries(ordenVals).slice(0,40))));
console.log('BA departamentos count:', Object.keys(baDeps).length);

// código uniqueness within sheet
const codes = data.map(r=>(r[cCod]||'').toString().trim());
const dup = {}; codes.forEach(c=>dup[c]=(dup[c]||0)+1);
const dups = Object.entries(dup).filter(([k,v])=>v>1);
console.log('\n== Códigos duplicados dentro del Excel:', dups.length, JSON.stringify(dups.slice(0,20)));

// any rows with blank provincia or not in the 3 groups
const other = data.filter(r=>{ const p=(r[cProv]||'').toString().trim().toLowerCase(); if(p==='buenos aires') return false; if(p==='santa fe'){ const d=(r[cDep]||'').toString().trim().toLowerCase(); return !(d==='la capital'||d==='rosario'); } return true; });
console.log('\n== Filas que NO caen en (BA | SF-La Capital | SF-Rosario):', other.length);
console.log(other.slice(0,15).map(r=>({cod:r[cCod],prov:r[cProv],dep:r[cDep]})));
