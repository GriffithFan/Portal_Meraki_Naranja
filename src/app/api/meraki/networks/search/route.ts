import { NextRequest, NextResponse } from "next/server";
import {
  getOrganizations,
  getNetworks,
  getNetworkInfo,
  getDevice,
  getOrganizationDevices,
} from "@/lib/meraki";
import { getFromCache, setInCache } from "@/lib/merakiCache";
import { prisma } from "@/lib/prisma";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SERIAL_REGEX = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;
const MAC_COLON_REGEX = /^([0-9a-f]{2}[:\-]){5}[0-9a-f]{2}$/i;
const MAC_RAW_REGEX = /^[0-9a-f]{12}$/i;

/** Busca redes en una organización (con cache) */
async function searchInOrg(org: { id: string; name: string }, lower: string): Promise<any[]> {
  try {
    const cached = getFromCache<unknown[]>("networksByOrg", org.id);
    const nets = cached ?? (await getNetworks(org.id));
    if (!cached) setInCache("networksByOrg", org.id, nets);

    return (nets as any[])
      .filter((n) =>
        `${n.name} ${n.id} ${n.productTypes?.join(" ")} ${n.tags?.join(" ")}`
          .toLowerCase()
          .includes(lower)
      )
      .map((n) => ({ ...n, orgId: org.id, orgName: org.name }));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim()?.slice(0, 100) ?? "";
    if (!q) return NextResponse.json([]);

    const lower = q.toLowerCase();

    // Fast path 0a: Serial Meraki (XXXX-XXXX-XXXX)
    if (SERIAL_REGEX.test(q)) {
      try {
        const device = await getDevice(q.toUpperCase());
        if (device?.networkId) {
          const predio = await prisma.predio.findFirst({ where: { merakiNetworkId: device.networkId } });
          return NextResponse.json([{
            id: device.networkId, name: predio?.merakiNetworkName || device.name || q, organizationId: device.organizationId,
            orgId: device.organizationId, orgName: "", predioCode: predio?.codigo || "", source: "serial",
          }]);
        }
      } catch { /* serial no encontrado, continuar */ }
      return NextResponse.json([]);
    }

    // Fast path 0b: MAC address
    const isMac = MAC_COLON_REGEX.test(q) || MAC_RAW_REGEX.test(q);
    if (isMac) {
      const cleanMac = q.replace(/[:\-]/g, "").toLowerCase();
      const normalizedMac = (cleanMac.match(/.{2}/g) as string[]).join(":");
      try {
        const orgIdEnv = process.env.MERAKI_ORG_ID;
        const macOrgs: any[] = orgIdEnv ? [{ id: orgIdEnv, name: "" }] : await getOrganizations();
        const results = await Promise.allSettled(
          macOrgs.map((org: any) => getOrganizationDevices(org.id, { mac: normalizedMac }).then((devices: any[]) => ({ org, devices })))
        );
        for (const r of results) {
          if (r.status !== "fulfilled") continue;
          const { org, devices } = r.value;
          if (devices?.length > 0) {
            const dev = devices[0];
            const predio = await prisma.predio.findFirst({ where: { merakiNetworkId: dev.networkId } });
            return NextResponse.json([{
              id: dev.networkId, name: predio?.merakiNetworkName || dev.name || normalizedMac,
              organizationId: org.id, orgId: org.id, orgName: org.name || "", predioCode: predio?.codigo || "", source: "mac",
            }]);
          }
        }
      } catch { /* error MAC search */ }
      return NextResponse.json([]);
    }

    // Fast path 1: DB predios lookup (instantáneo, ~1ms)
    try {
      // Try startsWith first (exact prefix match, higher relevance)
      const dbResults = await prisma.predio.findMany({
        where: {
          OR: [
            { codigo: { startsWith: q, mode: "insensitive" } },
            { nombre: { startsWith: q, mode: "insensitive" } },
          ],
        },
        take: 20,
        orderBy: { codigo: "asc" },
      });

      // If not enough results, fallback to contains
      if (dbResults.length < 5) {
        const moreResults = await prisma.predio.findMany({
          where: {
            OR: [
              { codigo: { contains: q, mode: "insensitive" } },
              { nombre: { contains: q, mode: "insensitive" } },
              { merakiNetworkId: { contains: q, mode: "insensitive" } },
            ],
          },
          take: 20,
          orderBy: { codigo: "asc" },
        });
        const seenIds = new Set(dbResults.map((p) => p.id));
        for (const r of moreResults) {
          if (!seenIds.has(r.id)) {
            dbResults.push(r);
            seenIds.add(r.id);
          }
          if (dbResults.length >= 20) break;
        }
      }

      if (dbResults.length > 0) {
        // Obtener nombres de orgs en cache, o cargar si no hay
        let orgCache = getFromCache<any[]>("organizations", "all");
        if (!orgCache) {
          try {
            orgCache = await getOrganizations();
            setInCache("organizations", "all", orgCache, 600_000);
          } catch (e) { console.error("[Search] getOrganizations():", e); orgCache = []; }
        }
        const orgMap = new Map((orgCache || []).map((o: any) => [o.id, o.name]));

        const mapped = dbResults
          .filter((p) => p.merakiNetworkId)
          .map((p) => ({
            id: p.merakiNetworkId,
            name: p.merakiNetworkName || p.nombre || p.codigo,
            organizationId: p.merakiOrgId,
            orgId: p.merakiOrgId,
            orgName: orgMap.get(p.merakiOrgId || "") || "",
            predioCode: p.codigo,
            source: "db",
          }));

        if (mapped.length > 0) return NextResponse.json(mapped);
      }
    } catch (e) { console.error("[Search] DB query failed:", e); /* fallback to API */ }

    // Fast path 2: network ID directo
    if (/^L_\d+$/.test(q)) {
      const cached = getFromCache<unknown>("networkById", q);
      if (cached) return NextResponse.json([cached]);
      try {
        const net = await getNetworkInfo(q);
        setInCache("networkById", q, net);
        return NextResponse.json([net]);
      } catch (e) { console.error(`[Search] getNetworkInfo(${q}):`, e); /* continuar búsqueda */ }
    }

    const orgId = process.env.MERAKI_ORG_ID;
    let orgs: any[] = [];
    if (orgId) {
      orgs = [{ id: orgId, name: "" }];
    } else {
      const cachedOrgs = getFromCache<any[]>("organizations", "all");
      if (cachedOrgs) {
        orgs = cachedOrgs;
      } else {
        orgs = await getOrganizations();
        setInCache("organizations", "all", orgs, 600_000); // 10 min cache
      }
    }

    // Buscar en TODAS las organizaciones en paralelo (no secuencial)
    const allResults = await Promise.all(
      orgs.map((org) => searchInOrg(org, lower))
    );
    const results = allResults.flat();

    return NextResponse.json(results.slice(0, 20));
  } catch (error) {
    console.error("[meraki/search]", error);
    return NextResponse.json({ error: "Error buscando redes" }, { status: 500 });
  }
}
