/**
 * Script para importar predios desde el CSV del proyecto original a la DB PostgreSQL.
 * Uso: npx tsx scripts/importPrediosCsv.ts [ruta-csv]
 * Por defecto busca en ../proyecto-recuperado/backend/data/predios.csv
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

const CSV_PATH =
  process.argv[2] ||
  path.resolve(__dirname, "../../proyecto-recuperado/backend/data/predios.csv");

interface CsvRow {
  network_id: string;
  predio_code: string;
  predio_name: string;
  organization_id: string;
  region: string;
  estado: string;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV no encontrado: ${CSV_PATH}`);
    process.exit(1);
  }

  const content = fs.readFileSync(CSV_PATH, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  const header = parseCsvLine(lines[0]);
  console.log(`Columnas: ${header.join(", ")}`);
  console.log(`Filas de datos: ${lines.length - 1}`);

  const rows: CsvRow[] = [];
  const seenCodes = new Set<string>();
  const seenNetIds = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 4) continue;
    const row: CsvRow = {
      network_id: cols[0],
      predio_code: cols[1],
      predio_name: cols[2],
      organization_id: cols[3],
      region: cols[4] || "Sin asignar",
      estado: cols[5] || "activo",
    };
    // Deduplicar por network_id y predio_code
    if (!row.network_id || seenNetIds.has(row.network_id)) continue;
    if (row.predio_code && seenCodes.has(row.predio_code)) continue;
    seenNetIds.add(row.network_id);
    if (row.predio_code) seenCodes.add(row.predio_code);
    rows.push(row);
  }

  console.log(`Registros únicos a importar: ${rows.length}`);

  // Borrar predios existentes que fueron importados del CSV (tienen merakiNetworkId)
  const deleted = await prisma.predio.deleteMany({
    where: { merakiNetworkId: { not: null } },
  });
  console.log(`Predios previos eliminados: ${deleted.count}`);

  // Insertar en batches de 500
  const BATCH_SIZE = 500;
  let imported = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await prisma.predio.createMany({
      data: batch.map((row) => ({
        nombre: row.predio_name || row.predio_code,
        codigo: row.predio_code || null,
        merakiNetworkId: row.network_id,
        merakiOrgId: row.organization_id,
        seccion: row.region,
      })),
      skipDuplicates: true,
    });
    imported += batch.length;
    if (imported % 5000 === 0 || imported === rows.length) {
      console.log(`  Importados: ${imported}/${rows.length}`);
    }
  }

  const total = await prisma.predio.count();
  console.log(`\nImportación completa. Total predios en DB: ${total}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error:", e);
  prisma.$disconnect();
  process.exit(1);
});
