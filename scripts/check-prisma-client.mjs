#!/usr/bin/env node
/**
 * Guard de drift de schema: verifica que el cliente Prisma generado contenga
 * TODOS los modelos del schema canónico (./prisma/schema.prisma).
 *
 * Atrapa el caso en que `prisma generate` corrió contra un schema equivocado
 * (p. ej. un schema.prisma espurio en la raíz) o quedó desactualizado, lo que
 * rompería el build/runtime con "Property 'X' does not exist on PrismaClient".
 *
 * Uso: node scripts/check-prisma-client.mjs   (correr DESPUÉS de prisma generate)
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SCHEMA = resolve("prisma/schema.prisma");
const CLIENT_DTS = resolve("node_modules/.prisma/client/index.d.ts");

function fail(msg) {
  console.error(`\n[check-prisma-client] ✖ ${msg}\n`);
  process.exit(1);
}

if (!existsSync(SCHEMA)) fail(`No se encontró ${SCHEMA}`);
if (!existsSync(CLIENT_DTS)) fail(`No se encontró el cliente generado en ${CLIENT_DTS}. Corré: npx prisma generate`);

const schema = readFileSync(SCHEMA, "utf8");
const dts = readFileSync(CLIENT_DTS, "utf8");

const models = [...schema.matchAll(/^\s*model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
if (models.length === 0) fail("No se detectaron modelos en el schema");

const missing = models.filter((model) => !dts.includes(`${model}Delegate`));

if (missing.length > 0) {
  fail(
    `El cliente Prisma generado NO incluye estos modelos del schema:\n` +
      missing.map((m) => `    - ${m}`).join("\n") +
      `\n  Probable causa: prisma generate usó un schema equivocado o quedó desactualizado.\n` +
      `  Solución: npx prisma generate --schema ./prisma/schema.prisma`
  );
}

console.log(`[check-prisma-client] ✔ Cliente Prisma OK — ${models.length} modelos presentes.`);
