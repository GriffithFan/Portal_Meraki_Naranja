const XLSX = require('xlsx');
const path = require('path');

const SRC = '../Nuevos para cargar en carrot.xlsx';
const OUTDIR = '..'; // junto al original
const wb = XLSX.readFile(SRC);
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Hoja1'], { header: 1, raw: false, defval: '' });
const data = rows.slice(1).filter(r => (r[2] || '').toString().trim());

const C = { ni: 0, prio: 1, cod: 2, cue: 8, prov: 9, dep: 10, esc: 11, dir: 12, gps: 13, orden: 28 };

function cleanDir(s) {
  return (s || '').toString()
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/\r?\n/g, ', ')
    .replace(/,\s*Argentina\s*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/(,\s*)+/g, ', ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
}
function parseGPS(s) {
  const str = (s || '').toString();
  const nums = str.match(/-?\d+(?:[.,]\d+)?/g);
  if (!nums || nums.length < 2) return { lat: '', lng: '', combined: '' };
  const lat = parseFloat(nums[0].replace(',', '.'));
  const lng = parseFloat(nums[1].replace(',', '.'));
  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return { lat: '', lng: '', combined: '' };
  return { lat, lng, combined: `${lat}, ${lng}` };
}
function prio(s) {
  const v = (s || '').toString().trim().toLowerCase();
  if (v === 'alta') return 'ALTA';
  if (v === 'media') return 'MEDIA';
  if (v === 'baja') return 'BAJA';
  if (v === 'máxima' || v === 'maxima') return 'URGENTE';
  return 'MEDIA';
}

// Headers EXACTOS según PREDIO_FIELDS del importador (para mapeo trivial)
const HEADERS_BASE = ['Código', 'Incidencias (NI-...)', 'Provincia', 'Nombre de la Institución', 'Dirección', 'Latitud', 'Longitud', 'GPS_Predio', 'Prioridad', 'CUE'];
const HEADERS_BA = [...HEADERS_BASE, 'Orden (nro)'];

function rowOut(r, withOrden) {
  const g = parseGPS(r[C.gps]);
  const base = [
    (r[C.cod] || '').toString().trim(),
    (r[C.ni] || '').toString().trim(),
    (r[C.prov] || '').toString().trim(),
    (r[C.esc] || '').toString().trim(),
    cleanDir(r[C.dir]),
    g.lat,
    g.lng,
    g.combined,
    prio(r[C.prio]),
    (r[C.cue] || '').toString().trim(),
  ];
  if (withOrden) {
    const o = parseInt((r[C.orden] || '').toString().trim());
    base.push(isNaN(o) ? '' : o);
  }
  return base;
}

const isBA = r => (r[C.prov] || '').toString().trim().toLowerCase() === 'buenos aires';
const isSF = r => (r[C.prov] || '').toString().trim().toLowerCase() === 'santa fe';
const dep = r => (r[C.dep] || '').toString().trim().toLowerCase();

const groups = [
  { name: 'IMPORT_PBA_BuenosAires.xlsx', filter: isBA, withOrden: true },
  { name: 'IMPORT_SF_Capital_LaCapital.xlsx', filter: r => isSF(r) && dep(r) === 'la capital', withOrden: false },
  { name: 'IMPORT_SF2026_Rosario.xlsx', filter: r => isSF(r) && dep(r) === 'rosario', withOrden: false },
];

for (const g of groups) {
  const sel = data.filter(g.filter);
  const headers = g.withOrden ? HEADERS_BA : HEADERS_BASE;
  const aoa = [headers, ...sel.map(r => rowOut(r, g.withOrden))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const out = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(out, ws, 'Importar');
  const outPath = path.join(OUTDIR, g.name);
  XLSX.writeFile(out, outPath);
  // sanity: count gps parsed
  const gpsOk = sel.filter(r => parseGPS(r[C.gps]).lat !== '').length;
  console.log(`${g.name}: ${sel.length} filas | GPS parseadas: ${gpsOk} | orden: ${g.withOrden ? 'sí' : 'no'}`);
}
console.log('\nListo. Archivos generados junto al original.');
