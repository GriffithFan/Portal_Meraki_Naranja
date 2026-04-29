import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { withPrivateCatalogCache } from "@/lib/cacheHeaders";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isModOrAdmin(session.rol)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const usuarios = await prisma.user.findMany({
    where: { activo: true },
    select: {
      id: true,
      email: true,
      nombre: true,
      rol: true,
      esMesa: true,
    },
    orderBy: { nombre: "asc" },
  });

  return withPrivateCatalogCache(NextResponse.json(usuarios));
}