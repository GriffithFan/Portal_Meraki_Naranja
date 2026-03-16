export async function register() {
  // Validación de variables de entorno al arrancar (solo server-side)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/envCheck");
  }
}
