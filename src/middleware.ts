import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Validación crítica: JWT_SECRET debe estar definido en producción
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET no está configurado. Defínelo en .env");
}
const secret = new TextEncoder().encode(JWT_SECRET);
const COOKIE_NAME = "pmn-token";

const publicPaths = ["/login", "/api/auth/login", "/api/health", "/api/cron"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
