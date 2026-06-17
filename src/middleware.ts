import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { tieneAccesoFichas } from "@/lib/fichasAccess";

// Validación crítica: JWT_SECRET debe estar definido en producción
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET no está configurado. Defínelo en .env");
}
const secret = new TextEncoder().encode(JWT_SECRET);
const COOKIE_NAME = "pmn-token";

/* ── Rate Limiting in-memory ──────────────────────────────── */
const RATE_LIMIT_WINDOW = 60_000; // 1 minuto
// Tope por usuario (no por IP) para no penalizar a varios técnicos detrás de
// la misma IP de oficina. Solo aplica a /api: navegar entre carpetas dispara
// muchas requests de datos, así que el tope es holgado pero corta loops.
const RATE_LIMIT_MAX = 600;
const LOGIN_RATE_LIMIT_WINDOW = 15 * 60_000; // 15 minutos
const LOGIN_RATE_LIMIT_MAX = 10;  // máx 10 intentos de login por ventana
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const loginRateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Limpieza periódica para evitar memory leak
setInterval(() => {
  const now = Date.now();
  rateLimitMap.forEach((entry, key) => {
    if (entry.resetAt < now) rateLimitMap.delete(key);
  });
  loginRateLimitMap.forEach((entry, key) => {
    if (entry.resetAt < now) loginRateLimitMap.delete(key);
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

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginRateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    loginRateLimitMap.set(ip, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= LOGIN_RATE_LIMIT_MAX;
}

/* ── Body size limit (16 KB para la mayoría de rutas API) ── */
const MAX_BODY_BYTES = 16 * 1024; // 16 KB
const LARGE_BODY_PATHS = ["/api/tareas", "/api/stock", "/api/calendario"]; // rutas con payloads más grandes
const MAX_LARGE_BODY_BYTES = 256 * 1024; // 256 KB
const UPLOAD_PATHS = ["/api/importar", "/api/actas", "/api/instructivos", "/api/chat/upload", "/api/personal"]; // rutas con archivos
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

const publicPaths = ["/login", "/api/auth/login", "/api/health", "/api/cron", "/api/notificaciones/changelog"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  // Bloquear acceso directo a /uploads/ — solo se accede vía API autenticada
  if (pathname.startsWith("/uploads")) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  // ── Rate limit estricto para login (por IP, antes del bypass público) ──
  if (pathname === "/api/auth/login" && request.method === "POST") {
    if (!checkLoginRateLimit(ip)) {
      return NextResponse.json(
        { error: "Demasiados intentos de inicio de sesión. Intenta en 15 minutos." },
        { status: 429, headers: { "Retry-After": "900" } }
      );
    }
  }

  // Permitir rutas públicas y archivos estáticos (sin rate-limit general)
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

  // Proteger rutas /dashboard y /api (excepto rutas auth públicas explícitas)
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/api")) {
    const publicAuthRoutes = ["/api/auth/login", "/api/auth/logout", "/api/auth/me"];

    // Verificar el token una sola vez (se reutiliza para rate-limit y auth)
    const token = request.cookies.get(COOKIE_NAME)?.value;
    let userId: string | null = null;
    let email: string | null = null;
    if (token) {
      try {
        const { payload } = await jwtVerify(token, secret);
        userId = typeof payload.userId === "string" ? payload.userId : null;
        email = typeof payload.email === "string" ? payload.email : null;
      } catch {
        userId = null; // token inválido/expirado
        email = null;
      }
    }

    // ── Rate limit general: SOLO /api (no la navegación de páginas), por
    //    usuario cuando hay sesión (cae a IP si no la hay). Así cambiar de
    //    carpeta no devuelve nunca el JSON crudo como documento. ──
    if (pathname.startsWith("/api") && !publicAuthRoutes.includes(pathname)) {
      const rateKey = userId ? `u:${userId}` : `ip:${ip}`;
      if (!checkRateLimit(rateKey)) {
        return NextResponse.json(
          { error: "Demasiadas solicitudes. Intenta más tarde." },
          { status: 429, headers: { "Retry-After": "60" } }
        );
      }
    }

    // ── Body size limit (solo POST/PUT/PATCH sobre /api) ──
    if (["POST", "PUT", "PATCH"].includes(request.method) && pathname.startsWith("/api")) {
      const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
      const maxBytes = UPLOAD_PATHS.some(p => pathname.startsWith(p))
        ? MAX_UPLOAD_BYTES
        : LARGE_BODY_PATHS.some(p => pathname.startsWith(p))
        ? MAX_LARGE_BODY_BYTES
        : MAX_BODY_BYTES;
      if (contentLength > maxBytes) {
        return NextResponse.json({ error: "Payload demasiado grande" }, { status: 413 });
      }
    }

    if (publicAuthRoutes.includes(pathname)) {
      return NextResponse.next();
    }

    if (!userId) {
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // ── Candado de la base de Personal: solo cuentas fijadas en código ──
    if (pathname.startsWith("/dashboard/personal") || pathname.startsWith("/api/personal")) {
      if (!tieneAccesoFichas(email)) {
        if (pathname.startsWith("/api")) {
          return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
        }
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
