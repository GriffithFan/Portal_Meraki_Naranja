import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { generarSecret, otpauthURL } from "@/lib/twoFactor";

/**
 * POST /api/auth/2fa/setup — Inicia el enrolamiento de 2FA del usuario actual.
 * Genera un secret provisional (no activa 2FA hasta /verify) y devuelve la
 * URL otpauth para armar el QR en el cliente.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, twoFactorEnabled: true },
  });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  if (user.twoFactorEnabled) {
    return NextResponse.json({ error: "El 2FA ya está activo. Desactivalo primero para reconfigurarlo." }, { status: 400 });
  }

  const secret = generarSecret();
  await prisma.user.update({
    where: { id: session.userId },
    data: { twoFactorSecret: secret },
  });

  return NextResponse.json({ secret, otpauth: otpauthURL(user.email, secret) });
}
