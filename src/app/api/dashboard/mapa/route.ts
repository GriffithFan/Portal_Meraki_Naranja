import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const espacioId = searchParams.get("espacioId");
  const equipoAsignado = searchParams.get("equipo");
  const provincia = searchParams.get("provincia");
  const estadoId = searchParams.get("estadoId");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    latitud: { not: null },
    longitud: { not: null },
  };

  if (espacioId) where.espacioId = espacioId;
  if (equipoAsignado) where.equipoAsignado = equipoAsignado;
  if (provincia) where.provincia = provincia;
  if (estadoId) where.estadoId = estadoId;

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
      estado: { select: { id: true, nombre: true, color: true } },
    },
    take: 5000,
  });

  return NextResponse.json(predios);
}
