import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createToken, setTokenCookie } from "@/lib/auth";
import { loginSchema, parseBody, isErrorResponse } from "@/lib/validation";

/* ── Rate limiter en memoria (por IP) ── */
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 3;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos

// Limpieza periódica para evitar memory leak
setInterval(() => {
  const now = Date.now();
  loginAttempts.forEach((record, key) => {
    if (now - record.lastAttempt > WINDOW_MS) loginAttempts.delete(key);
  });
}, 5 * 60_000);

// Hash dummy para anti-timing oracle (evita revelar si el email existe)
const DUMMY_HASH = "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012";

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now - record.lastAttempt > WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
    return false;
  }
  record.count++;
  record.lastAttempt = now;
  if (record.count > MAX_ATTEMPTS) return true;
  return false;
}

function clearRateLimit(ip: string) {
  loginAttempts.delete(ip);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Intente de nuevo en 15 minutos." },
      { status: 429 }
    );
  }

  try {
    const data = await parseBody(request, loginSchema);
    if (isErrorResponse(data)) return data;

    const { email, password } = data;

    const user = await prisma.user.findUnique({ where: { email } });

    // Anti-timing oracle: siempre ejecutar bcrypt.compare para que el tiempo
    // de respuesta sea constante, sin importar si el email existe o no.
    const hashToCompare = user?.activo ? user.password : DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCompare);

    if (!user || !user.activo || !valid) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    const token = await createToken({
      userId: user.id,
      email: user.email,
      rol: user.rol,
      nombre: user.nombre,
      esMesa: user.esMesa,
    });

    await setTokenCookie(token);
    clearRateLimit(ip);

    // Registrar acceso (auditoría) — fire-and-forget
    prisma.registroAcceso.create({
      data: {
        userId: user.id,
        accion: "LOGIN",
        detalle: `Login exitoso desde ${ip}`,
        ip,
        metadata: { userAgent: request.headers.get("user-agent") || "" },
      },
    }).catch(() => {});

    return NextResponse.json({
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        esMesa: user.esMesa,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
