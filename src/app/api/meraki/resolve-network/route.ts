import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getNetworkInfo, getDevice, getOrganizationDevices, getOrganizations } from "@/lib/meraki";
import { getFromCache, setInCache } from "@/lib/merakiCache";
import { getSession } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SERIAL_REGEX = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;
const MAC_COLON_REGEX = /^([0-9a-f]{2}[:\-]){5}[0-9a-f]{2}$/i;
const MAC_RAW_REGEX = /^[0-9a-f]{12}$/i;

/**
 * GET /api/meraki/resolve-network?q=460855
 *
 * Resolución rápida de predio → network usando la DB local como índice.
 * Cascada de prioridad:
 *   1. DB (por codigo O merakiNetworkId) → ~1ms
 *   2. Network ID directo (L_xxx) → API call
 *   3. 404
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const q = request.nextUrl.searchParams.get("q")?.trim()?.slice(0, 100) ?? "";
    if (!q) return NextResponse.json({ error: "Parámetro q requerido" }, { status: 400 });

    // ── Paso 1.5: Detectar serial Meraki (XXXX-XXXX-XXXX) ──
    if (SERIAL_REGEX.test(q)) {
      const serialUpper = q.toUpperCase();
      try {
        const device = await getDevice(serialUpper);
        if (device?.networkId) {
          const predio = await prisma.predio.findFirst({ where: { merakiNetworkId: device.networkId } });
          let networkInfo: any = getFromCache("networkById", device.networkId);
          if (!networkInfo) {
            try { networkInfo = await getNetworkInfo(device.networkId); setInCache("networkById", device.networkId, networkInfo); } catch { /* */ }
          }
          return NextResponse.json({
            source: "serial-direct",
            predio: predio ? { codigo: predio.codigo, nombre: predio.nombre, networkId: predio.merakiNetworkId, orgId: predio.merakiOrgId, region: predio.seccion } : null,
            network: networkInfo || { id: device.networkId, name: device.name || serialUpper, organizationId: device.organizationId },
          });
        }
      } catch { /* serial no encontrado */ }
      return NextResponse.json({ error: `Serial ${serialUpper} no encontrado. Verifica que el dispositivo esté activo en Meraki Dashboard.`, type: "serial_not_found" }, { status: 404 });
    }

    // ── Paso 1.6: Detectar MAC address ──
    const isMac = MAC_COLON_REGEX.test(q) || MAC_RAW_REGEX.test(q);
    if (isMac) {
      const cleanMac = q.replace(/[:\-]/g, "").toLowerCase();
      const normalizedMac = (cleanMac.match(/.{2}/g) as string[]).join(":");
      try {
        const orgIdEnv = process.env.MERAKI_ORG_ID;
        const macOrgs: any[] = orgIdEnv ? [{ id: orgIdEnv, name: "" }] : await getOrganizations();
        const macResults = await Promise.allSettled(
          macOrgs.map((org: any) => getOrganizationDevices(org.id, { mac: normalizedMac }).then((devices: any[]) => ({ org, devices })))
        );
        for (const result of macResults) {
          if (result.status !== "fulfilled") continue;
          const { org, devices } = result.value;
          if (devices?.length > 0) {
            const device = devices[0];
            const predio = await prisma.predio.findFirst({ where: { merakiNetworkId: device.networkId } });
            let networkInfo: any = getFromCache("networkById", device.networkId);
            if (!networkInfo) {
              try { networkInfo = await getNetworkInfo(device.networkId); setInCache("networkById", device.networkId, networkInfo); } catch { /* */ }
            }
            return NextResponse.json({
              source: "mac-search",
              predio: predio ? { codigo: predio.codigo, nombre: predio.nombre, networkId: predio.merakiNetworkId, orgId: predio.merakiOrgId, region: predio.seccion } : null,
              network: networkInfo || { id: device.networkId, name: device.name || normalizedMac, organizationId: org.id },
            });
          }
        }
      } catch { /* error buscando por MAC */ }
      return NextResponse.json({ error: `Dispositivo con MAC ${normalizedMac} no encontrado` }, { status: 404 });
    }

    // 1. Buscar en DB por código de predio O por networkId
    const predio = await prisma.predio.findFirst({
      where: {
        OR: [
          { codigo: q },
          { merakiNetworkId: q },
          { nombre: q },
        ],
      },
    });

    if (predio?.merakiNetworkId) {
      // Intentar obtener info completa de la red desde cache o API
      let networkInfo: any = getFromCache("networkById", predio.merakiNetworkId);
      if (!networkInfo) {
        try {
          networkInfo = await getNetworkInfo(predio.merakiNetworkId);
          setInCache("networkById", predio.merakiNetworkId, networkInfo);
        } catch {
          // API puede fallar, retornamos lo que tenemos de la DB
        }
      }

      return NextResponse.json({
        source: "db-instant",
        predio: {
          codigo: predio.codigo,
          nombre: predio.nombre,
          networkId: predio.merakiNetworkId,
          orgId: predio.merakiOrgId,
          region: predio.seccion,
        },
        network: networkInfo || {
          id: predio.merakiNetworkId,
          name: predio.merakiNetworkName || predio.nombre,
          organizationId: predio.merakiOrgId,
        },
      });
    }

    // 2. Si parece un network ID, intentar directo con la API
    if (/^[LN]_\d+$/.test(q)) {
      const cached = getFromCache<any>("networkById", q);
      if (cached) {
        return NextResponse.json({ source: "cache", network: cached });
      }
      try {
        const net = await getNetworkInfo(q);
        setInCache("networkById", q, net);
        return NextResponse.json({ source: "api", network: net });
      } catch {
        return NextResponse.json({ error: "Red no encontrada" }, { status: 404 });
      }
    }

    return NextResponse.json({ error: "Predio no encontrado" }, { status: 404 });
  } catch (error) {
    console.error("[resolve-network]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
