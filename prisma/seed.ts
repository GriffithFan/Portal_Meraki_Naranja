import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Limpiar datos existentes (orden por dependencias)
  await prisma.actividad.deleteMany();
  await prisma.notificacion.deleteMany();
  await prisma.comentario.deleteMany();
  await prisma.asignacion.deleteMany();
  await prisma.predioEtiqueta.deleteMany();
  await prisma.etiqueta.deleteMany();
  await prisma.equipo.deleteMany();
  await prisma.tareaCalendario.deleteMany();
  await prisma.instructivo.deleteMany();
  await prisma.acta.deleteMany();
  await prisma.predio.deleteMany();
  await prisma.estadoConfig.deleteMany();
  await prisma.user.deleteMany();

  // ═══════════════════════════════════════════════════════
  // USUARIOS
  // ═══════════════════════════════════════════════════════

  // Admin
  const admin = await prisma.user.create({
    data: {
      nombre: "Griffith",
      email: "griffith@thnet.com",
      password: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || "Admin.Dev.2026!", 12),
      rol: "ADMIN",
    },
  });

  // Moderadores
  const mods = await Promise.all([
    prisma.user.create({
      data: {
        nombre: "Leonel",
        email: "leonel@thnet.com",
        password: await bcrypt.hash(process.env.SEED_MOD_PASSWORD || "Mod.Dev.2026!", 12),
        rol: "MODERADOR",
      },
    }),
    prisma.user.create({
      data: {
        nombre: "Enzo",
        email: "enzo@thnet.com",
        password: await bcrypt.hash(process.env.SEED_MOD_PASSWORD || "Mod.Dev.2026!", 12),
        rol: "MODERADOR",
      },
    }),
    prisma.user.create({
      data: {
        nombre: "Fernando",
        email: "fernando@thnet.com",
        password: await bcrypt.hash(process.env.SEED_MOD_PASSWORD || "Mod.Dev.2026!", 12),
        rol: "MODERADOR",
      },
    }),
    prisma.user.create({
      data: {
        nombre: "Luis",
        email: "luis@thnet.com",
        password: await bcrypt.hash(process.env.SEED_MOD_PASSWORD || "Mod.Dev.2026!", 12),
        rol: "MODERADOR",
      },
    }),
  ]);

  // Técnicos TH01 a TH10
  const tecnicos = await Promise.all(
    Array.from({ length: 10 }, (_, i) => {
      const num = String(i + 1).padStart(2, "0");
      return prisma.user.create({
        data: {
          nombre: `TH${num}`,
          email: `th${num}@thnet.com`,
          password: bcrypt.hashSync(process.env.SEED_TECH_PASSWORD || `Tech.Dev.${num}!`, 12),
          rol: "TECNICO",
        },
      });
    })
  );

  // ═══════════════════════════════════════════════════════
  // ESTADOS DE PREDIO (estilo ClickUp)
  // ═══════════════════════════════════════════════════════
  const estadosData = [
    { nombre: "CONFORME", clave: "conforme", color: "#22c55e", orden: 0 },
    { nombre: "NO CONFORME", clave: "no_conforme", color: "#ef4444", orden: 1 },
    { nombre: "INSTALADO", clave: "instalado", color: "#f59e0b", orden: 2 },
    { nombre: "RELEVADO", clave: "relevado", color: "#06b6d4", orden: 3 },
    { nombre: "PENDIENTE", clave: "pendiente", color: "#8b5cf6", orden: 4 },
    { nombre: "EN PROCESO", clave: "en_proceso", color: "#3b82f6", orden: 5 },
    { nombre: "CANCELADO", clave: "cancelado", color: "#6b7280", orden: 6 },
  ];
  for (const e of estadosData) {
    await prisma.estadoConfig.create({ data: e });
  }

  // ═══════════════════════════════════════════════════════
  // ETIQUETAS DE EJEMPLO
  // ═══════════════════════════════════════════════════════
  await prisma.etiqueta.create({ data: { nombre: "pedir lac", color: "#f59e0b" } });
  await prisma.etiqueta.create({ data: { nombre: "no tiene crono", color: "#ef4444" } });
  await prisma.etiqueta.create({ data: { nombre: "urgente", color: "#dc2626" } });
  await prisma.etiqueta.create({ data: { nombre: "verificar", color: "#3b82f6" } });

  // ═══════════════════════════════════════════════════════
  // INSTRUCTIVO DE EJEMPLO
  // ═══════════════════════════════════════════════════════
  await prisma.instructivo.create({
    data: {
      titulo: "Cómo usar el Portal",
      descripcion: "Video tutorial introductorio del sistema",
      videoUrl: "https://www.youtube.com/watch?v=example",
      orden: 0,
      creadoPorId: admin.id,
    },
  });

  console.log("Seed completado");
  console.log("");
  console.log("  ADMIN:");
  console.log("  - griffith@thnet.com");
  console.log("");
  console.log("  MODERADORES:");
  console.log("  - leonel@thnet.com");
  console.log("  - enzo@thnet.com");
  console.log("  - fernando@thnet.com");
  console.log("  - luis@thnet.com");
  console.log("");
  console.log("  TECNICOS:");
  for (let i = 1; i <= 10; i++) {
    const num = String(i).padStart(2, "0");
    console.log(`  - th${num}@thnet.com`);
  }
  console.log("");
  console.log("  ESTADOS: CONFORME, NO CONFORME, INSTALADO, RELEVADO, PENDIENTE, EN PROCESO, CANCELADO");
}

main()
  .catch((e) => {
    console.error("Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
