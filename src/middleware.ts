import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Validación crítica: JWT_SECRET debe estar definido en producción
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET no está configurado. Defínelo en .env");
}
const secret = new TextEncoder().encode(JWT_SECRET);
const COOKIE_NAME = "pmn-token";

/* ── Rate Limiting in-memory ──────────────────────────────── */
const RATE_LIMIT_WINDOW = 60_000; // 1 minuto
const RATE_LIMIT_MAX = 120;       // máx 120 requests por ventana por IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Limpieza periódica para evitar memory leak
setInterval(() => {
  const now = Date.now();
  rateLimitMap.forEach((entry, key) => {
    if (entry.resetAt < now) rateLimitMap.delete(key);
  });
}, 60_000);

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

/* ── Body size limit (16 KB para la mayoría de rutas API) ── */
const MAX_BODY_BYTES = 16 * 1024; // 16 KB
const LARGE_BODY_PATHS = ["/api/tareas", "/api/stock", "/api/calendario"]; // rutas con payloads más grandes
const MAX_LARGE_BODY_BYTES = 256 * 1024; // 256 KB

const publicPaths = ["/login", "/api/auth/login", "/api/health", "/api/cron"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Rate Limiting ──
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta más tarde." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // ── Body size limit (solo POST/PUT/PATCH) ──
  if (["POST", "PUT", "PATCH"].includes(request.method) && pathname.startsWith("/api")) {
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    const maxBytes = LARGE_BODY_PATHS.some(p => pathname.startsWith(p))
      ? MAX_LARGE_BODY_BYTES
      : MAX_BODY_BYTES;
    if (contentLength > maxBytes) {
      return NextResponse.json(
        { error: "Payload demasiado grande" },
        { status: 413 }
      );
    }
  }

  // Bloquear acceso directo a /uploads/ — solo se accede vía API autenticada
  if (pathname.startsWith("/uploads")) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  // Permitir rutas públicas y archivos estáticos
  if (
    publicPaths.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/"
  ) {
    // Si está en "/" y tiene token válido, redirigir a dashboard
    if (pathname === "/") {
      const token = request.cookies.get(COOKIE_NAME)?.value;
      if (token) {
        try {
          await jwtVerify(token, secret);
          return NextResponse.redirect(new URL("/dashboard", request.url));
        } catch {
          // Token inválido, redirigir a login
        }
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  // Proteger rutas /dashboard y /api (excepto /api/auth)
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/api")) {
    if (pathname.startsWith("/api/auth")) {
      return NextResponse.next();
    }

    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }

    try {
      await jwtVerify(token, secret);
      return NextResponse.next();
    } catch {
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "Token expirado" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
