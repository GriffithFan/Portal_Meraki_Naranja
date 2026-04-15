import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mapeo inverso TH → nombres de equipoAsignado en la DB
const TH_EQUIPO_NAMES: Record<string, string[]> = {
  TH01: ["DANIEL", "DANI"],
  TH03: ["JORGE"],
  TH04: ["LUCIO", "ADOLFO"],
  TH07: ["FEDE", "FEDERICO"],
  Ariel: ["ARIEL", "ARIEL MAIOLI", "A. MAIOLI", "A.MAIOLI", "MAIOLI"],
  Julian: ["JULIAN", "JULIÁN"],
};

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const espacioId = searchParams.get("espacioId");
  const equipoParam = searchParams.get("equipo");
  const provincia = searchParams.get("provincia");
  const estadoId = searchParams.get("estadoId");

  const where: any = {
    latitud: { not: null },
    longitud: { not: null },
  };

  if (espacioId) where.espacioId = espacioId;

  // Mapear código TH a nombres reales de la DB si corresponde
  if (equipoParam) {
    const upper = equipoParam.toUpperCase();
    const mapped = Object.entries(TH_EQUIPO_NAMES).find(([k]) => k.toUpperCase() === upper)?.[1];
    if (mapped) {
      where.equipoAsignado = { in: mapped, mode: "insensitive" };
    } else {
      where.equipoAsignado = { equals: equipoParam, mode: "insensitive" };
    }
  }

  if (provincia) where.provincia = provincia;
  if (estadoId) where.estadoId = estadoId;

  // Filtrar por estados ocultos según permisos del usuario (admin ve todo)
  if (session.rol !== "ADMIN") {
    const [permsRol, permsUsuario] = await Promise.all([
      prisma.permisoEstado.findMany({
        where: { rol: session.rol as any, visible: false },
        select: { estadoId: true },
      }),
      prisma.permisoEstadoUsuario.findMany({
        where: { userId: session.userId },
        select: { estadoId: true, visible: true },
      }),
    ]);

    const hidden = new Set(permsRol.map((p) => p.estadoId));
    // Permisos por usuario tienen prioridad
    for (const p of permsUsuario) {
      if (!p.visible) hidden.add(p.estadoId);
      else hidden.delete(p.estadoId);
    }
    if (hidden.size > 0) {
      const notIn = Array.from(hidden);
      if (estadoId) {
        // Si ya hay filtro de estadoId específico, verificar que no esté oculto
        if (hidden.has(estadoId)) {
          return NextResponse.json([]); // Estado solicitado está oculto para este usuario
        }
      } else {
        where.estadoId = { notIn };
      }
    }
  }

  // Usuarios normales (no mod/admin): solo ver predios de su equipo o asignados
  if (!isModOrAdmin(session.rol)) {
    // Buscar por key (case-insensitive) O por valor (reverse lookup)
    const findEquipoForUser = (name: string): string[] => {
      const upper = name.toUpperCase();
      for (const [key, vals] of Object.entries(TH_EQUIPO_NAMES)) {
        if (key.toUpperCase() === upper) return [key, ...vals];
      }
      for (const [key, vals] of Object.entries(TH_EQUIPO_NAMES)) {
        if (vals.some(v => v.toUpperCase() === upper)) return [key, ...vals];
      }
      return [];
    };
    const equipoMatch = findEquipoForUser(session.nombre);
    const thCode = session.nombre.toUpperCase();
    if (/^TH\d+$/.test(thCode) && !equipoMatch.includes(thCode)) {
      equipoMatch.push(thCode);
    }
    where.OR = [
      ...(equipoMatch.length > 0
        ? [{ equipoAsignado: { in: equipoMatch, mode: "insensitive" } }]
        : [{ equipoAsignado: { equals: session.nombre, mode: "insensitive" } }]),
      { asignaciones: { some: { userId: session.userId } } },
    ];
  }

  const predios = await prisma.predio.findMany({
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
      tipo: true,
      equipoAsignado: true,
      ambito: true,
      nombreInstitucion: true,
      espacioId: true,
      estado: { select: { id: true, nombre: true, color: true } },
    },
    take: 5000,
  });

  return NextResponse.json(predios);
}
