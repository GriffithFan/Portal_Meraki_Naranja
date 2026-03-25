import { z } from "zod";

/**
 * Validación de variables de entorno al arrancar la app.
 * Si alguna variable crítica falta o es insegura en producción, la app no arranca.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerido"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET es requerido"),
  MERAKI_API_KEY: z.string().min(1, "MERAKI_API_KEY es requerido"),
  CRON_SECRET: z.string().min(1, "CRON_SECRET es requerido"),
});

const isProd = process.env.NODE_ENV === "production";

function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    console.error(`\n[ERROR] Variables de entorno faltantes:\n${missing.join("\n")}\n`);
    if (isProd) process.exit(1);
  }

  // Advertencias de seguridad en producción
  if (isProd) {
    const warnings: string[] = [];

    if (process.env.JWT_SECRET === "dev-secret-change-in-production") {
      warnings.push("JWT_SECRET tiene el valor de desarrollo. ¡Cámbialo inmediatamente!");
    }
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
      warnings.push("JWT_SECRET es demasiado corto. Usa al menos 32 caracteres aleatorios.");
    }
    if (process.env.CRON_SECRET === "monitoreo-cron-secret-change-in-prod") {
      warnings.push("CRON_SECRET tiene el valor por defecto. Genera uno seguro con: openssl rand -hex 32");
    }
    if (process.env.CRON_SECRET && process.env.CRON_SECRET.length < 32) {
      warnings.push("CRON_SECRET es demasiado corto. Usa al menos 32 caracteres aleatorios.");
    }
    if (process.env.DATABASE_URL?.includes("postgres:postgres@")) {
      warnings.push("DATABASE_URL usa credenciales por defecto (postgres:postgres). Crea un usuario dedicado.");
    }

    if (warnings.length > 0) {
      console.warn(`\n[WARNING] ADVERTENCIAS DE SEGURIDAD:\n${warnings.map((w) => `  - ${w}`).join("\n")}\n`);
    }
  }
}

validateEnv();
