import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const wb = XLSX.readFile(resolve(__dirname, "../../GPS_SantaFe copy.xlsx"));
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

const esc = (s) => (s ? String(s).replace(/'/g, "''") : "");

let sql = "-- Actualizacion GPS Santa Fe desde GPS_SantaFe copy.xlsx\n";
sql += `-- ${new Date().toISOString()}\n`;
sql += "BEGIN;\n\n";

for (const row of rows) {
  const codigo = String(row["Predio"]).trim();
  const dir = esc(String(row["Direccion"]).trim());
  const lat = parseFloat(String(row["Latitud"]));
  const lon = parseFloat(String(row["Longitud"]));
  const gps = esc(String(row["GPS"]).trim());
  if (!codigo) continue;
  sql += `UPDATE "Predio" SET "direccion" = '${dir}', "latitud" = ${lat}, "longitud" = ${lon}, "gpsPredio" = '${gps}' WHERE "codigo" = '${codigo}';\n`;
}

sql += "\nCOMMIT;\n";

const outPath = resolve(__dirname, "../scripts/update_gps_santafe.sql");
writeFileSync(outPath, sql, "utf8");
console.log(`SQL generado: ${outPath}`);
console.log(`Líneas: ${sql.split("\n").length}`);
