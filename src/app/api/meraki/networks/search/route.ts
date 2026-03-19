import { NextRequest, NextResponse } from "next/server";
import {
  getOrganizations,
  getNetworks,
  getNetworkInfo,
  getDevice,
  getOrganizationDevices,
} from "@/lib/meraki";
import { getFromCache, setInCache, getOrFetch } from "@/lib/merakiCache";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SERIAL_REGEX = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;
const MAC_COLON_REGEX = /^([0-9a-f]{2}[:\-]){5}[0-9a-f]{2}$/i;
const MAC_RAW_REGEX = /^[0-9a-f]{12}$/i;

const NETWORKS_CACHE_TTL = 10 * 60 * 1000; // 10 min — network list changes rarely

/** Busca redes en una organización (con cache + dedup) */
async function searchInOrg(org: { id: string; name: string }, lower: string): Promise<any[]> {
  try {
    const nets = await getOrFetch<unknown[]>(
      "networksByOrg",
      org.id,
      () => getNetworks(org.id),
      NETWORKS_CACHE_TTL,
    );

    return (nets as any[])
      .filter((n) =>
        `${n.name} ${n.id} ${n.productTypes?.join(" ")} ${n.tags?.join(" ")}`
          .toLowerCase()
          .includes(lower)
      )
      .map((n) => ({ ...n, orgId: org.id, orgName: org.name }));
  } catch (err) {
    console.error(`[Search] Org ${org.id} FAILED:`, err instanceof Error ? err.message : err);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

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

    // Estrategia: usar el viejo backend (port 3000) que tiene networks cacheadas
    // para buscar predios sin consumir rate limit de Meraki API
    const OLD_BACKEND = process.env.OLD_BACKEND_URL || "http://localhost:3000";
    try {
      const backendRes = await fetch(
        `${OLD_BACKEND}/api/predios/search?q=${encodeURIComponent(q)}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (backendRes.ok) {
        const data = await backendRes.json();
        const predios = data?.predios || [];
        if (predios.length > 0) {
          // Obtener nombres de orgs para el display
          let orgCache = getFromCache<any[]>("organizations", "all");
          if (!orgCache) {
            try {
              orgCache = await getOrganizations();
              setInCache("organizations", "all", orgCache, 600_000);
            } catch { orgCache = []; }
          }
          const orgMap = new Map((orgCache || []).map((o: any) => [o.id, o.name]));

          const mapped = predios.map((p: any) => ({
            id: p.network_id,
            name: p.predio_name || p.predio_code || q,
            organizationId: p.organization_id,
            orgId: p.organization_id,
            orgName: orgMap.get(p.organization_id) || "",
            predioCode: p.predio_code,
            source: "legacy-backend",
          }));
          console.log(`[Search] ✓ "${q}" found ${mapped.length} via legacy backend`);
          return NextResponse.json(mapped.slice(0, 20));
        }
      }
    } catch (e) {
      console.error("[Search] Legacy backend failed:", e instanceof Error ? e.message : e);
    }

    // Fallback: búsqueda directa en Meraki API (lotes de 3)
    let orgs: any[] = [];
    if (orgId) {
      orgs = [{ id: orgId, name: "" }];
    } else {
      const cachedOrgs = getFromCache<any[]>("organizations", "all");
      if (cachedOrgs) {
        orgs = cachedOrgs;
      } else {
        orgs = await getOrganizations();
        setInCache("organizations", "all", orgs, 600_000);
      }
    }

    console.log(`[Search] Fallback: "${q}" across ${orgs.length} orgs`);

    const BATCH_SIZE = 3;
    const results: any[] = [];
    for (let i = 0; i < orgs.length; i += BATCH_SIZE) {
      const batch = orgs.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((org) => searchInOrg(org, lower))
      );
      results.push(...batchResults.flat());
      if (results.length >= 20) break;
      if (i + BATCH_SIZE < orgs.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    console.log(`[Search] Fallback results for "${q}": ${results.length}`);

    return NextResponse.json(results.slice(0, 20));
  } catch (error) {
    console.error("[meraki/search]", error);
    return NextResponse.json({ error: "Error buscando redes" }, { status: 500 });
  }
}
