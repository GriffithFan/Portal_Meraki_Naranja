/**
 * Script para agregar 5 nuevos usuarios y backfill passwordPlain en usuarios existentes.
 * Ejecutar: node scripts/addNewUsers.mjs
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const NUEVOS_USUARIOS = [
  { nombre: "Ezequiel", email: "ezequiel@thnet.com" },
  { nombre: "Eric", email: "eric@thnet.com" },
  { nombre: "Jorge", email: "jorge@thnet.com" },
  { nombre: "Lucio", email: "lucio@thnet.com" },
  { nombre: "Fede", email: "fede@thnet.com" },
];

const DEFAULT_PASSWORD = "Tech.Dev.2026!";

async function main() {
  console.log("=== Creando 5 nuevos usuarios ===");

  for (const u of NUEVOS_USUARIOS) {
    const existe = await prisma.user.findUnique({ where: { email: u.email } });
    if (existe) {
      console.log(`  ⏭ ${u.nombre} (${u.email}) ya existe, skip.`);
      // Backfill passwordPlain si no tiene
      if (!existe.passwordPlain) {
        await prisma.user.update({
          where: { id: existe.id },
          data: { passwordPlain: DEFAULT_PASSWORD },
        });
        console.log(`    → passwordPlain backfilled`);
      }
      continue;
    }

    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
    await prisma.user.create({
      data: {
        nombre: u.nombre,
        email: u.email,
        password: hash,
        passwordPlain: DEFAULT_PASSWORD,
        rol: "TECNICO",
      },
    });
    console.log(`  ✅ ${u.nombre} (${u.email}) creado como TECNICO`);
  }

  // Backfill passwordPlain en usuarios que no lo tienen
  console.log("\n=== Backfill passwordPlain en usuarios existentes ===");
  const sinPlain = await prisma.user.findMany({
    where: { passwordPlain: null },
    select: { id: true, nombre: true, email: true },
  });

  // Map de contraseñas conocidas del seed
  const knownPasswords = {
    "admin@thnet.com": "Admin.Dev.2026!",
    "uli@thnet.com": "Mod.Dev.2026!",
    "luis@thnet.com": "Mod.Dev.2026!",
  };

  // Técnicos TH01-TH10
  for (let i = 1; i <= 10; i++) {
    const num = String(i).padStart(2, "0");
    knownPasswords[`th${num}@thnet.com`] = `Tech.Dev.${num}!`;
  }

  for (const u of sinPlain) {
    const pw = knownPasswords[u.email] || null;
    if (pw) {
      await prisma.user.update({
        where: { id: u.id },
        data: { passwordPlain: pw },
      });
      console.log(`  ✅ ${u.nombre} → passwordPlain seteado`);
    } else {
      console.log(`  ⚠ ${u.nombre} (${u.email}) → contraseña desconocida, dejar null`);
    }
  }

  if (sinPlain.length === 0) {
    console.log("  Todos los usuarios ya tienen passwordPlain.");
  }

  console.log("\n✅ Listo!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
