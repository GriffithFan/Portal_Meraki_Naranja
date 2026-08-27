import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { appendVisibleEstadosClause, buildAssignedPredioVisibilityClause, getDelegatedVisibleUserIds, getHiddenEstadoIdsForSession } from "@/lib/predioVisibility";
import { getRestrictedSpaceIdsForSession } from "@/lib/spaceAccess";
import { esCoordenadaValida } from "@/lib/gpsPredio";
import { comprimirMapa } from "@/lib/mapaDiccionario";

/* eslint-disable @typescript-eslint/no-explicit-any */

function parseGpsPair(value: string | null | undefined): { lat: number; lng: number } | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .replace(/;/g, ",")
    .replace(/\s+/g, " ");
  const match = normalized.match(/-?\d+(?:[.,]\d+)?/g);
  if (!match || match.length < 2) return null;
  const lat = Number(match[0].replace(",", "."));
  const lng = Number(match[1].replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const espacioId = searchParams.get("espacioId");
  const provincia = searchParams.get("provincia");
  const estadoId = searchParams.get("estadoId");
  // En el mapa, al técnico solo se le ocultan los estados terminados
  // (conforme/cerrado/finalizado): ve el resto de sus predios asignados.
  const hiddenEstadoIds = await getHiddenEstadoIdsForSession(session, "PREDIO", { tecnicoHideOnlyClosed: true });
  const restrictedSpaceIds = await getRestrictedSpaceIdsForSession(session);

  const where: any = {
    AND: [
      {
        OR: [
          {
            latitud: { not: null },
            longitud: { not: null },
          },
          {
            gpsPredio: { not: null },
          },
        ],
      },
    ],
  };

  if (espacioId) where.espacioId = espacioId;
  if (!espacioId && restrictedSpaceIds) where.espacioId = { in: restrictedSpaceIds };

  if (provincia) where.provincia = provincia;
  if (estadoId) where.estadoId = estadoId;

  if (hiddenEstadoIds.length > 0) {
    if (estadoId && hiddenEstadoIds.includes(estadoId)) {
      return NextResponse.json([]);
    }
    appendVisibleEstadosClause(where, hiddenEstadoIds);
  }

  // Usuarios normales (no mod/admin): solo ver predios asignados
  if (!isModOrAdmin(session.rol)) {
    const idsVisibles = await getDelegatedVisibleUserIds(session);
    where.AND = [...(where.AND || []), buildAssignedPredioVisibilityClause(idsVisibles)];
  }

  const prediosRaw = await prisma.predio.findMany({
    where,
    select: {
      id: true,
      nombre: true,
      codigo: true,
      direccion: true,
      ciudad: true,
      provincia: true,
      latitud: true,
      longitud: true,
      gpsPredio: true,
      tipo: true,
      ambito: true,
      lacR: true,
      nombreInstitucion: true,
      espacioId: true,
      fechaDesde: true,
      fechaHasta: true,
      estado: { select: { id: true, nombre: true, color: true } },
      // `select` y no `include`: include trae TODOS los campos de Asignacion (id, tipo,
      // notas, userId, predioId, equipoId, createdAt) por cada asignacion de cada predio,
      // y el mapa solo usa el nombre para colorear por tecnico. Con 2.525 predios eso
      // eran cientos de KB de campos que nadie mira.
      asignaciones: { select: { usuario: { select: { nombre: true } } } },
    },
    take: 5000,
  });

  const predios = prediosRaw
    .map((predio) => {
      const base: any = { ...predio };
      delete base.gpsPredio;
      const lat = toFiniteNumber(predio.latitud);
      const lng = toFiniteNumber(predio.longitud);
      // esCoordenadaValida y no solo "finito": 0 ES finito, y 0,0 dibuja el predio
      // frente a la costa de Africa. Es lo que queda cuando el origen mando "0S 0W".
      if (lat != null && lng != null && esCoordenadaValida(lat, lng)) {
        return {
          ...base,
          latitud: lat,
          longitud: lng,
        };
      }

      const parsed = parseGpsPair(predio.gpsPredio);
      if (!parsed || !esCoordenadaValida(parsed.lat, parsed.lng)) return null;

      return {
        ...base,
        latitud: parsed.lat,
        longitud: parsed.lng,
      };
    })
    .filter((predio): predio is NonNullable<typeof predio> => Boolean(predio));

  // Se manda comprimido con diccionario: de los 1.264 KB que pesaba, 514 eran unos
  // pocos valores (13 estados, 4 provincias, ~40 tecnicos) repetidos miles de veces.
  // El cliente rehidrata al recibir y los predios vuelven a tener la forma de siempre.
  return NextResponse.json(comprimirMapa(predios));
}
