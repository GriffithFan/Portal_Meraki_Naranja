import { prisma } from "@/lib/prisma";
import { enviarPushYBandeja } from "@/lib/pushNotifications";

/**
 * Avisa a todos los administradores activos de un fallo del sistema
 * (enriquecimiento, crons, extractor, conversiones, etc.).
 *
 * Incluye anti-spam: si ya se avisó lo mismo (mismo `tag`) en la última hora,
 * no repite. Es fire-and-forget: nunca lanza (un fallo al avisar no debe tumbar
 * el flujo que lo llamó).
 */
export async function avisarAdminsFallo(opts: {
  titulo: string;
  mensaje: string;
  enlace?: string;
  /** Clave de dedupe. Fallos con el mismo tag no se repiten dentro de 1 hora. */
  tag?: string;
  /** Ventana de dedupe en minutos (default 60). */
  dedupeMinutos?: number;
}): Promise<void> {
  try {
    const tag = opts.tag || opts.titulo;
    const ventanaMin = opts.dedupeMinutos ?? 60;
    const desde = new Date(Date.now() - ventanaMin * 60 * 1000);

    // Dedupe: ¿ya se generó una notificación de este fallo hace poco?
    const yaAvisado = await prisma.notificacion.findFirst({
      where: {
        tipo: "SISTEMA_FALLO",
        entidad: "SISTEMA_FALLO",
        entidadId: tag,
        createdAt: { gte: desde },
      },
      select: { id: true },
    });
    if (yaAvisado) return;

    const admins = await prisma.user.findMany({
      where: { rol: "ADMIN", activo: true },
      select: { id: true },
    });
    if (admins.length === 0) return;

    await Promise.allSettled(
      admins.map((a) =>
        enviarPushYBandeja(a.id, {
          tipo: "SISTEMA_FALLO",
          titulo: opts.titulo,
          mensaje: opts.mensaje,
          enlace: opts.enlace || "/dashboard",
          entidad: "SISTEMA_FALLO",
          entidadId: tag,
          tag: `fallo-${tag}`,
        })
      )
    );
  } catch (e) {
    console.error("[alertasAdmin] no se pudo avisar del fallo:", (e as Error).message);
  }
}
