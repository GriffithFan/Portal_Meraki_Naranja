import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { normalizeAssigneeName } from "@/utils/equipoUtils";

export const dynamic = "force-dynamic";

/**
 * GET /api/personal/usuarios-vinculables?fichaId=… — usuarios para el selector de la ficha.
 *
 * Devuelve los usuarios activos, marcando cuáles ya están tomados por otra ficha, y
 * sugiere el más probable para ESTA ficha.
 *
 * La sugerencia es solo eso: una sugerencia. El cruce automático no sirve porque las
 * fichas usan el nombre legal completo ("AXEL ARIEL SOSA RIOS") y los usuarios apodos
 * ("Axel Sosa", "Axel"), y hay dos Arieles, tres Jorges y tres Sebastianes. Cuando hay
 * más de un candidato no se sugiere nada: adivinar acá es peor que no ayudar.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const fichaId = new URL(request.url).searchParams.get("fichaId");

  const usuarios = await prisma.user.findMany({
    where: { activo: true },
    select: {
      id: true, nombre: true, rol: true, thNumero: true, tecnicoActivo: true,
      fichaPersonal: { select: { id: true, nombre: true } },
    },
    orderBy: [{ tecnicoActivo: "desc" }, { nombre: "asc" }],
  });

  let sugerido: string | null = null;
  if (fichaId) {
    const ficha = await prisma.fichaPersonal.findUnique({ where: { id: fichaId }, select: { nombre: true, userId: true } });
    if (ficha && !ficha.userId) {
      const objetivo = normalizeAssigneeName(ficha.nombre);
      const libres = usuarios.filter((u) => !u.fichaPersonal || u.fichaPersonal.id === fichaId);
      const candidatos = libres.filter((u) => {
        const un = normalizeAssigneeName(u.nombre);
        if (!un) return false;
        // Coincidencia por contención en cualquier dirección, o mismo apellido.
        if (objetivo === un || objetivo.includes(un) || un.includes(objetivo)) return true;
        const apellidoFicha = objetivo.split(" ").pop();
        const apellidoUser = un.split(" ").pop();
        return Boolean(apellidoFicha && apellidoFicha.length > 3 && apellidoFicha === apellidoUser);
      });
      if (candidatos.length === 1) sugerido = candidatos[0].id;
    }
  }

  return NextResponse.json({
    sugerido,
    usuarios: usuarios.map((u) => ({
      id: u.id,
      nombre: u.nombre,
      rol: u.rol,
      th: u.thNumero,
      tecnicoActivo: u.tecnicoActivo,
      tomadoPor: u.fichaPersonal && u.fichaPersonal.id !== fichaId ? u.fichaPersonal.nombre : null,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
