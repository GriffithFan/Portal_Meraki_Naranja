import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getOrganizations,
  getNetworks,
  getNetworkDevices,
  getOrganizationDevicesStatuses,
  getOrgWirelessDevicesEthernetStatuses,
} from "@/lib/meraki";
import { enviarPushYBandeja } from "@/lib/pushNotifications";
import { verifyCronAuth } from "@/lib/cronAuth";

/* eslint-disable @typescript-eslint/no-explicit-any */

type APInfo = {
  name: string;
  model: string;
  serial: string;
  status: string;
  wiredSpeed: string;
  powerMode: string | null;
  isMeshRepeater: boolean;
};

/**
 * GET /api/cron/monitoreo
 *
 * Invocado cada minuto. Busca la red Meraki usando el código del predio
 * (como haría un técnico), obtiene el estado real de los APs:
 * status (online/offline/alerting), velocidad, low power mode, mesh repeater.
 *
 * Protegido por CRON_SECRET (Bearer token, timing-safe).
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const ahora = new Date();

  const pendientes = await prisma.monitoreoPostCambio.findMany({
    where: {
      completado: false,
      proximoCheck: { lte: ahora },
    },
    include: {
      predio: { select: { nombre: true, codigo: true, merakiNetworkId: true, merakiOrgId: true } },
      usuario: { select: { id: true, nombre: true } },
    },
    take: 10,
  });

  if (pendientes.length === 0) {
    return NextResponse.json({ processed: 0, message: "Sin monitoreos pendientes" });
  }

  // ─── Cache global para este ciclo (evita repetir llamadas a la API) ───
  let orgsCache: any[] | null = null;
  const networksCache = new Map<string, any[]>();

  async function getOrgsOnce(): Promise<any[]> {
    if (orgsCache) return orgsCache;
    const envOrgId = process.env.MERAKI_ORG_ID;
    orgsCache = envOrgId ? [{ id: envOrgId, name: "" }] : ((await getOrganizations()) || []) as any[];
    return orgsCache;
  }

  async function getNetworksOnce(orgId: string): Promise<any[]> {
    const cached = networksCache.get(orgId);
    if (cached) return cached;
    const nets = (await getNetworks(orgId)) as any[];
    networksCache.set(orgId, nets);
    return nets;
  }

  // ─── Buscar red Meraki por código de predio ───────────────────────────
  async function buscarRedPorPredio(
    predio: { codigo: string | null; nombre: string | null; merakiNetworkId: string | null; merakiOrgId: string | null }
  ): Promise<{ networkId: string; orgId: string; networkName: string } | null> {
    // Fast path: predio ya tiene networkId guardado
    if (predio.merakiNetworkId && predio.merakiOrgId) {
      return { networkId: predio.merakiNetworkId, orgId: predio.merakiOrgId, networkName: predio.nombre || "" };
    }

    const codigo = predio.codigo || "";
    const nombre = predio.nombre || "";
    if (!codigo && !nombre) return null;

    const allOrgs = await getOrgsOnce();
    const lower = codigo.toLowerCase();

    // Buscar en todas las orgs una red cuyo nombre contenga el código del predio
    for (const org of allOrgs) {
      const nets = await getNetworksOnce(org.id);
      const match = nets.find((n: any) => (n.name || "").toLowerCase().includes(lower));
      if (match) return { networkId: match.id, orgId: org.id, networkName: match.name };
    }

    // Fallback: buscar por nombre del predio si difiere del código
    if (nombre && nombre !== codigo) {
      const lowerNombre = nombre.toLowerCase();
      for (const org of allOrgs) {
        const nets = await getNetworksOnce(org.id);
        const match = nets.find((n: any) => (n.name || "").toLowerCase().includes(lowerNombre));
        if (match) return { networkId: match.id, orgId: org.id, networkName: match.name };
      }
    }

    return null;
  }

  // ─── Obtener estado detallado de APs ──────────────────────────────────
  async function obtenerEstadoAPs(networkId: string, orgId: string): Promise<{ aps: APInfo[]; problemas: string[] }> {
    const problemas: string[] = [];

    const devices = await getNetworkDevices(networkId);
    const aps = ((devices || []) as any[]).filter((d: any) => d.model?.startsWith("MR"));

    if (aps.length === 0) return { aps: [], problemas: ["No se encontraron APs en la red"] };

    // Consultar statuses y ethernet en paralelo
    const [statusesRes, ethRes] = await Promise.allSettled([
      getOrganizationDevicesStatuses(orgId, { "networkIds[]": networkId }),
      getOrgWirelessDevicesEthernetStatuses(orgId, { "networkIds[]": networkId }),
    ]);

    const statuses: any[] = statusesRes.status === "fulfilled" ? ((statusesRes.value || []) as any[]) : [];
    const ethStatuses: any[] = ethRes.status === "fulfilled" ? ((ethRes.value || []) as any[]) : [];

    const statusMap = new Map(statuses.map((s: any) => [s.serial, s]));
    const ethMap = new Map(ethStatuses.map((s: any) => [s.serial, s]));

    const apInfos: APInfo[] = aps.map((ap: any) => {
      const devStatus = statusMap.get(ap.serial);
      const ethSt = ethMap.get(ap.serial);
      const ethPort = ethSt?.ports?.[0];

      // Status color (online/offline/alerting/dormant)
      const status: string = devStatus?.status || ap.status || "unknown";

      // Velocidad Ethernet
      const speedRaw = ethPort?.linkNegotiation?.speed ?? ethPort?.speed ?? ethSt?.speed;
      let wiredSpeed = "—";
      if (speedRaw) {
        wiredSpeed = typeof speedRaw === "number"
          ? `${speedRaw} Mbps`
          : String(speedRaw).includes("Mbps") ? String(speedRaw) : `${speedRaw} Mbps`;
      }

      // Power mode
      const powerMode: string | null = ethSt?.power?.mode || null;

      // Mesh repeater (simplificado: si tiene entrada ethernet pero sin velocidad = sin cable)
      const hasActiveEth = !!speedRaw;
      const isMeshRepeater = !hasActiveEth && !!ethSt && !speedRaw;

      // Detectar problemas
      if (status === "offline" || status === "alerting") {
        problemas.push(`AP "${ap.name || ap.serial}" está ${status === "offline" ? "⛔ offline" : "⚠️ alerting"}`);
      }
      if (speedRaw && typeof speedRaw === "number" && speedRaw < 1000) {
        problemas.push(`AP "${ap.name || ap.serial}" a ${speedRaw} Mbps (esperado: 1000)`);
      }
      if (powerMode === "low") {
        problemas.push(`AP "${ap.name || ap.serial}" en Low Power Mode`);
      }
      if (isMeshRepeater) {
        problemas.push(`AP "${ap.name || ap.serial}" es Mesh Repeater (sin cable)`);
      }

      return { name: ap.name || ap.serial, model: ap.model, serial: ap.serial, status, wiredSpeed, powerMode, isMeshRepeater };
    });

    return { aps: apInfos, problemas };
  }

  // ─── Procesar cada monitoreo ──────────────────────────────────────────
  const procesarMonitoreo = async (mon: typeof pendientes[number]) => {
    const predioLabel = mon.predio.codigo || mon.predio.nombre || mon.predioId;
    const checkNum = mon.checksRealizados + 1;
    const detalles: any = { check: checkNum, timestamp: ahora.toISOString() };

    // Solo notificar a los técnicos asignados al predio
    const asignaciones = await prisma.asignacion.findMany({
      where: { predioId: mon.predioId },
      select: { userId: true },
    });
    const destinatarios = asignaciones.map(a => a.userId);

    let titulo: string;
    let mensaje: string;
    let tipo: string;

    // 1. Buscar la red por código de predio (como haría un técnico)
    const red = await buscarRedPorPredio(mon.predio);

    if (!red) {
      tipo = "ALERTA_MONITOREO";
      titulo = `Monitoreo: ${predioLabel}`;
      mensaje = `Check ${checkNum}/2 — No se encontró red Meraki para "${predioLabel}". Verificar configuración.`;
      detalles.sinRed = true;
    } else {
      try {
        detalles.networkId = red.networkId;
        detalles.networkName = red.networkName;

        const { aps, problemas } = await obtenerEstadoAPs(red.networkId, red.orgId);
        detalles.aps = aps;
        detalles.problemas = problemas;

        // Armar mensaje con detalle de cada AP
        const apLines = aps.map(ap => {
          const parts = [ap.status];
          if (ap.wiredSpeed !== "—") parts.push(ap.wiredSpeed);
          if (ap.powerMode === "low") parts.push("Low Power");
          if (ap.isMeshRepeater) parts.push("Mesh");
          return `${ap.name} (${ap.model}): ${parts.join(", ")}`;
        });

        const apBlock = apLines.length > 0 ? apLines.join("\n") : "Sin APs";

        if (problemas.length > 0) {
          tipo = "ALERTA_MONITOREO";
          titulo = `Alerta: ${predioLabel}`;
          mensaje = `Check ${checkNum}/2 — Red: ${red.networkName}\n${apBlock}\n\n${problemas.length} problema(s)`;
        } else {
          tipo = "MONITOREO_OK";
          titulo = `Sin alertas: ${predioLabel}`;
          mensaje = `Check ${checkNum}/2 — Red: ${red.networkName}\n${apBlock}\n\nTodo OK. ${mon.estadoAnterior} → ${mon.estadoNuevo}`;
        }
      } catch (err) {
        console.error(`[Monitoreo] Error Meraki para ${predioLabel}:`, err);
        tipo = "ALERTA_MONITOREO";
        titulo = `Monitoreo: ${predioLabel}`;
        mensaje = `Check ${checkNum}/2 — Error consultando Meraki: ${err instanceof Error ? err.message : "Error desconocido"}`;
        detalles.error = err instanceof Error ? err.message : "Error desconocido";
      }
    }

    // Notificar a TODOS
    for (const uid of destinatarios) {
      await enviarPushYBandeja(uid, {
        tipo,
        titulo,
        mensaje,
        enlace: `/dashboard/bandeja`,
        entidad: "PREDIO",
        entidadId: mon.predioId,
        tag: `monitoreo-${mon.predioId}-${checkNum}`,
      });
    }

    // Actualizar registro
    const completado = checkNum >= mon.maxChecks;
    const proximoCheck = completado
      ? ahora
      : new Date(ahora.getTime() + mon.intervaloMin * 60 * 1000);

    await prisma.monitoreoPostCambio.update({
      where: { id: mon.id },
      data: {
        checksRealizados: checkNum,
        completado,
        proximoCheck,
        resultados: detalles,
      },
    });

    return { predioId: mon.predioId, predio: predioLabel, check: checkNum, problemas: detalles.problemas?.length || 0, completado, redEncontrada: !!red };
  };

  // Procesar secuencialmente para respetar rate limits de Meraki
  const resultados: any[] = [];
  for (const mon of pendientes) {
    try {
      resultados.push(await procesarMonitoreo(mon));
    } catch (err) {
      console.error(`[Monitoreo] Error procesando ${mon.id}:`, err);
      resultados.push({ id: mon.id, error: err instanceof Error ? err.message : "Error" });
    }
  }

  return NextResponse.json({ processed: resultados.length, resultados });
}
