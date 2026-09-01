import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { dentroDeHorarioLaboral, VENTANA_LEGIBLE } from "@/lib/horarioLaboral";
import { esCoordenadaValida, parCoordenadas } from "@/lib/gpsPredio";

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

/**
 * Medianoche de HOY en hora argentina, expresada en UTC.
 *
 * El servidor corre en UTC y Argentina es UTC-3 fijo. Sin este ajuste, entre las 21:00 y
 * la medianoche argentina el "recorrido de hoy" arrancaria del dia siguiente y saldria
 * vacio justo en el unico horario en que a nadie le sirve que salga vacio.
 */
function arranqueDelDia(): Date {
  const ahora = new Date();
  const art = new Date(ahora.getTime() - 3 * 3600 * 1000);
  return new Date(Date.UTC(art.getUTCFullYear(), art.getUTCMonth(), art.getUTCDate(), 3, 0, 0, 0));
}

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
  // esCoordenadaValida y no Number.isFinite: 0 ES finito, y un predio en 0,0 daria una
  // distancia calculada desde el Golfo de Guinea.
  if (esCoordenadaValida(p.latitud, p.longitud)) {
    return { lat: p.latitud as number, lng: p.longitud as number };
  }
  const par = parCoordenadas(p.gpsPredio);
  return par ? { lat: par[0], lng: par[1] } : null;
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
      // Todo lo del dia, no solo el ultimo punto: con eso se dibuja el recorrido.
      // Llega una marca cada ~10 minutos, asi que una jornada son unos 60 puntos.
      ubicaciones: {
        where: { createdAt: { gte: arranqueDelDia() } },
        orderBy: { createdAt: "desc" },
        take: 200,
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

  // ── Predios asignados que todavia hay que trabajar ─────────────────────────
  // Es el dato operativo del mapa: no alcanza con ver donde esta el tecnico, hay que
  // poder responder si esta cerca de lo que tiene pendiente o lejos de todo.
  //
  // Solo los estados que significan "falta hacerlo": ya conformes o facturados no
  // aportan nada y solo ensucian el mapa.
  const PENDIENTES = ["SIN ASIGNAR", "EN PROGRESO", "RELEVAR", "NO CONFORME", "CAMBIO LAC"];
  const estadosPend = await prisma.estadoConfig.findMany({
    where: { nombre: { in: PENDIENTES } },
    select: { id: true },
  });
  const idsPredioAsignado = Array.from(new Set(asignaciones.map((a) => a.predioId).filter(Boolean))) as string[];
  const prediosPend = idsPredioAsignado.length && estadosPend.length
    ? await prisma.predio.findMany({
        where: { id: { in: idsPredioAsignado }, estadoId: { in: estadosPend.map((e) => e.id) } },
        select: {
          id: true, codigo: true, nombre: true, ciudad: true,
          latitud: true, longitud: true, gpsPredio: true,
          estado: { select: { nombre: true } },
        },
      })
    : [];

  /** userId -> predios pendientes suyos que tienen coordenadas. */
  const pendientesDe = new Map<string, Array<{ id: string; codigo: string | null; nombre: string; ciudad: string | null; estado: string | null; lat: number; lng: number }>>();
  for (const pr of prediosPend) {
    const c = coordsDePredio(pr);
    if (!c) continue; // sin coordenadas no se puede ubicar ni medir: se omite
    for (const userId of tecnicosDePredio.get(pr.id) || []) {
      const lista = pendientesDe.get(userId) || [];
      lista.push({ id: pr.id, codigo: pr.codigo, nombre: pr.nombre, ciudad: pr.ciudad, estado: pr.estado?.nombre ?? null, ...c });
      pendientesDe.set(userId, lista);
    }
  }

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
      // Recorrido del dia, de mas viejo a mas nuevo, para dibujar la linea.
      recorrido: t.ubicaciones
        .slice()
        .reverse()
        .map((x) => ({ lat: x.lat, lng: x.lng, fecha: x.createdAt.toISOString() })),
      // Pendientes suyos, del mas cercano al mas lejano. El primero es el que importa:
      // dice si esta en lo que tiene que hacer o lejos de todo.
      asignados: (() => {
        const lista = (pendientesDe.get(t.id) || []).map((x) => ({
          codigo: x.codigo, nombre: x.nombre, ciudad: x.ciudad, estado: x.estado,
          lat: x.lat, lng: x.lng,
          distanciaM: u ? Math.round(metrosEntre(u.lat, u.lng, x.lat, x.lng)) : null,
        }));
        lista.sort((a, b) => (a.distanciaM ?? Infinity) - (b.distanciaM ?? Infinity));
        return lista.slice(0, 60); // suficiente para el mapa; mas es ruido y payload
      })(),
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
