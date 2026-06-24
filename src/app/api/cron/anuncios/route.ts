import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enviarPushYBandeja } from "@/lib/pushNotifications";
import { verifyCronAuth } from "@/lib/cronAuth";

/**
 * GET /api/cron/anuncios
 *
 * Invocado periódicamente (cada ~15 min). Para cada anuncio activo con
 * notificar=true que ya cumplió su intervalo, re-envía push a los usuarios
 * de su audiencia (rolesDestino; vacío = todos) que todavía NO lo marcaron
 * como leído. Deja de notificar cuando expira.
 *
 * Protegido por CRON_SECRET (Bearer token, timing-safe).
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const ahora = new Date();

  const candidatos = await prisma.anuncio.findMany({
    where: {
      activo: true,
      notificar: true,
      AND: [
        { OR: [{ fechaPublicacion: null }, { fechaPublicacion: { lte: ahora } }] }, // solo ya publicados
        { OR: [{ fechaExpiracion: null }, { fechaExpiracion: { gt: ahora } }] },
      ],
    },
    select: { id: true, titulo: true, contenido: true, prioridad: true, intervaloHoras: true, ultimaNotificacion: true, rolesDestino: true, usuariosDestino: true, autorId: true },
  });

  // Filtrar los que ya cumplieron el intervalo desde la última notificación
  const pendientes = candidatos.filter((a) => {
    if (!a.ultimaNotificacion) return true;
    const proximo = a.ultimaNotificacion.getTime() + a.intervaloHoras * 3600 * 1000;
    return proximo <= ahora.getTime();
  });

  if (pendientes.length === 0)
    return NextResponse.json({ processed: 0, message: "Sin anuncios pendientes de re-notificar" });

  // Una sola query: todos los usuarios activos con su rol; se filtra por anuncio
  const usuarios = await prisma.user.findMany({
    where: { activo: true },
    select: { id: true, rol: true },
  });

  const resultados: { anuncioId: string; notificados: number }[] = [];

  for (const a of pendientes) {
    const audiencia = usuarios.filter((u) => {
      if (u.id === a.autorId) return false;
      if (a.usuariosDestino.length > 0) return a.usuariosDestino.includes(u.id); // selección manual
      return a.rolesDestino.length === 0 || a.rolesDestino.includes(u.rol);
    });
    const audienciaIds = audiencia.map((u) => u.id);

    // Usuarios de la audiencia que ya leyeron este anuncio
    const lecturas = await prisma.anuncioLectura.findMany({
      where: { anuncioId: a.id, userId: { in: audienciaIds } },
      select: { userId: true },
    });
    const leidoPor = new Set(lecturas.map((l) => l.userId));
    const destinatarios = audienciaIds.filter((id) => !leidoPor.has(id));

    const prioridadLabel = a.prioridad === "URGENTE" ? "🔴 URGENTE — " : a.prioridad === "ALTA" ? "🟠 " : "";
    const mensaje = a.contenido.length > 180 ? a.contenido.slice(0, 177) + "…" : a.contenido;

    await Promise.allSettled(
      destinatarios.map((uid) =>
        enviarPushYBandeja(uid, {
          tipo: "ANUNCIO",
          titulo: `${prioridadLabel}${a.titulo}`,
          mensaje,
          enlace: "/dashboard/anuncios",
          entidad: "ANUNCIO",
          entidadId: a.id,
          tag: `anuncio-${a.id}`,
        })
      )
    );

    await prisma.anuncio.update({ where: { id: a.id }, data: { ultimaNotificacion: ahora } });
    resultados.push({ anuncioId: a.id, notificados: destinatarios.length });
  }

  return NextResponse.json({ processed: resultados.length, resultados });
}
