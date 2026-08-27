import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronAuth } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";

/** Accesos: 90 días. Es un log de auditoría, no un archivo histórico. */
const DIAS_ACCESOS = 90;
/** Notificaciones ya leídas: 30 días. Nadie vuelve a mirar una notificación de hace un mes. */
const DIAS_NOTIF_LEIDAS = 30;
/** Notificaciones sin leer: 90 días. Si nadie la abrió en tres meses, no la va a abrir. */
const DIAS_NOTIF_SIN_LEER = 90;

/**
 * Cron diario: recorta el historial que crece sin límite.
 *
 * No es por espacio en disco —la base entera pesa 178 MB y el VPS se va a ampliar— sino
 * por velocidad: una tabla más chica se consulta más rápido, y estas dos son las que más
 * crecen con cada persona que se suma. Medido sobre 30 días, cada técnico genera unos
 * 3.200 accesos y 2.760 notificaciones por mes: al pasar de 16 a 40 personas eso es
 * 128.000 y 110.000 filas nuevas por mes.
 *
 * `RegistroAcceso` ya era el 42% de toda la base (74 MB, 142.465 filas) cuando se escribió
 * esto, con 26.463 filas de más de 90 días.
 *
 * Se borra en tandas para no tomar un lock largo sobre una tabla que se escribe todo el
 * tiempo: un DELETE masivo de decenas de miles de filas bloquearía los INSERT de los
 * técnicos que están usando Carrot en ese momento.
 */
const TANDA = 5000;

async function borrarEnTandas(
  borrar: (limite: number) => Promise<number>,
  maxTandas = 40
): Promise<number> {
  let total = 0;
  for (let i = 0; i < maxTandas; i++) {
    const n = await borrar(TANDA);
    total += n;
    if (n < TANDA) break;
  }
  return total;
}

export async function GET(request: NextRequest) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  const dias = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  try {
    const accesos = await borrarEnTandas(async (limite) => {
      const ids = await prisma.registroAcceso.findMany({
        where: { createdAt: { lt: dias(DIAS_ACCESOS) } },
        select: { id: true },
        take: limite,
      });
      if (ids.length === 0) return 0;
      const { count } = await prisma.registroAcceso.deleteMany({ where: { id: { in: ids.map((x) => x.id) } } });
      return count;
    });

    const notifLeidas = await borrarEnTandas(async (limite) => {
      const ids = await prisma.notificacion.findMany({
        where: { leida: true, createdAt: { lt: dias(DIAS_NOTIF_LEIDAS) } },
        select: { id: true },
        take: limite,
      });
      if (ids.length === 0) return 0;
      const { count } = await prisma.notificacion.deleteMany({ where: { id: { in: ids.map((x) => x.id) } } });
      return count;
    });

    const notifViejas = await borrarEnTandas(async (limite) => {
      const ids = await prisma.notificacion.findMany({
        where: { createdAt: { lt: dias(DIAS_NOTIF_SIN_LEER) } },
        select: { id: true },
        take: limite,
      });
      if (ids.length === 0) return 0;
      const { count } = await prisma.notificacion.deleteMany({ where: { id: { in: ids.map((x) => x.id) } } });
      return count;
    });

    const resumen = {
      ok: true,
      accesosBorrados: accesos,
      notificacionesLeidasBorradas: notifLeidas,
      notificacionesViejasBorradas: notifViejas,
      quedan: {
        accesos: await prisma.registroAcceso.count(),
        notificaciones: await prisma.notificacion.count(),
      },
      retencion: { accesos: DIAS_ACCESOS, notificacionesLeidas: DIAS_NOTIF_LEIDAS, notificacionesSinLeer: DIAS_NOTIF_SIN_LEER },
    };
    console.log("[cron purgar-historial]", JSON.stringify(resumen));
    return NextResponse.json(resumen);
  } catch (e) {
    console.error("[cron purgar-historial] error:", (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
