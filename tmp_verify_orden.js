const XLSX = require('xlsx');
const wb = XLSX.readFile('../Nuevos para cargar en carrot.xlsx');

// ── 1. Construir mapa Departamento -> Orden desde Hoja3 (cols G=6, H=7) ──
const h3 = XLSX.utils.sheet_to_json(wb.Sheets['Hoja3'], { header: 1, raw: false, defval: '' });
const norm = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const depToOrden = new Map();
for (let i = 2; i < h3.length; i++) {
  const d = norm(h3[i][6]);
  const o = parseInt((h3[i][7] || '').toString().trim());
  if (d && !isNaN(o)) {
    if (depToOrden.has(d) && depToOrden.get(d) !== o) {
      console.log(`  ⚠ Hoja3: depto "${d}" con 2 ordenes distintos: ${depToOrden.get(d)} vs ${o}`);
    }
    depToOrden.set(d, o);
  }
}
console.log('Hoja3: departamentos mapeados:', depToOrden.size);

// ── 2. Leer Hoja1 (cached) y la salida generada ──
const h1 = XLSX.utils.sheet_to_json(wb.Sheets['Hoja1'], { header: 1, raw: false, defval: '' }).slice(1).filter(r => (r[2] || '').toString().trim());
const C = { cod: 2, prov: 9, dep: 10, orden: 28 };
const ba = h1.filter(r => (r[C.prov] || '').toString().trim().toLowerCase() === 'buenos aires');

const outWb = XLSX.readFile('../IMPORT_PBA_BuenosAires.xlsx');
const out = XLSX.utils.sheet_to_json(outWb.Sheets['Importar'], { header: 1, defval: '' });
const outHeaders = out[0];
const ordenCol = outHeaders.indexOf('Orden (nro)');
const codCol = outHeaders.indexOf('Código');
const outByCod = new Map();
for (let i = 1; i < out.length; i++) outByCod.set(String(out[i][codCol]).trim(), out[i][ordenCol]);

// ── 3. Verificación cruzada fila por fila ──
let cachedVsHoja3Mismatch = 0, fileVsCachedMismatch = 0, fileVsHoja3Mismatch = 0, missingDepInHoja3 = 0, missingOrdenInFile = 0;
const mismatchSamples = [];
for (const r of ba) {
  const cod = String(r[C.cod]).trim();
  const depN = norm(r[C.dep]);
  const cached = parseInt((r[C.orden] || '').toString().trim());
  const fromHoja3 = depToOrden.has(depN) ? depToOrden.get(depN) : null;
  const inFile = outByCod.get(cod);
  const inFileN = parseInt((inFile || '').toString().trim());

  if (fromHoja3 === null) missingDepInHoja3++;
  if (inFile === '' || isNaN(inFileN)) missingOrdenInFile++;
  if (fromHoja3 !== null && !isNaN(cached) && cached !== fromHoja3) { cachedVsHoja3Mismatch++; if (mismatchSamples.length < 15) mismatchSamples.push({ cod, dep: depN, cached, hoja3: fromHoja3 }); }
  if (!isNaN(cached) && inFileN !== cached) fileVsCachedMismatch++;
  if (fromHoja3 !== null && inFileN !== fromHoja3) fileVsHoja3Mismatch++;
}

console.log('\n=== VERIFICACIÓN ORDEN (Buenos Aires, ' + ba.length + ' filas) ===');
console.log('Departamentos BA sin entrada en Hoja3:', missingDepInHoja3);
console.log('Filas del archivo sin Orden:', missingOrdenInFile);
console.log('Cached(AC) ≠ Hoja3:', cachedVsHoja3Mismatch);
console.log('Archivo ≠ Cached(AC):', fileVsCachedMismatch);
console.log('Archivo ≠ Hoja3:', fileVsHoja3Mismatch);
if (mismatchSamples.length) console.log('Muestras cached≠hoja3:', JSON.stringify(mismatchSamples, null, 0));

// ── 4. Resumen Departamento -> Orden tal como quedó (orden de visita) ──
const depOrdenInFile = new Map();
for (const r of ba) { const depN = norm(r[C.dep]); const o = parseInt((r[C.orden]||'').toString().trim()); if(!depOrdenInFile.has(depN)) depOrdenInFile.set(depN,o); }
const sorted = [...depOrdenInFile.entries()].sort((a,b)=>a[1]-b[1]);
console.log('\n=== Orden por Departamento (BA) ===');
console.log(sorted.map(([d,o])=>`${o}: ${d}`).join('\n'));
