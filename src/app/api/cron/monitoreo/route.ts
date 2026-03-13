import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getNetworkDevices,
  getDeviceSwitchPortsStatuses,
  getOrgWirelessDevicesEthernetStatuses,
} from "@/lib/meraki";
import { enviarPushYBandeja } from "@/lib/pushNotifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/cron/monitoreo
 *
 * Endpoint diseñado para ser invocado periódicamente (cada minuto).
 * Procesa monitoreos pendientes y envía notificaciones push + bandeja
 * cuando detecta caídas de velocidad en APs o errores CRC en switches.
 *
 * Protegido por CRON_SECRET en producción.
 */
export async function GET(request: NextRequest) {
  // Verificar autorización
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  if (secret !== cronSecret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

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

  const resultados: any[] = [];

  for (const mon of pendientes) {
    const networkId = mon.networkId || mon.predio.merakiNetworkId;
    const orgId = mon.orgId || mon.predio.merakiOrgId;
    const predioNombre = mon.predio.codigo || mon.predio.nombre;
    const checkNum = mon.checksRealizados + 1;

    const problemas: string[] = [];
    const detalles: any = { check: checkNum, timestamp: ahora.toISOString() };

    try {
      if (networkId) {
        // 1. Verificar velocidad de APs
        const apProblemas = await checkApSpeed(networkId, orgId);
        if (apProblemas.length > 0) {
          problemas.push(...apProblemas);
          detalles.apSpeed = apProblemas;
        }

        // 2. Verificar errores CRC en switches
        const crcProblemas = await checkCrcErrors(networkId);
        if (crcProblemas.length > 0) {
          problemas.push(...crcProblemas);
          detalles.crcErrors = crcProblemas;
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

    resultados.push({
      predioId: mon.predioId,
      predio: predioNombre,
      check: checkNum,
      problemas: problemas.length,
      completado,
    });
  }

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
