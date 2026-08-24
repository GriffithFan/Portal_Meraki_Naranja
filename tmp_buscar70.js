/**
 * Busca planillas (xlsx/xls/csv) con ~70 filas que parezcan listas de predios,
 * para encontrar el archivo de los predios que nos sacaron.
 */
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const RAIZ = "c:/Users/ulise/Documents/Portal Meraki Naranja";
const SALTAR = new Set(["node_modules", ".next", ".git", "uploads", "portal-meraki-android", "SidebarTopBar_Package"]);

function recorrer(dir, prof = 0, acc = []) {
  if (prof > 3) return acc;
  let entradas;
  try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entradas) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SALTAR.has(e.name) || e.name.startsWith(".")) continue;
      recorrer(p, prof + 1, acc);
    } else if (/\.(xlsx|xls|csv)$/i.test(e.name) && !e.name.startsWith("~$")) {
      acc.push(p);
    }
  }
  return acc;
}

const archivos = recorrer(RAIZ);
console.log(`planillas encontradas: ${archivos.length}\n`);

const candidatos = [];
for (const f of archivos) {
  try {
    let filas = 0, cabecera = [], hojas = [];
    if (/\.csv$/i.test(f)) {
      const txt = fs.readFileSync(f, "utf-8").replace(/^\uFEFF/, "");
      const ls = txt.trim().split(/\r?\n/);
      filas = Math.max(0, ls.length - 1);
      cabecera = (ls[0] || "").split(/[;,]/).slice(0, 8);
      hojas = ["csv"];
    } else {
      const wb = XLSX.readFile(f, { sheetRows: 200 });
      hojas = wb.SheetNames;
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }).filter((r) => r.some((c) => String(c).trim()));
      filas = Math.max(0, aoa.length - 1);
      cabecera = (aoa[0] || []).slice(0, 8).map((c) => String(c).slice(0, 22));
    }
    const rel = path.relative(RAIZ, f);
    const st = fs.statSync(f);
    // ¿parece una lista de predios/incidencias?
    const texto = cabecera.join(" ").toLowerCase();
    const parece = /predio|incidencia|\bni\b|cue|cronograma|codigo|código/.test(texto);
    if (filas >= 55 && filas <= 95) {
      candidatos.push({ rel, filas, cabecera, parece, mod: st.mtime.toISOString().slice(0, 10), hojas });
    }
  } catch { /* archivo ilegible, se ignora */ }
}

candidatos.sort((a, b) => (b.parece - a.parece) || (b.mod > a.mod ? 1 : -1));
console.log(`=== planillas con 55 a 95 filas: ${candidatos.length} ===\n`);
for (const c of candidatos) {
  console.log(`${c.parece ? "★" : " "} ${String(c.filas).padStart(3)} filas  ${c.mod}  ${c.rel}`);
  console.log(`     hojas: ${c.hojas.join(", ")}`);
  console.log(`     columnas: ${c.cabecera.join(" | ")}`);
}
