import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { VENTANA_LEGIBLE, VERSION_AVISO } from "@/lib/horarioLaboral";

export const dynamic = "force-dynamic";

/**
 * GET /api/ubicacion/consentimiento — ¿este usuario tiene que ver el aviso?
 *
 * Lo consulta el cliente al entrar. Devuelve `debePreguntar` en true solo para los
 * técnicos activos que todavía no aceptaron (o que revocaron, o que aceptaron una
 * versión anterior del aviso).
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const usuario = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { tecnicoActivo: true, activo: true },
  });
  const aplica = Boolean(usuario?.activo && usuario.tecnicoActivo);

  const c = await prisma.consentimientoUbicacion.findUnique({
    where: { userId: session.userId },
    select: { aceptadoEn: true, revocadoEn: true, version: true },
  });

  const vigente = Boolean(c?.aceptadoEn && !c.revocadoEn && c.version === VERSION_AVISO);

  return NextResponse.json({
    aplica,
    vigente,
    debePreguntar: aplica && !vigente && !c?.revocadoEn,
    revocado: Boolean(c?.revocadoEn),
    ventana: VENTANA_LEGIBLE,
    version: VERSION_AVISO,
  }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/ubicacion/consentimiento — el técnico acepta o revoca.
 *
 * Body: `{ aceptar: boolean }`. Revocar no borra el historial ya registrado, solo
 * corta el registro nuevo; para borrar lo viejo está la purga o un pedido explícito.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let aceptar = false;
  try {
    const body = await request.json();
    aceptar = body?.aceptar === true;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const ahora = new Date();
  await prisma.consentimientoUbicacion.upsert({
    where: { userId: session.userId },
    create: {
      userId: session.userId,
      version: VERSION_AVISO,
      aceptadoEn: aceptar ? ahora : null,
      revocadoEn: aceptar ? null : ahora,
    },
    update: aceptar
      ? { aceptadoEn: ahora, revocadoEn: null, version: VERSION_AVISO }
      : { revocadoEn: ahora },
  });

  await prisma.actividad.create({
    data: {
      accion: "EDITAR",
      descripcion: aceptar
        ? "Aceptó compartir ubicación durante la jornada"
        : "Revocó el permiso de compartir ubicación",
      entidad: "USUARIO",
      entidadId: session.userId,
      userId: session.userId,
    },
  }).catch(() => { /* el log no debe romper la operación */ });

  return NextResponse.json({ ok: true, aceptado: aceptar });
}
