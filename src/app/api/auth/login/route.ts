import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createToken, setTokenCookie } from "@/lib/auth";
import { verificarCodigo } from "@/lib/twoFactor";
import { loginSchema, parseBody, isErrorResponse } from "@/lib/validation";

/* ── Rate limiter en memoria (por IP) — cuenta solo intentos FALLIDOS ── */
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
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

/** Solo lectura: ¿está la IP por encima del límite de fallos? */
function isRateLimited(ip: string): boolean {
  const record = loginAttempts.get(ip);
  if (!record || Date.now() - record.lastAttempt > WINDOW_MS) return false;
  return record.count >= MAX_ATTEMPTS;
}

/** Registra un intento fallido (password o código 2FA incorrecto). */
function recordFailure(ip: string) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now - record.lastAttempt > WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
  } else {
    record.count++;
    record.lastAttempt = now;
  }
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

    const { email, password, code } = data;

    const user = await prisma.user.findUnique({ where: { email } });

    // Anti-timing oracle: siempre ejecutar bcrypt.compare para que el tiempo
    // de respuesta sea constante, sin importar si el email existe o no.
    const hashToCompare = user?.activo ? user.password : DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCompare);

    if (!user || !user.activo || !valid) {
      recordFailure(ip);
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    // ── Segundo factor (TOTP), si el usuario lo tiene activo ──
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      if (!code) {
        // Contraseña correcta pero falta el código: pedirlo (no cuenta como fallo)
        return NextResponse.json({ requiere2FA: true }, { status: 401 });
      }
      if (!verificarCodigo(code, user.twoFactorSecret)) {
        recordFailure(ip);
        return NextResponse.json(
          { error: "Código de verificación inválido", requiere2FA: true },
          { status: 401 }
        );
      }
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
