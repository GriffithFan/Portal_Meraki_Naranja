import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { appendVisibleEstadosClause, buildAssignedPredioVisibilityClause, getDelegatedVisibleUserIds, getHiddenEstadoIdsForSession } from "@/lib/predioVisibility";
import { getRestrictedSpaceIdsForSession } from "@/lib/spaceAccess";

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
      nombreInstitucion: true,
      espacioId: true,
      estado: { select: { id: true, nombre: true, color: true } },
      asignaciones: { include: { usuario: { select: { id: true, nombre: true } } } },
    },
    take: 5000,
  });

  const predios = prediosRaw
    .map((predio) => {
      const base: any = { ...predio };
      delete base.gpsPredio;
      const lat = toFiniteNumber(predio.latitud);
      const lng = toFiniteNumber(predio.longitud);
      if (lat != null && lng != null) {
        return {
          ...base,
          latitud: lat,
          longitud: lng,
        };
      }

      const parsed = parseGpsPair(predio.gpsPredio);
      if (!parsed) return null;

      return {
        ...base,
        latitud: parsed.lat,
        longitud: parsed.lng,
      };
    })
    .filter((predio): predio is NonNullable<typeof predio> => Boolean(predio));

  return NextResponse.json(predios);
}
