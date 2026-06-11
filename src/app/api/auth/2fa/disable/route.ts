import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { verificarCodigo } from "@/lib/twoFactor";

/**
 * POST /api/auth/2fa/disable — Desactiva 2FA del usuario actual.
 * Requiere un código TOTP válido (evita que una sesión secuestrada lo apague).
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
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    return NextResponse.json({ error: "El 2FA no está activo" }, { status: 400 });
  }

  if (!verificarCodigo(code, user.twoFactorSecret)) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });

  await prisma.actividad.create({
    data: {
      accion: "EDITAR",
      descripcion: "Desactivó la verificación en dos pasos (2FA)",
      entidad: "USUARIO",
      entidadId: session.userId,
      userId: session.userId,
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
