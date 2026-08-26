import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { dentroDeHorarioLaboral } from "@/lib/horarioLaboral";

export const dynamic = "force-dynamic";

/** Metros mínimos de desplazamiento para guardar una marca nueva. */
const MIN_METROS = 100;
/** Minutos mínimos entre marcas cuando el técnico no se movió. */
const MIN_MINUTOS = 5;

/** Distancia en metros entre dos coordenadas (haversine). */
function metrosEntre(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * POST /api/ubicacion — el técnico reporta dónde está.
 *
 * Lo llama el cliente mientras Carrot está abierto (ver hooks/useReportarUbicacion).
 * Guarda poco a propósito: solo si se movió más de 100 m o si pasaron más de 5 minutos
 * desde la última marca. Con eso el rastro sigue siendo útil y la tabla no se infla.
 *
 * Tres cosas se validan acá y no solo en el cliente, porque el cliente no es confiable:
 * el consentimiento, la ventana horaria y que el usuario sea un técnico activo.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const horario = dentroDeHorarioLaboral();
  if (!horario.dentro) {
    return NextResponse.json({ ok: false, guardado: false, motivo: horario.motivo, art: horario.art });
  }

  const consentimiento = await prisma.consentimientoUbicacion.findUnique({
    where: { userId: session.userId },
    select: { aceptadoEn: true, revocadoEn: true },
  });
  if (!consentimiento?.aceptadoEn || consentimiento.revocadoEn) {
    return NextResponse.json({ ok: false, guardado: false, motivo: "Sin consentimiento vigente" }, { status: 403 });
  }

  // Solo los técnicos que trabajan hoy: el mapa muestra a ese grupo y no tiene sentido
  // acumular posiciones de nadie más.
  const usuario = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { tecnicoActivo: true, activo: true },
  });
  if (!usuario?.activo || !usuario.tecnicoActivo) {
    return NextResponse.json({ ok: false, guardado: false, motivo: "El usuario no es un técnico activo" }, { status: 403 });
  }

  let lat: unknown, lng: unknown, precision: unknown, origen: unknown;
  try {
    const body = await request.json();
    ({ lat, lng, precision, origen } = body ?? {});
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) {
    return NextResponse.json({ error: "Coordenadas inválidas" }, { status: 400 });
  }
  const prec = Number(precision);
  const orig = origen === "IP" ? "IP" : "GPS";

  const ultima = await prisma.ubicacionTecnico.findFirst({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    select: { lat: true, lng: true, createdAt: true },
  });

  if (ultima) {
    const minutos = (Date.now() - ultima.createdAt.getTime()) / 60000;
    const metros = metrosEntre(ultima.lat, ultima.lng, la, ln);
    if (metros < MIN_METROS && minutos < MIN_MINUTOS) {
      return NextResponse.json({ ok: true, guardado: false, motivo: "Sin cambio significativo" });
    }
  }

  await prisma.ubicacionTecnico.create({
    data: {
      userId: session.userId,
      lat: la,
      lng: ln,
      precision: Number.isFinite(prec) ? prec : null,
      origen: orig,
    },
  });

  return NextResponse.json({ ok: true, guardado: true });
}
