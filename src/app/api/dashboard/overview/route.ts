import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import {
  getOrganizationDevicesStatuses,
  getNetworks,
} from "@/lib/meraki";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const orgId = process.env.MERAKI_ORG_ID;
  const isAdminOrMod = isModOrAdmin(session.rol);

  /* ── Consultas BD (todas las roles) ─────────────────── */
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dbQueries: Record<string, Promise<unknown>> = {
    prediosTotal: prisma.predio.count(),
    prediosConRed: prisma.predio.count({
      where: { merakiNetworkId: { not: null } },
    }),
    tareasHoy: prisma.tareaCalendario.count({
      where: {
        fecha: { gte: today, lt: new Date(today.getTime() + 86400000) },
        completada: false,
      },
    }),
    tareasPendientes: prisma.tareaCalendario.count({
      where: { completada: false },
    }),
    actividadReciente: prisma.actividad.findMany({
      include: {
        usuario: { select: { nombre: true, rol: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    notificacionesSinLeer: prisma.notificacion.count({
      where: { userId: session.userId, leida: false },
    }),
  };

  /* Solo admin/mod ven datos de usuarios y stock global */
  if (isAdminOrMod) {
    dbQueries.usuariosActivos = prisma.user.count({
      where: { activo: true },
    });
    dbQueries.equiposStock = prisma.equipo.count({
      where: { estado: "DISPONIBLE" },
    });
    dbQueries.equiposAsignados = prisma.equipo.count({
      where: { estado: "ASIGNADO" },
    });
  }

  /* Tareas propias para técnicos */
  if (!isAdminOrMod) {
    dbQueries.misTareasPendientes = prisma.tareaCalendario.count({
      where: {
        asignadoId: session.userId,
        completada: false,
      },
    });
  }

  /* ── Consultas Meraki (org-level) ───────────────────── */
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let merakiData: any = null;

  if (orgId) {
    try {
      const [deviceStatuses, networks] = await Promise.all([
        getOrganizationDevicesStatuses(orgId),
        getNetworks(orgId),
      ]);

      const devices = Array.isArray(deviceStatuses) ? deviceStatuses : [];
      const networkCount = Array.isArray(networks) ? networks.length : 0;

      const statusCounts = { online: 0, offline: 0, alerting: 0, dormant: 0 };
      const byModel: Record<string, { total: number; online: number }> = {};

      let switchesOnline = 0;
      let switchesTotal = 0;
      let apsOnline = 0;
      let apsTotal = 0;
      let appliancesOnline = 0;
      let appliancesTotal = 0;

      for (const d of devices) {
        const st = (d.status || "offline").toLowerCase();
        if (st in statusCounts)
          statusCounts[st as keyof typeof statusCounts]++;

        const model = (d.model || "unknown") as string;
        if (!byModel[model]) byModel[model] = { total: 0, online: 0 };
        byModel[model].total++;
        if (st === "online") byModel[model].online++;

        // Classify by product type
        const product = (d.productType || "").toLowerCase();
        if (product === "switch" || model.startsWith("MS")) {
          switchesTotal++;
          if (st === "online") switchesOnline++;
        } else if (
          product === "wireless" ||
          model.startsWith("MR") ||
          model.startsWith("CW")
        ) {
          apsTotal++;
          if (st === "online") apsOnline++;
        } else if (product === "appliance" || model.startsWith("MX") || model.startsWith("Z")) {
          appliancesTotal++;
          if (st === "online") appliancesOnline++;
        }
      }

      merakiData = {
        totalDevices: devices.length,
        statusCounts,
        switches: { total: switchesTotal, online: switchesOnline },
        aps: { total: apsTotal, online: apsOnline },
        appliances: { total: appliancesTotal, online: appliancesOnline },
        networkCount,
      };
    } catch (err) {
      console.error("[dashboard/overview] Error Meraki:", err);
    }
  }

  /* ── Resolver promesas BD ───────────────────────────── */
  const keys = Object.keys(dbQueries);
  const values = await Promise.all(Object.values(dbQueries));
  const dbResults: Record<string, unknown> = {};
  keys.forEach((k, i) => {
    dbResults[k] = values[i];
  });

  return NextResponse.json({
    rol: session.rol,
    nombre: session.nombre,
    meraki: merakiData,
    ...dbResults,
  });
}
