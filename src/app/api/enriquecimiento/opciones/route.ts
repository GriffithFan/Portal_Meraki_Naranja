import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/enriquecimiento/opciones — datos para poblar los filtros (solo ADMIN)
export async function GET() {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN")
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const [espacios, estados, tecnicos, provinciasRaw] = await Promise.all([
    prisma.espacioTrabajo.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, parentId: true },
      orderBy: { orden: "asc" },
    }),
    prisma.estadoConfig.findMany({
      where: { activo: true },
      select: { id: true, nombre: true },
      orderBy: { orden: "asc" },
    }),
    prisma.user.findMany({
      where: { activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    }),
    prisma.predio.findMany({
      where: { provincia: { not: null } },
      select: { provincia: true },
      distinct: ["provincia"],
    }),
  ]);

  const provincias = provinciasRaw
    .map((p) => p.provincia)
    .filter((v): v is string => Boolean(v && v.trim()))
    .sort();

  return NextResponse.json({ espacios, estados, tecnicos, provincias });
}
