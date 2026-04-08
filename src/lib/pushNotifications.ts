import webpush from "web-push";
import { prisma } from "@/lib/prisma";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:admin@portalmeraki.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
}

/**
 * Envía push notification a todas las suscripciones de un usuario.
 * Crea también una notificación en bandeja.
 */
export async function enviarPushYBandeja(
  userId: string,
  opts: {
    tipo: string;
    titulo: string;
    mensaje: string;
    enlace?: string;
    entidad?: string;
    entidadId?: string;
    tag?: string;
  }
) {
  // 1. Crear notificación en bandeja
  await prisma.notificacion.create({
    data: {
      tipo: opts.tipo,
      titulo: opts.titulo,
      mensaje: opts.mensaje,
      enlace: opts.enlace,
      entidad: opts.entidad,
      entidadId: opts.entidadId,
      userId,
    },
  });

  // 2. Enviar push a todas las suscripciones del usuario
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("[Push] VAPID keys not configured, skipping push for user", userId);
    return;
  }

  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subs.length === 0) {
    console.info(`[Push] No subscriptions found for user ${userId}`);
    return;
  }

  const payload: PushPayload = {
    title: opts.titulo,
    body: opts.mensaje,
    icon: "/images/icon-192.png",
    badge: "/images/badge-72.png",
    tag: opts.tag || opts.tipo,
    url: opts.enlace || "/dashboard/bandeja",
  };

  const payloadStr = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payloadStr
      )
    )
  );

  // Limpiar suscripciones inválidas (410 Gone, 404, 401/403 bad VAPID)
  const toDelete: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const statusCode = (r.reason as { statusCode?: number })?.statusCode;
      if (statusCode === 410 || statusCode === 404 || statusCode === 401 || statusCode === 403) {
        toDelete.push(subs[i].id);
      } else {
        console.warn(`[Push] Error enviando a ${subs[i].endpoint.slice(0, 60)}...: status=${statusCode}`, (r.reason as Error)?.message);
      }
    }
  });

  if (toDelete.length) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: toDelete } },
    });
  }
}
