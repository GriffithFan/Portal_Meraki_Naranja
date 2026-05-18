import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// Validación crítica: JWT_SECRET debe estar definido en producción
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET no está configurado. Defínelo en .env");
}
const secret = new TextEncoder().encode(JWT_SECRET);
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "pmn-token";
const COOKIE_PATH = process.env.AUTH_COOKIE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || "/";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

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
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
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

export async function getSession(): Promise<TokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function setTokenCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: COOKIE_PATH,
  });
}

export async function removeTokenCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: COOKIE_PATH,
  });
}

export function isAdmin(rol: string): boolean {
  return rol === "ADMIN";
}

export function isModOrAdmin(rol: string): boolean {
  return rol === "ADMIN" || rol === "MODERADOR";
}
