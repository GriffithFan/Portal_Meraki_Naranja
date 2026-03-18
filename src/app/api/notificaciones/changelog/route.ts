import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { enviarPushYBandeja } from "@/lib/pushNotifications";

/**
 * POST /api/notificaciones/changelog
 * Envía notificación de nuevas funcionalidades a TODOS los usuarios activos.
 * Solo ADMIN puede ejecutarlo.
 *
 * Body: { version: string, novedades: string[] }
 * Ejemplo: { "version": "v2.5", "novedades": ["Búsqueda global en todas las secciones", "Columna de código de predio en Tareas"] }
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  let body: { version?: string; novedades?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { version, novedades } = body;
  if (!version || !novedades || !Array.isArray(novedades) || novedades.length === 0) {
    return NextResponse.json({ error: "Se requiere version y novedades[]" }, { status: 400 });
  }

  // Limitar longitud para seguridad
  const cleanVersion = version.slice(0, 20);
  const cleanNovedades = novedades.slice(0, 10).map((n) => String(n).slice(0, 200));

  const titulo = `🚀 Actualización ${cleanVersion}`;
  const mensaje = cleanNovedades.map((n) => `• ${n}`).join("\n");

  // Obtener todos los usuarios activos
  const usuarios = await prisma.user.findMany({
    where: { activo: true },
    select: { id: true },
  });

  // Enviar push + bandeja a cada usuario
  let enviadas = 0;
  for (const u of usuarios) {
    try {
      await enviarPushYBandeja(u.id, {
        tipo: "CHANGELOG",
        titulo,
        mensaje,
        enlace: "/dashboard/bandeja",
        tag: `changelog-${cleanVersion}`,
      });
      enviadas++;
    } catch {
      // Continuar con el siguiente usuario
    }
  }

  return NextResponse.json({
    success: true,
    enviadas,
    totalUsuarios: usuarios.length,
  });
}
