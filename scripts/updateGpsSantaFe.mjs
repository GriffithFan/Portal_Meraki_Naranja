/**
 * updateGpsSantaFe.mjs
 * Actualiza direccion, latitud, longitud y gpsPredio de los predios de Santa Fe
 * desde el archivo "GPS_SantaFe copy.xlsx" (corregido).
 *
 * Uso: node scripts/updateGpsSantaFe.mjs
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

async function main() {
  const xlsxPath = resolve(__dirname, "../../GPS_SantaFe copy.xlsx");
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  console.log(`Total filas en Excel: ${rows.length}`);

  let updated = 0;
  let notFound = 0;
  const notFoundList = [];

  for (const row of rows) {
    const codigo = String(row["Predio"]).trim();
    const direccion = String(row["Direccion"]).trim() || null;
    const latStr = String(row["Latitud"]).trim();
    const lonStr = String(row["Longitud"]).trim();
    const gps = String(row["GPS"]).trim() || null;

    const latitud = latStr ? parseFloat(latStr) : null;
    const longitud = lonStr ? parseFloat(lonStr) : null;

    if (!codigo) continue;

    const result = await prisma.predio.updateMany({
      where: { codigo },
      data: {
        ...(direccion !== null ? { direccion } : {}),
        ...(latitud !== null && !isNaN(latitud) ? { latitud } : {}),
        ...(longitud !== null && !isNaN(longitud) ? { longitud } : {}),
        ...(gps !== null ? { gpsPredio: gps } : {}),
      },
    });

    if (result.count === 0) {
      notFound++;
      notFoundList.push(codigo);
    } else {
      updated++;
    }
  }

  console.log(`\n✅ Actualizados: ${updated}`);
  console.log(`❌ No encontrados: ${notFound}`);
  if (notFoundList.length > 0) {
    console.log("Códigos no encontrados:", notFoundList.join(", "));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
