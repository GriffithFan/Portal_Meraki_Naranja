import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { dayRangeAR } from "@/lib/fechas";

function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/jornadas?fecha=YYYY-MM-DD
 * - `mia`: jornada abierta del usuario actual (o null).
 * - `hoy`: jornadas del usuario actual en el día consultado.
 * - `todos` (solo Admin/Mod): estado de cada técnico activo en ese día.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const fecha = request.nextUrl.searchParams.get("fecha");
  const { start, end } = dayRangeAR(fecha);

  const mia = await prisma.jornadaLaboral.findFirst({
    where: { userId: session.userId, fin: null },
    orderBy: { inicio: "desc" },
  });

  const hoy = await prisma.jornadaLaboral.findMany({
    where: { userId: session.userId, inicio: { gte: start, lt: end } },
    orderBy: { inicio: "asc" },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: any = { mia, hoy };

  if (isModOrAdmin(session.rol)) {
    const tecnicos = await prisma.user.findMany({
      where: { rol: "TECNICO", activo: true },
      select: { id: true, nombre: true, email: true },
      orderBy: { nombre: "asc" },
    });

    const jornadas = await prisma.jornadaLaboral.findMany({
      where: {
        userId: { in: tecnicos.map((t) => t.id) },
        // Jornadas que tocan el día: empezaron en el día, o siguen abiertas
        OR: [{ inicio: { gte: start, lt: end } }, { fin: null }],
      },
      orderBy: { inicio: "asc" },
    });

    const porUsuario = new Map<string, typeof jornadas>();
    for (const j of jornadas) {
      const arr = porUsuario.get(j.userId) || [];
      arr.push(j);
      porUsuario.set(j.userId, arr);
    }

    payload.todos = tecnicos.map((t) => {
      const js = porUsuario.get(t.id) || [];
      const abierta = js.find((j) => j.fin === null) || null;
      const delDia = js.filter((j) => j.inicio >= start && j.inicio < end);
      let minutos = 0;
      for (const j of delDia) {
        const finRef = j.fin ?? new Date();
        minutos += Math.max(0, Math.round((finRef.getTime() - j.inicio.getTime()) / 60000));
      }
      const estado = abierta ? "EN_CAMPO" : delDia.length > 0 ? "FINALIZADO" : "SIN_INICIAR";
      return {
        userId: t.id,
        nombre: t.nombre,
        email: t.email,
        estado,
        inicio: abierta?.inicio ?? delDia[0]?.inicio ?? null,
        ultimaSalida: estado === "FINALIZADO" ? delDia[delDia.length - 1]?.fin ?? null : null,
        minutosTrabajados: minutos,
        jornadas: delDia.length,
      };
    });

    payload.resumen = {
      enCampo: payload.todos.filter((u: { estado: string }) => u.estado === "EN_CAMPO").length,
      finalizado: payload.todos.filter((u: { estado: string }) => u.estado === "FINALIZADO").length,
      sinIniciar: payload.todos.filter((u: { estado: string }) => u.estado === "SIN_INICIAR").length,
      total: payload.todos.length,
    };
  }

  return NextResponse.json(payload);
}

/**
 * POST /api/jornadas — marca ingreso o salida del usuario actual.
 * Body: { accion: "ingreso" | "salida", nota?, lat?, lng? }
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const accion = body.accion;
  const nota = typeof body.nota === "string" && body.nota.trim() ? body.nota.trim() : null;
  const lat = toNum(body.lat);
  const lng = toNum(body.lng);

  const abierta = await prisma.jornadaLaboral.findFirst({
    where: { userId: session.userId, fin: null },
    orderBy: { inicio: "desc" },
  });

  if (accion === "ingreso") {
    if (abierta)
      return NextResponse.json({ error: "Ya tenés una jornada abierta. Marcá la salida primero." }, { status: 409 });
    const jornada = await prisma.jornadaLaboral.create({
      data: { userId: session.userId, notaInicio: nota, latInicio: lat, lngInicio: lng },
    });
    return NextResponse.json({ ok: true, mia: jornada }, { status: 201 });
  }

  if (accion === "salida") {
    if (!abierta)
      return NextResponse.json({ error: "No tenés una jornada abierta." }, { status: 409 });
    await prisma.jornadaLaboral.update({
      where: { id: abierta.id },
      data: { fin: new Date(), notaFin: nota, latFin: lat, lngFin: lng },
    });
    return NextResponse.json({ ok: true, mia: null });
  }

  return NextResponse.json({ error: "Acción inválida (ingreso|salida)" }, { status: 400 });
}
