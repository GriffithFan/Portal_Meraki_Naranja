import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { getClientIp, logSecurityEvent } from "@/lib/securityEvents";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET no está configurado. Defínelo en .env");
}
const secret = new TextEncoder().encode(JWT_SECRET);
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "pmn-token";
const COOKIE_PATH = process.env.AUTH_COOKIE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || "/";
const APP_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const SESSION_REFRESH_THRESHOLD_SECONDS = 60 * 60 * 2;

const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 200;
const LOGIN_RATE_LIMIT_WINDOW = 15 * 60_000;
const LOGIN_RATE_LIMIT_MAX = 10;
const TRUSTED_RATE_LIMIT_IPS = new Set(
  (process.env.RATE_LIMIT_TRUSTED_IPS || "")
    .split(/[\s,]+/)
    .map(ip => ip.trim())
    .filter(Boolean)
);
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const loginRateLimitMap = new Map<string, { count: number; resetAt: number }>();

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

async function hasAdminSession(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, secret);
    return payload.rol === "ADMIN";
  } catch {
    return false;
  }
}

const MAX_BODY_BYTES = 16 * 1024;
const LARGE_BODY_PATHS = ["/api/tareas", "/api/stock", "/api/calendario"];
const MAX_LARGE_BODY_BYTES = 256 * 1024;
const UPLOAD_PATHS = ["/api/importar", "/api/actas", "/api/instructivos", "/api/chat/upload"];
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_INSTRUCTIVO_UPLOAD_BYTES = 280 * 1024 * 1024;

const publicPaths = ["/login", "/api/auth/login", "/api/health", "/api/cron", "/api/notificaciones/changelog", "/api/security/csp-report"];

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.meraki.com https://ipapi.co https://ipwho.is https://freeipapi.com",
  "media-src 'self' blob:",
  "frame-src 'self' https://www.youtube.com https://youtube.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "report-uri /api/security/csp-report",
].join("; ");

function withSecurityHeaders(response: NextResponse) {
  response.headers.set("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY);
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function appUrl(request: NextRequest, path: string) {
  return new URL(`${APP_BASE_PATH}${path}`, request.url);
}

function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: COOKIE_PATH,
  });
  return response;
}

function shouldRefreshSession(payload: JWTPayload) {
  if (typeof payload.exp !== "number") return true;
  return payload.exp - Math.floor(Date.now() / 1000) < SESSION_REFRESH_THRESHOLD_SECONDS;
}

async function refreshSessionCookie(response: NextResponse, payload: JWTPayload) {
  if (!shouldRefreshSession(payload)) return response;
  const tokenPayload = {
    userId: String(payload.userId || ""),
    email: String(payload.email || ""),
    rol: String(payload.rol || ""),
    nombre: String(payload.nombre || ""),
    esMesa: payload.esMesa === true,
  };
  if (!tokenPayload.userId || !tokenPayload.email || !tokenPayload.rol) return response;

  const nextToken = await new SignJWT(tokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secret);

  response.cookies.set(COOKIE_NAME, nextToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: COOKIE_PATH,
  });
  return response;
}

function maxBodyBytesFor(pathname: string) {
  if (pathname.startsWith("/api/instructivos")) return MAX_INSTRUCTIVO_UPLOAD_BYTES;
  if (UPLOAD_PATHS.some(p => pathname.startsWith(p))) return MAX_UPLOAD_BYTES;
  if (LARGE_BODY_PATHS.some(p => pathname.startsWith(p))) return MAX_LARGE_BODY_BYTES;
  return MAX_BODY_BYTES;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const ip = getClientIp(request.headers);
  const skipGlobalRateLimit = TRUSTED_RATE_LIMIT_IPS.has(ip) || await hasAdminSession(request);
  if (pathname.startsWith("/api") && !skipGlobalRateLimit && !checkRateLimit(ip)) {
    logSecurityEvent({ type: "RATE_LIMIT_EXCEEDED", ip, path: pathname, method: request.method, status: 429 });
    return withSecurityHeaders(NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta más tarde." },
      { status: 429, headers: { "Retry-After": "60" } }
    ));
  }

  if (pathname === "/api/auth/login" && request.method === "POST") {
    if (!checkLoginRateLimit(ip)) {
      logSecurityEvent({ type: "LOGIN_RATE_LIMIT_EXCEEDED", ip, path: pathname, method: request.method, status: 429 });
      return withSecurityHeaders(NextResponse.json(
        { error: "Demasiados intentos de inicio de sesión. Intenta en 15 minutos." },
        { status: 429, headers: { "Retry-After": "900" } }
      ));
    }
  }

  if (["POST", "PUT", "PATCH"].includes(request.method) && pathname.startsWith("/api")) {
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    const maxBytes = maxBodyBytesFor(pathname);
    if (contentLength > maxBytes) {
      logSecurityEvent({ type: "PAYLOAD_TOO_LARGE", ip, path: pathname, method: request.method, status: 413, metadata: { contentLength, maxBytes } });
      return withSecurityHeaders(NextResponse.json(
        { error: "Payload demasiado grande" },
        { status: 413 }
      ));
    }
  }

  if (pathname.startsWith("/uploads")) {
    logSecurityEvent({ type: "DIRECT_UPLOAD_ACCESS_BLOCKED", ip, path: pathname, method: request.method, status: 403 });
    return withSecurityHeaders(NextResponse.json({ error: "Acceso denegado" }, { status: 403 }));
  }

  if (
    publicPaths.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/"
  ) {
    if (pathname === "/") {
      const token = request.cookies.get(COOKIE_NAME)?.value;
      if (token) {
        try {
          const { payload } = await jwtVerify(token, secret);
          return withSecurityHeaders(await refreshSessionCookie(NextResponse.redirect(appUrl(request, "/dashboard")), payload));
        } catch {
          // Token inválido, redirigir a login.
          return withSecurityHeaders(clearSessionCookie(NextResponse.redirect(appUrl(request, "/login"))));
        }
      }
      return withSecurityHeaders(NextResponse.redirect(appUrl(request, "/login")));
    }
    return withSecurityHeaders(NextResponse.next());
  }

  if (pathname.startsWith("/dashboard") || pathname.startsWith("/api")) {
    const publicAuthRoutes = ["/api/auth/login", "/api/auth/logout", "/api/auth/me"];
    if (publicAuthRoutes.includes(pathname)) {
      return withSecurityHeaders(NextResponse.next());
    }

    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      if (pathname.startsWith("/api")) {
        return withSecurityHeaders(NextResponse.json({ error: "No autorizado" }, { status: 401 }));
      }
      return withSecurityHeaders(NextResponse.redirect(appUrl(request, "/login")));
    }

    try {
      const { payload } = await jwtVerify(token, secret);
      return withSecurityHeaders(await refreshSessionCookie(NextResponse.next(), payload));
    } catch {
      if (pathname.startsWith("/api")) {
        logSecurityEvent({ type: "INVALID_TOKEN", ip, path: pathname, method: request.method, status: 401 });
        return withSecurityHeaders(clearSessionCookie(NextResponse.json({ error: "Token expirado" }, { status: 401 })));
      }
      logSecurityEvent({ type: "INVALID_TOKEN", ip, path: pathname, method: request.method, status: 302 });
      return withSecurityHeaders(clearSessionCookie(NextResponse.redirect(appUrl(request, "/login"))));
    }
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};