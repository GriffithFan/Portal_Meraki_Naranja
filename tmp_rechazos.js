/**
 * Cruza los tres archivos de rechazos (19, 20 y 21/08) con los cronogramas que
 * pedimos (CSV de "Cronogramas 24.8"), para ver si pedimos alguno de los rechazados.
 * Compara contra los CSV editados y contra los originales (por si estaba entre los
 * 15 que sacamos por ventana futura).
 */
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const RAIZ = "c:/Users/ulise/Documents/Portal Meraki Naranja";
const CARPETA = path.join(RAIZ, "Cronogramas 24.8");
const ARCHIVOS = ["RECHAZOS_20260819.xlsx", "RECHAZOS_20260820.xlsx", "RECHAZOS_20260821.xlsx"];

function leerCsv(dir) {
  const filas = [];
  if (!fs.existsSync(dir)) return filas;
  for (const f of fs.readdirSync(dir).filter((x) => x.toLowerCase().endsWith(".csv"))) {
    const txt = fs.readFileSync(path.join(dir, f), "utf-8").replace(/^\uFEFF/, "");
    for (const l of txt.trim().split(/\r?\n/).slice(1)) {
      const c = l.split(";").map((x) => x.replace(/^"|"$/g, "").trim());
      if (c[0]) filas.push({ archivo: f, codigo: c[0], desde: c[1], hasta: c[2], th: c[3], ni: c[4] });
    }
  }
  return filas;
}

const pedidos = leerCsv(CARPETA);
const originales = leerCsv(path.join(CARPETA, "_original"));
const porCod = new Map(pedidos.map((p) => [p.codigo, p]));
const porCodOrig = new Map(originales.map((p) => [p.codigo, p]));
const porNi = new Map(pedidos.filter((p) => /^NI-/i.test(p.ni)).map((p) => [p.ni.toUpperCase(), p]));

// ── juntar los tres archivos, deduplicando por predio+incidencia ──
const todos = new Map();
for (const arch of ARCHIVOS) {
  const ruta = path.join(RAIZ, arch);
  if (!fs.existsSync(ruta)) { console.log(`(no está ${arch})`); continue; }
  const wb = XLSX.readFile(ruta);
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  const dia = arch.match(/(\d{4})(\d{2})(\d{2})/);
  const etiqueta = dia ? `${dia[3]}/${dia[2]}` : arch;
  console.log(`${arch}: ${filas.length} rechazos`);
  for (const r of filas) {
    const cod = String(r["Predio"] ?? "").trim();
    const ni = String(r["Incidencias: Número de Incidencia"] ?? "").trim().toUpperCase();
    const clave = `${cod}|${ni}`;
    const prev = todos.get(clave);
    todos.set(clave, {
      cod, ni,
      dias: [...(prev?.dias || []), etiqueta],
      instalador: String(r["Instalador"] ?? "").trim(),
      prov: String(r["Provincia"] ?? "").trim(),
      depto: String(r["Departamento"] ?? "").trim(),
      fecha: String(r["Última fecha verificación ST"] ?? "").trim(),
      auditoria: String(r["Cronograma: Auditoría LAC / ST Estado"] ?? "").trim(),
      comentario: String(r["Comentario Nivel 3"] ?? "").replace(/\.{3,}|:{3,}/g, " ").replace(/\s+/g, " ").trim(),
    });
  }
}

const rech = [...todos.values()];
console.log(`\ntotal de rechazos distintos (predio + incidencia): ${rech.length}`);
console.log(`predios distintos: ${new Set(rech.map((r) => r.cod)).size}`);
console.log(`pedidos en los CSV: ${pedidos.length}  ·  originales antes de editar: ${originales.length}\n`);

const enPedido = rech.filter((r) => porCod.has(r.cod) || (r.ni && porNi.has(r.ni)));
const enOriginal = rech.filter((r) => !porCod.has(r.cod) && !porNi.has(r.ni) && porCodOrig.has(r.cod));
const sinPedir = rech.filter((r) => !porCod.has(r.cod) && !porNi.has(r.ni) && !porCodOrig.has(r.cod));

console.log(`=== RECHAZADOS QUE SÍ PEDIMOS: ${enPedido.length} ===`);
if (enPedido.length) {
  console.log(`   ${"PREDIO".padEnd(9)}${"NI".padEnd(16)}${"TH pedido".padEnd(11)}${"Instalador".padEnd(13)}${"Rechazo".padEnd(9)}archivo`);
  enPedido.forEach((r) => {
    const p = porCod.get(r.cod) || porNi.get(r.ni);
    console.log(`   ${r.cod.padEnd(9)}${r.ni.padEnd(16)}${String(p.th).padEnd(11)}${r.instalador.padEnd(13)}${r.dias.join(",").padEnd(9)}${p.archivo}`);
  });
} else console.log("   ninguno");

console.log(`\n=== ESTABAN EN EL CSV ORIGINAL Y LOS SACAMOS: ${enOriginal.length} ===`);
if (enOriginal.length) {
  enOriginal.forEach((r) => {
    const p = porCodOrig.get(r.cod);
    console.log(`   ${r.cod.padEnd(9)}${r.ni.padEnd(16)}${String(p.th).padEnd(11)}${r.instalador.padEnd(13)}rechazo ${r.dias.join(",")}`);
  });
} else console.log("   ninguno");

console.log(`\n=== RECHAZADOS QUE NO PEDIMOS: ${sinPedir.length} ===`);
console.log(`   ${"PREDIO".padEnd(9)}${"NI".padEnd(16)}${"Instalador".padEnd(13)}${"Provincia".padEnd(13)}${"Depto".padEnd(14)}Rechazo`);
sinPedir.forEach((r) =>
  console.log(`   ${r.cod.padEnd(9)}${r.ni.padEnd(16)}${r.instalador.padEnd(13)}${r.prov.padEnd(13)}${r.depto.slice(0, 13).padEnd(14)}${r.dias.join(",")}`));

fs.writeFileSync("C:/Users/ulise/AppData/Local/Temp/claude/c--Users-ulise-Documents-Portal-Meraki-Naranja/8369e105-3142-4d95-9bd5-b2aef670eff4/scratchpad/rechazos_todos.json", JSON.stringify(rech));
console.log("\n-> rechazos_todos.json");
