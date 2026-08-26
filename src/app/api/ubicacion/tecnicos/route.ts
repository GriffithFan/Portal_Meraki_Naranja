import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { dentroDeHorarioLaboral, VENTANA_LEGIBLE } from "@/lib/horarioLaboral";

export const dynamic = "force-dynamic";

/**
 * GET /api/ubicacion/tecnicos — última ubicación de cada técnico activo. SOLO ADMIN.
 *
 * Es deliberadamente solo-ADMIN: no lo ven los coordinadores ni un moderador. Es una
 * herramienta interna de administración, no de supervisión de equipo, y si mañana se
 * abre a más gente tiene que ser una decisión explícita y no un efecto de `isModOrAdmin`.
 *
 * Cada técnico viene con la antigüedad de su última marca. El front la muestra siempre:
 * como el navegador no puede reportar en segundo plano, una posición puede ser vieja y
 * nunca debe leerse como actual.
 */

/** Distancia en metros entre dos coordenadas (haversine). */
function metrosEntre(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** El GPS del predio puede venir como texto ("-32.88, -60.70" o con S/W). */
function coordsDePredio(p: { latitud: number | null; longitud: number | null; gpsPredio: string | null }) {
  if (Number.isFinite(p.latitud) && Number.isFinite(p.longitud)) {
    return { lat: p.latitud as number, lng: p.longitud as number };
  }
  const nums = (p.gpsPredio || "").match(/-?\d+(?:[.,]\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const lat = Number(nums[0].replace(",", "."));
  const lng = Number(nums[1].replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export async function GET() {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const tecnicos = await prisma.user.findMany({
    where: { activo: true, tecnicoActivo: true },
    select: {
      id: true, nombre: true, thNumero: true, telefono: true,
      fichaPersonal: { select: { id: true, fotoUrl: true, updatedAt: true } },
      consentimientoUbicacion: { select: { aceptadoEn: true, revocadoEn: true } },
      ubicaciones: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { lat: true, lng: true, precision: true, origen: true, createdAt: true },
      },
    },
    orderBy: { nombre: "asc" },
  });

  // ── Último predio que cada técnico pasó a INSTALADO ──────────────────────────
  // Se busca por los predios que tiene asignados y no por el autor de la actividad:
  // el cambio de estado lo puede haber registrado el enriquecimiento o un admin, pero
  // el trabajo es del técnico asignado.
  const asignaciones = await prisma.asignacion.findMany({
    where: { userId: { in: tecnicos.map((t) => t.id) }, tipo: { in: ["TAREA", "TECNICO"] } },
    select: { userId: true, predioId: true },
  });
  const tecnicosDePredio = new Map<string, string[]>();
  for (const a of asignaciones) {
    // predioId y userId son opcionales en el modelo: una asignacion puede apuntar a otra cosa.
    if (!a.predioId || !a.userId) continue;
    const lista = tecnicosDePredio.get(a.predioId) || [];
    lista.push(a.userId);
    tecnicosDePredio.set(a.predioId, lista);
  }

  const ultimoInstalado = new Map<string, { predioId: string; fecha: Date }>();
  if (tecnicosDePredio.size > 0) {
    const transiciones = await prisma.actividad.findMany({
      where: {
        entidad: "PREDIO",
        entidadId: { in: Array.from(tecnicosDePredio.keys()) },
        descripcion: { contains: "-> INSTALADO" },
      },
      orderBy: { createdAt: "desc" },
      take: 1500,
      select: { entidadId: true, createdAt: true },
    });
    for (const t of transiciones) {
      const predioId = t.entidadId;
      if (!predioId) continue;
      for (const userId of tecnicosDePredio.get(predioId) || []) {
        // Como vienen ordenadas de más nueva a más vieja, la primera que aparece manda.
        if (!ultimoInstalado.has(userId)) ultimoInstalado.set(userId, { predioId, fecha: t.createdAt });
      }
    }
  }

  const prediosIds = Array.from(new Set(Array.from(ultimoInstalado.values()).map((x) => x.predioId)));
  const predios = prediosIds.length
    ? await prisma.predio.findMany({
        where: { id: { in: prediosIds } },
        select: {
          id: true, codigo: true, nombre: true, direccion: true, ciudad: true, provincia: true,
          incidencias: true, latitud: true, longitud: true, gpsPredio: true,
          estado: { select: { nombre: true } },
        },
      })
    : [];
  const predioPorId = new Map(predios.map((p) => [p.id, p]));

  const ahora = Date.now();
  const filas = tecnicos.map((t) => {
    const u = t.ubicaciones[0] || null;
    const inst = ultimoInstalado.get(t.id);
    const predio = inst ? predioPorId.get(inst.predioId) : null;

    let distanciaM: number | null = null;
    if (u && predio) {
      const c = coordsDePredio(predio);
      if (c) distanciaM = Math.round(metrosEntre(u.lat, u.lng, c.lat, c.lng));
    }

    return {
      id: t.id,
      nombre: t.nombre,
      th: t.thNumero,
      telefono: t.telefono,
      fotoUrl: t.fichaPersonal?.fotoUrl
        ? `/api/personal/${t.fichaPersonal.id}/foto?v=${encodeURIComponent(t.fichaPersonal.updatedAt.toISOString())}`
        : null,
      consentimiento: t.consentimientoUbicacion?.revocadoEn
        ? "revocado"
        : t.consentimientoUbicacion?.aceptadoEn ? "aceptado" : "pendiente",
      ubicacion: u
        ? {
            lat: u.lat, lng: u.lng, precision: u.precision, origen: u.origen,
            fecha: u.createdAt.toISOString(),
            minutos: Math.round((ahora - u.createdAt.getTime()) / 60000),
          }
        : null,
      ultimoInstalado: predio
        ? {
            codigo: predio.codigo,
            nombre: predio.nombre,
            incidencia: predio.incidencias,
            direccion: predio.direccion,
            ciudad: predio.ciudad,
            provincia: predio.provincia,
            estadoActual: predio.estado?.nombre ?? null,
            fecha: inst!.fecha.toISOString(),
            distanciaM,
          }
        : null,
    };
  });

  const horario = dentroDeHorarioLaboral();
  return NextResponse.json({
    generadoEn: new Date().toISOString(),
    ventana: VENTANA_LEGIBLE,
    enHorario: horario.dentro,
    horaArt: horario.art,
    tecnicos: filas,
  }, { headers: { "Cache-Control": "no-store" } });
}
