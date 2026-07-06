/**
 * Registro centralizado de errores de la aplicación.
 *
 * - `registrarError(...)` guarda un error en la tabla ErrorLog (best-effort:
 *   nunca lanza, nunca bloquea la operación principal). Lo usan las rutas API,
 *   el endpoint de errores de cliente y el handler global de abajo.
 * - Se registra un handler de `unhandledRejection` una sola vez (idempotente)
 *   para capturar rechazos no manejados del proceso.
 *
 * Importa prisma de forma DINÁMICA dentro de las funciones para evitar un ciclo
 * de imports con `@/lib/prisma` (que hace `import "@/lib/errorLog"`).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type RegistrarErrorInput = {
  nivel?: "ERROR" | "WARN";
  origen?: "SERVER" | "CLIENTE";
  mensaje: string;
  stack?: string | null;
  ruta?: string | null;
  metodo?: string | null;
  statusCode?: number | null;
  userId?: string | null;
  userNombre?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
};

function clamp(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

export async function registrarError(input: RegistrarErrorInput): Promise<void> {
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.errorLog.create({
      data: {
        nivel: input.nivel || "ERROR",
        origen: input.origen || "SERVER",
        mensaje: clamp(input.mensaje, 4000) || "(sin mensaje)",
        stack: clamp(input.stack ?? null, 8000),
        ruta: clamp(input.ruta ?? null, 500),
        metodo: clamp(input.metodo ?? null, 10),
        statusCode: input.statusCode ?? null,
        userId: input.userId ?? null,
        userNombre: clamp(input.userNombre ?? null, 200),
        userAgent: clamp(input.userAgent ?? null, 500),
        metadata: (input.metadata as object) ?? undefined,
      },
    });
  } catch (e) {
    // El registro de errores jamás debe romper nada; solo dejamos rastro en consola.
    console.error("[errorLog] no se pudo registrar el error:", e);
  }
}

/**
 * Envuelve un handler de ruta API para capturar automáticamente cualquier
 * excepción no atrapada, registrarla y devolver un 500 consistente.
 * Uso: `export const POST = withErrorLog(async (req) => { ... })`.
 */
export function withErrorLog<T extends (...args: any[]) => Promise<Response>>(handler: T): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args);
    } catch (err) {
      const req = args[0] as Request | undefined;
      let ruta: string | null = null;
      let metodo: string | null = null;
      try {
        if (req && typeof (req as Request).url === "string") {
          ruta = new URL((req as Request).url).pathname;
          metodo = (req as Request).method || null;
        }
      } catch { /* ignore */ }
      const e = err as { message?: string; stack?: string };
      await registrarError({
        nivel: "ERROR",
        origen: "SERVER",
        mensaje: e?.message || String(err),
        stack: e?.stack ?? null,
        ruta,
        metodo,
        statusCode: 500,
      });
      const { NextResponse } = await import("next/server");
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
  }) as T;
}

// ── Handler global de rechazos no manejados (una sola vez por proceso) ──
const g = globalThis as unknown as { __errorLogHandlers?: boolean };
if (!g.__errorLogHandlers && typeof process !== "undefined" && typeof process.on === "function") {
  g.__errorLogHandlers = true;
  process.on("unhandledRejection", (reason: unknown) => {
    const e = reason as { message?: string; stack?: string };
    console.error("[unhandledRejection]", reason);
    void registrarError({
      nivel: "ERROR",
      origen: "SERVER",
      mensaje: e?.message || String(reason),
      stack: e?.stack ?? null,
      ruta: "unhandledRejection",
    });
  });
}
