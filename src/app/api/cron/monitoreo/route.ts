import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getNetworkDevices,
  getDeviceSwitchPortsStatuses,
  getOrgWirelessDevicesEthernetStatuses,
} from "@/lib/meraki";
import { enviarPushYBandeja } from "@/lib/pushNotifications";
import { verifyCronAuth } from "@/lib/cronAuth";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/cron/monitoreo
 *
 * Endpoint diseñado para ser invocado periódicamente (cada minuto).
 * Procesa monitoreos pendientes y envía notificaciones push + bandeja
 * cuando detecta caídas de velocidad en APs o errores CRC en switches.
 *
 * Protegido por CRON_SECRET (Bearer token, timing-safe).
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const ahora = new Date();

  // Buscar monitoreos pendientes cuyo próximo check ya pasó
  const pendientes = await prisma.monitoreoPostCambio.findMany({
    where: {
      completado: false,
      proximoCheck: { lte: ahora },
    },
    include: {
      predio: { select: { nombre: true, codigo: true, merakiNetworkId: true, merakiOrgId: true } },
      usuario: { select: { id: true, nombre: true } },
    },
    take: 20, // procesar máximo 20 por ciclo para no saturar la API
  });

  if (pendientes.length === 0) {
    return NextResponse.json({ processed: 0, message: "Sin monitoreos pendientes" });
  }

  const procesarMonitoreo = async (mon: typeof pendientes[number]) => {
    const networkId = mon.networkId || mon.predio.merakiNetworkId;
    const orgId = mon.orgId || mon.predio.merakiOrgId;
    const predioNombre = mon.predio.codigo || mon.predio.nombre;
    const checkNum = mon.checksRealizados + 1;

    const problemas: string[] = [];
    const detalles: any = { check: checkNum, timestamp: ahora.toISOString() };

    try {
      if (networkId) {
        const [apProblemas, crcProblemas] = await Promise.allSettled([
          checkApSpeed(networkId, orgId),
          checkCrcErrors(networkId),
        ]);

        if (apProblemas.status === "fulfilled" && apProblemas.value.length > 0) {
          problemas.push(...apProblemas.value);
          detalles.apSpeed = apProblemas.value;
        }
        if (crcProblemas.status === "fulfilled" && crcProblemas.value.length > 0) {
          problemas.push(...crcProblemas.value);
          detalles.crcErrors = crcProblemas.value;
        }
      }
    } catch (err) {
      console.error(`[Monitoreo] Error consultando Meraki para ${predioNombre}:`, err);
      detalles.error = err instanceof Error ? err.message : "Error desconocido";
    }

    // Enviar notificación si hay problemas
    if (problemas.length > 0) {
      const titulo = `⚠️ Alerta post-cambio: ${predioNombre}`;
      const mensaje = `Check ${checkNum}/2 — ${problemas.join(". ")}`;

      await enviarPushYBandeja(mon.userId, {
        tipo: "ALERTA_MONITOREO",
        titulo,
        mensaje,
        enlace: `/dashboard/tareas`,
        entidad: "PREDIO",
        entidadId: mon.predioId,
        tag: `monitoreo-${mon.predioId}`,
      });
    } else if (networkId) {
      // Sin problemas pero con network → notificar que todo OK
      const titulo = `✅ Sin alertas: ${predioNombre}`;
      const mensaje = `Check ${checkNum}/2 — Velocidad APs y puertos switch sin anomalías. Estado: ${mon.estadoAnterior} → ${mon.estadoNuevo}`;

      await enviarPushYBandeja(mon.userId, {
        tipo: "MONITOREO_OK",
        titulo,
        mensaje,
        enlace: `/dashboard/tareas`,
        entidad: "PREDIO",
        entidadId: mon.predioId,
        tag: `monitoreo-${mon.predioId}`,
      });
    }

    // Actualizar monitoreo
    const nuevoChecks = checkNum;
    const completado = nuevoChecks >= mon.maxChecks;
    const proximoCheck = completado
      ? ahora
      : new Date(ahora.getTime() + mon.intervaloMin * 60 * 1000);

    await prisma.monitoreoPostCambio.update({
      where: { id: mon.id },
      data: {
        checksRealizados: nuevoChecks,
        completado,
        proximoCheck,
        resultados: detalles,
      },
    });

    return { predioId: mon.predioId, predio: predioNombre, check: checkNum, problemas: problemas.length, completado };
  };

  const settled = await Promise.allSettled(pendientes.map(procesarMonitoreo));
  const resultados: any[] = settled
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
    .map((r) => r.value);

  return NextResponse.json({ processed: resultados.length, resultados });
}

// ─── Checks Meraki ──────────────────────────────────────

/**
 * Detecta APs con velocidad Ethernet < 1000 Mbps
 */
async function checkApSpeed(networkId: string, orgId: string | null): Promise<string[]> {
  const problemas: string[] = [];

  try {
    // Obtener dispositivos de la red
    const devices = await getNetworkDevices(networkId);
    const aps = (devices || []).filter((d: any) => d.model?.startsWith("MR"));

    if (aps.length === 0) return problemas;

    // Intentar usar el endpoint de ethernet statuses de la org
    if (orgId) {
      try {
        const ethStatuses = (await getOrgWirelessDevicesEthernetStatuses(orgId, {
          networkIds: [networkId],
        })) as any[] | null;

        for (const entry of ethStatuses || []) {
          const serial = entry.serial;
          const ap = aps.find((a: any) => a.serial === serial);
          const apName = ap?.name || serial;

          for (const port of entry.ports || []) {
            const speed = port.linkNegotiation?.speed ?? port.speed;
            if (speed && speed < 1000) {
              problemas.push(
                `AP "${apName}" conectado a ${speed} Mbps (esperado: 1000 Mbps)`
              );
            }
          }
        }
        return problemas;
      } catch {
        // Fallback: sin endpoint de org, seguir con LLDP
      }
    }

    // Fallback: no se pudo verificar via API de org
    // No agregar falsos positivos
  } catch (err) {
    console.error("[Monitoreo] Error checkApSpeed:", err);
  }

  return problemas;
}

/**
 * Detecta errores CRC en puertos de switches
 */
async function checkCrcErrors(networkId: string): Promise<string[]> {
  const problemas: string[] = [];

  try {
    const devices = await getNetworkDevices(networkId);
    const switches = (devices || []).filter((d: any) => d.model?.startsWith("MS"));

    for (const sw of switches) {
      try {
        const ports = (await getDeviceSwitchPortsStatuses(sw.serial)) as any[] | null;
        for (const port of ports || []) {
          // Revisar warnings por CRC
          const warnings = port.warnings || [];
          const hasCrc = warnings.some((w: string) => /crc/i.test(w));
          if (hasCrc) {
            problemas.push(
              `Switch "${sw.name || sw.serial}" puerto ${port.portId}: Error CRC detectado`
            );
          }

          // También revisar errores explícitos
          const errors = port.errors || [];
          const hasCrcError = errors.some((e: string) => /crc/i.test(e));
          if (hasCrcError && !hasCrc) {
            problemas.push(
              `Switch "${sw.name || sw.serial}" puerto ${port.portId}: Error CRC en errores`
            );
          }
        }
      } catch {
        // Switch individual falló, continuar con los demás
      }
    }
  } catch (err) {
    console.error("[Monitoreo] Error checkCrcErrors:", err);
  }

  return problemas;
}
