import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { setAuditActor } from "@/lib/auditContext";

// Validación crítica: JWT_SECRET debe estar definido en producción
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET no está configurado. Defínelo en .env");
}
const secret = new TextEncoder().encode(JWT_SECRET);
const COOKIE_NAME = "pmn-token";

export interface TokenPayload {
  userId: string;
  email: string;
  rol: string;
  nombre: string;
  esMesa?: boolean;
}

export async function createToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);
}

export async function verifyToken(
  token: string
): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

/* ── Revocación de sesión ──────────────────────────────────
 * El JWT por sí solo no se puede invalidar (dura 8h). Para que desactivar un
 * usuario o cambiarle el rol surta efecto al instante (no en hasta 8h), tras
 * verificar el token re-validamos contra la BD: si el usuario no está `activo`
 * la sesión se considera inválida, y el rol/esMesa autoritativos salen de la BD
 * (no del token). Se cachea por userId ~30s para no consultar en cada request
 * (proceso único PM2). `invalidateSessionCache` lo refresca al instante.
 */
const SESSION_CACHE_TTL = 30_000;
type FreshUser = { activo: boolean; rol: string; nombre: string; esMesa: boolean };
const sessionCache = new Map<string, { data: FreshUser; expiresAt: number }>();

export function invalidateSessionCache(userId: string) {
  sessionCache.delete(userId);
}

async function getFreshUser(userId: string): Promise<FreshUser | null> {
  const now = Date.now();
  const cached = sessionCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activo: true, rol: true, nombre: true, esMesa: true },
  });
  if (!user) {
    sessionCache.delete(userId);
    return null;
  }
  const data: FreshUser = { activo: user.activo, rol: user.rol, nombre: user.nombre, esMesa: user.esMesa };
  sessionCache.set(userId, { data, expiresAt: now + SESSION_CACHE_TTL });
  return data;
}

export async function getSession(): Promise<TokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  try {
    const fresh = await getFreshUser(payload.userId);
    if (!fresh || !fresh.activo) return null; // desactivado o inexistente → sesión inválida
    // rol/esMesa/nombre autoritativos desde la BD (refleja cambios de rol al instante)
    // Atribuir las modificaciones de este request al usuario (auditoría automática).
    setAuditActor({ userId: payload.userId, nombre: fresh.nombre, rol: fresh.rol });
    return { ...payload, rol: fresh.rol, esMesa: fresh.esMesa, nombre: fresh.nombre };
  } catch {
    // Ante un error transitorio de BD, no desloguear a todos: usar el token.
    setAuditActor({ userId: payload.userId, nombre: payload.nombre, rol: payload.rol });
    return payload;
  }
}

export async function setTokenCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 8, // 8 horas
    path: "/",
  });
}

export async function removeTokenCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
}

export function isAdmin(rol: string): boolean {
  return rol === "ADMIN";
}

export function isModOrAdmin(rol: string): boolean {
  return rol === "ADMIN" || rol === "MODERADOR";
}
