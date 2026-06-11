import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { verificarCodigo } from "@/lib/twoFactor";

/**
 * POST /api/auth/2fa/verify — Confirma el enrolamiento: valida un código TOTP
 * contra el secret provisional y, si es correcto, activa 2FA.
 * Body: { code: string }
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code : "";

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { twoFactorSecret: true, twoFactorEnabled: true },
  });
  if (!user?.twoFactorSecret) {
    return NextResponse.json({ error: "Primero generá el código QR (setup)" }, { status: 400 });
  }

  if (!verificarCodigo(code, user.twoFactorSecret)) {
    return NextResponse.json({ error: "Código inválido. Revisá la app y la hora del dispositivo." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { twoFactorEnabled: true },
  });

  await prisma.actividad.create({
    data: {
      accion: "EDITAR",
      descripcion: "Activó la verificación en dos pasos (2FA)",
      entidad: "USUARIO",
      entidadId: session.userId,
      userId: session.userId,
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
