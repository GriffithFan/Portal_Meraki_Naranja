import { NextRequest, NextResponse } from "next/server";
import {
  getNetworkInfo,
  getNetworkDevices,
  getOrganizationDevicesStatuses,
  getOrganizationDevicesAvailabilitiesChangeHistory,
  getNetworkTopologyLinkLayer,
  getNetworkSwitchPortsStatuses,
  getDeviceSwitchPorts,
  getDeviceSwitchPortsStatuses,
  getNetworkSwitchAccessControlLists,
  getDeviceLldpCdp,
  getOrgApplianceUplinkStatuses,
  getAppliancePorts,
  getDeviceAppliancePortsStatuses,
  getDeviceWirelessConnectionStats,
  getNetworkWirelessConnectionStats,
  getNetworkWirelessFailedConnections,
  getOrgWirelessSignalQualityByDevice,
  getNetworkWirelessSignalQualityHistory,
  getOrgWirelessDevicesEthernetStatuses,
} from "@/lib/meraki";
import { toGraphFromLinkLayer } from "@/lib/merakiTransformers";
import { getFromCache, setInCache, getOrFetch, invalidateCache } from "@/lib/merakiCache";

const DEFAULT_WIRELESS_TIMESPAN = 3600;

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ networkId: string; sectionKey: string }> }
) {
  const { networkId, sectionKey } = await params;
  const startTime = Date.now();

  // ══════ DEMO: predio imaginario 111111 ══════
  if (networkId === "DEMO_111111") {
    const demo = buildDemoAccessPoints();
    if (sectionKey === "access_points") return NextResponse.json({ networkId, section: sectionKey, ...demo });
    // Para otras secciones devolver vacío
    return NextResponse.json({ networkId, section: sectionKey });
  }

  try {
    // Cache por sección (skip si ?force=true)
    const forceRefresh = request.nextUrl.searchParams.get("force") === "true";
    const cacheKey = `${networkId}:${sectionKey}`;
    if (!forceRefresh) {
      const cached = getFromCache<any>("section", cacheKey);
      if (cached) return NextResponse.json(cached);
    }

    // Cuando force=true, invalidar sub-caches para obtener datos frescos de la API
    if (forceRefresh) {
      invalidateCache("networkById", `statuses:${networkId}`);
      invalidateCache("networkById", `devices:${networkId}`);
      invalidateCache("networkById", `topology:${networkId}`);
      invalidateCache("networkById", `swPortStatuses:${networkId}`);
      invalidateCache("networkById", `availHistory:${networkId}`);
    }

    const network = await getOrFetch("networkById", `info:${networkId}`, () => getNetworkInfo(networkId));
    const orgId = (network as any)?.organizationId;
    const devices: any[] = await getOrFetch("networkById", `devices:${networkId}`, () => getNetworkDevices(networkId));

    const statusMap = new Map<string, any>();
    if (orgId) {
      const statuses: any[] = await getOrFetch("networkById", `statuses:${networkId}`, () =>
        getOrganizationDevicesStatuses(orgId, { "networkIds[]": networkId })
      );
      statuses.forEach((s) => statusMap.set(s.serial, s));
    }

    const switches = devices.filter((d) => /^ms/i.test(d.model));
    const accessPoints = devices.filter((d) => /^mr/i.test(d.model));

    let result: any = { networkId, section: sectionKey };

    switch (sectionKey) {
      case "topology": {
        const rawTopology = await getOrFetch("networkById", `topology:${networkId}`, () => getNetworkTopologyLinkLayer(networkId));
        const topology = toGraphFromLinkLayer(rawTopology, statusMap);
        result.topology = topology;
        result.devices = devices.map((d) => ({
          serial: d.serial,
          name: d.name,
          model: d.model,
          mac: d.mac,
          lanIp: d.lanIp,
          status: statusMap.get(d.serial)?.status || d.status,
        }));
        break;
      }

      case "switches": {
        result = await buildSwitchesSection(networkId, orgId, switches, devices, statusMap);
        result.networkId = networkId;
        result.section = sectionKey;
        break;
      }

      case "access_points": {
        result = await buildAccessPointsSection(
          networkId,
          orgId,
          devices,
          switches,
          accessPoints,
          statusMap,
        );
        result.networkId = networkId;
        result.section = sectionKey;
        break;
      }

      case "appliance_status": {
        result = await buildApplianceSection(networkId, orgId, devices, statusMap);
        result.networkId = networkId;
        result.section = sectionKey;
        break;
      }

      default:
        return NextResponse.json({ error: "Sección no soportada" }, { status: 400 });
    }

    result.elapsedMs = Date.now() - startTime;
    setInCache("section", cacheKey, result);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error(`[section/${sectionKey}]`, error?.response?.data || error.message);
    return NextResponse.json({ error: "Error obteniendo sección" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// Switches
// ═══════════════════════════════════════════════════════════════
async function buildSwitchesSection(networkId: string, orgId: string | undefined, switches: any[], allDevices: any[], statusMap: Map<string, any>) {
  // Find the MX appliance in the network
  const mxDevice = allDevices.find((d) => /^mx|^z[13]/i.test(d.model));

  // Network-wide port statuses (includes serial per entry)
  let switchPortsRaw: any[] = [];
  try { switchPortsRaw = await getOrFetch("networkById", `swPortStatuses:${networkId}`, () => getNetworkSwitchPortsStatuses(networkId)); } catch (e) { console.error(`[Section:switches] getNetworkSwitchPortsStatuses(${networkId}):`, e); }

  const portsBySerial: Record<string, any[]> = {};
  switchPortsRaw.forEach((e) => {
    if (!portsBySerial[e.serial]) portsBySerial[e.serial] = [];
    portsBySerial[e.serial].push(e);
  });

  let switchAcls: any = { rules: [] };
  try { switchAcls = await getNetworkSwitchAccessControlLists(networkId); } catch (e) { console.error(`[Section:switches] getNetworkSwitchAccessControlLists(${networkId}):`, e); }

  // Fetch topology for fallback switch→MX detection
  let rawTopology: any = null;
  try { rawTopology = await getOrFetch("networkById", `topology:${networkId}`, () => getNetworkTopologyLinkLayer(networkId)); } catch (e) { console.error(`[Section:switches] getNetworkTopologyLinkLayer(${networkId}):`, e); }

  const detailedPortsMap: Record<string, any[]> = {};
  const lldpSnapshots: Record<string, any> = {};
  const perDevicePortStatuses: Record<string, any[]> = {};

  // Parallelize per-switch API calls
  await Promise.all(switches.map(async (sw) => {
    const [portsResult, lldpResult, devicePortStatusResult] = await Promise.allSettled([
      getDeviceSwitchPorts(sw.serial),
      getDeviceLldpCdp(sw.serial),
      getDeviceSwitchPortsStatuses(sw.serial),
    ]);
    detailedPortsMap[sw.serial] = portsResult.status === "fulfilled" ? portsResult.value : [];
    if (lldpResult.status === "fulfilled") lldpSnapshots[sw.serial] = lldpResult.value;
    if (devicePortStatusResult.status === "fulfilled") perDevicePortStatuses[sw.serial] = devicePortStatusResult.value;
  }));

  // Fetch availability change history for all devices in this network (24h)
  const availabilityBySerial = new Map<string, any[]>();
  if (orgId) {
    try {
      const history: any[] = await getOrFetch("networkById", `availHistory:${networkId}`, () => getOrganizationDevicesAvailabilitiesChangeHistory(orgId, { "networkIds[]": networkId, timespan: 86400 }));
      if (Array.isArray(history)) {
        for (const evt of history) {
          const serial = evt?.device?.serial;
          if (!serial) continue;
          if (!availabilityBySerial.has(serial)) availabilityBySerial.set(serial, []);
          availabilityBySerial.get(serial)!.push(evt);
        }
      }
    } catch (e) { console.error(`[Section:switches] availabilityChangeHistory(${networkId}):`, e); }
  }

  const result: any = {};
  result.switches = switches.map((sw) => {
    // Use network-wide port statuses; fallback to per-device port statuses
    let statusPorts = portsBySerial[sw.serial] || [];
    if (statusPorts.length === 0 && perDevicePortStatuses[sw.serial]?.length) {
      statusPorts = perDevicePortStatuses[sw.serial];
    }
    const configPorts = detailedPortsMap[sw.serial] || [];

    const portsEnriched = statusPorts.map((sp) => {
      const cp = configPorts.find((c: any) => c.portId === sp.portId) || {};
      return {
        portId: sp.portId, enabled: sp.enabled, status: sp.status,
        isUplink: sp.isUplink, errors: sp.errors || [], warnings: sp.warnings || [],
        speed: sp.speed || null, duplex: sp.duplex || null,
        name: cp.name || `Port ${sp.portId}`, type: cp.type,
        vlan: cp.vlan, allowedVlans: cp.allowedVlans,
        poeEnabled: cp.poeEnabled, linkNegotiation: cp.linkNegotiation,
        tags: cp.tags || [], accessPolicyType: cp.accessPolicyType,
        stickyMacAllowList: cp.stickyMacAllowList, stpGuard: cp.stpGuard,
        clientCount: sp.clientCount, powerUsageInWh: sp.powerUsageInWh,
        trafficInKbps: sp.trafficInKbps,
        lldp: sp.lldp || null, cdp: sp.cdp || null,
      };
    });

    // Resolve connectedTo via LLDP/CDP — specifically look for MX appliance connection
    let connectedTo = "-";
    let uplinkPortOnRemote: string | null = null;
    let detectionMethod = "Unknown";
    const lldp = lldpSnapshots[sw.serial];
    if (lldp?.ports) {
      const portsWithLldp = Object.values(lldp.ports).filter((p: any) => p.lldp || p.cdp);
      for (const lldpPort of portsWithLldp) {
        const lldpInfo = (lldpPort as any).lldp || (lldpPort as any).cdp;
        if (lldpInfo) {
          const remoteName = lldpInfo.deviceId || lldpInfo.systemName || "";
          const remotePort = lldpInfo.portId || lldpInfo.portDescription || "";
          // Check if this LLDP peer is the MX appliance
          const isConnectedToAppliance = mxDevice && (
            remoteName.includes(mxDevice.serial) ||
            remoteName.includes(mxDevice.name) ||
            (mxDevice.model && remoteName.includes(mxDevice.model))
          );
          if (isConnectedToAppliance) {
            const portMatch = remotePort.match(/(\d+)/);
            uplinkPortOnRemote = portMatch ? portMatch[1] : remotePort;
            connectedTo = `${mxDevice.name || mxDevice.model}/Port ${uplinkPortOnRemote}`;
            detectionMethod = "LLDP/CDP";
            break;
          }
        }
      }
    }

    // Topology fallback: if LLDP didn't find MX connection, check raw topology links
    if (connectedTo === "-" && mxDevice && rawTopology?.links) {
      const swSerial = sw.serial.toUpperCase();
      const mxSerial = mxDevice.serial.toUpperCase();
      const linkToMx = rawTopology.links.find((link: any) => {
        if (!link.ends || link.ends.length !== 2) return false;
        const s0 = link.ends[0]?.device?.serial?.toUpperCase() || "";
        const s1 = link.ends[1]?.device?.serial?.toUpperCase() || "";
        return (s0 === swSerial && s1 === mxSerial) || (s1 === swSerial && s0 === mxSerial);
      });
      if (linkToMx) {
        // Infer MX port by model
        const model = mxDevice.model || "";
        let inferredMxPort = "10";
        if (/MX6[4-7]/i.test(model)) inferredMxPort = "3";
        else if (/MX84|MX100/i.test(model)) inferredMxPort = "10";
        else if (/MX250|MX450/i.test(model)) inferredMxPort = "11";
        uplinkPortOnRemote = inferredMxPort;
        connectedTo = `${mxDevice.model}/Port ${uplinkPortOnRemote}`;
        detectionMethod = "Topology Fallback";
      }
    }

    const deviceStatus = statusMap.get(sw.serial);
    // Firmware from device status
    const firmware = deviceStatus?.firmware || sw.firmware || null;

    return {
      serial: sw.serial, name: sw.name, model: sw.model,
      status: deviceStatus?.status || sw.status,
      mac: sw.mac, lanIp: sw.lanIp, firmware,
      connectedTo, uplinkPortOnRemote,
      lastReportedAt: deviceStatus?.lastReportedAt || null,
      availabilityHistory: availabilityBySerial.get(sw.serial) || [],
      ports: portsEnriched,
      totalPorts: portsEnriched.length,
      uplinkPorts: portsEnriched.filter((p: any) => p.isUplink).length,
      activePorts: portsEnriched.filter((p: any) => (p.status || "").toLowerCase() === "connected").length,
      tooltipInfo: {
        type: "switch",
        name: sw.name || sw.serial,
        model: sw.model,
        serial: sw.serial,
        mac: sw.mac,
        firmware,
        lanIp: sw.lanIp,
        totalPorts: portsEnriched.length,
        connectedPorts: portsEnriched.filter((p: any) => (p.status || "").toLowerCase() === "connected").length,
        poePorts: portsEnriched.filter((p: any) => p.poeEnabled).length,
        poeActivePorts: portsEnriched.filter((p: any) => p.poeEnabled && (p.status || "").toLowerCase() === "connected").length,
        connectedTo,
        uplinkPortOnRemote,
        detectionMethod,
      },
    };
  });

  // Aggregate switchesOverview stats
  result.switchesOverview = (result.switches || []).reduce(
    (acc: any, sw: any) => {
      acc.totalSwitches += 1;
      const ports = sw.ports || [];
      acc.totalPorts += ports.length;
      acc.connectedPorts += ports.filter((p: any) => (p.status || "").toLowerCase() === "connected").length;
      acc.inactivePorts += ports.filter((p: any) => {
        const s = (p.status || "").toLowerCase();
        return p.enabled !== false && (s === "disconnected" || s === "offline");
      }).length;
      acc.disabledPorts += ports.filter((p: any) => p.enabled === false).length;
      acc.poePorts += ports.filter((p: any) => p.poeEnabled).length;
      acc.poeActivePorts += ports.filter((p: any) => p.poeEnabled && (p.status || "").toLowerCase() === "connected").length;
      acc.uplinkPorts += ports.filter((p: any) => p.isUplink).length;
      acc.warningPorts += ports.filter((p: any) => Array.isArray(p.warnings) && p.warnings.length > 0).length;
      acc.crcErrorPorts += ports.filter((p: any) => Array.isArray(p.warnings) && p.warnings.some((w: string) => /crc/i.test(w))).length;
      return acc;
    },
    { totalSwitches: 0, totalPorts: 0, connectedPorts: 0, inactivePorts: 0, disabledPorts: 0, poePorts: 0, poeActivePorts: 0, uplinkPorts: 0, warningPorts: 0, crcErrorPorts: 0 }
  );

  if (switchAcls?.rules?.length) {
    result.accessControlLists = switchAcls.rules.map((r: any) => ({
      policy: r.policy, ipVersion: r.ipVersion, protocol: r.protocol,
      srcCidr: r.srcCidr, srcPort: r.srcPort,
      dstCidr: r.dstCidr, dstPort: r.dstPort,
      comment: r.comment, vlan: r.vlan,
    }));
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Access Points
// ═══════════════════════════════════════════════════════════════
async function buildAccessPointsSection(
  networkId: string,
  orgId: string | undefined,
  devices: any[],
  switches: any[],
  accessPoints: any[],
  statusMap: Map<string, any>,
) {
  const result: any = {};

  // --- Mesh repeater detection + topology fallback for AP→Switch/Gateway connections ---
  const meshRepeaterSet = new Set<string>();
  const meshParentMap = new Map<string, { parentSerial: string; parentName: string; parentPort: string | null }>();
  // Fallback: topology-based AP→Switch/Gateway connection map (when LLDP fails)
  const topoConnMap = new Map<string, { switchName: string; portNum: string }>();
  // Gateway/appliance devices (MX, Z3, etc.) — also valid wired destinations for APs
  const gatewayDevices = devices.filter((d: any) => /^mx|^z[13]/i.test(d.model));
  const gatewaySerials = new Set(gatewayDevices.map((d: any) => d.serial));
  try {
    const rawTopology = await getOrFetch("networkById", `topology:${networkId}`, () => getNetworkTopologyLinkLayer(networkId));
    if (rawTopology?.links) {
      const apSerials = new Set(accessPoints.map((a: any) => a.serial));
      const swSerials = new Set(switches.map((s: any) => s.serial));
      // Combined set: switches + gateways (valid wired peers for APs)
      const wiredPeerSerials = new Set(Array.from(swSerials).concat(Array.from(gatewaySerials)));
      const allWiredPeerDevices = switches.concat(gatewayDevices);
      for (const link of rawTopology.links) {
        if (link.ends?.length === 2) {
          const [e1, e2] = link.ends;
          const s1 = e1.device?.serial;
          const s2 = e2.device?.serial;
          if (apSerials.has(s1) && apSerials.has(s2)) {
            // AP-to-AP link → candidate mesh detection (will be validated later against LLDP/ethernet)
            if (!e1.discovered?.lldp && !e1.discovered?.cdp) {
              meshRepeaterSet.add(s1);
              meshParentMap.set(s1, { parentSerial: s2, parentName: e2.device?.name || s2, parentPort: e2.discovered?.lldp?.portId || e2.discovered?.cdp?.portId || null });
            }
            if (!e2.discovered?.lldp && !e2.discovered?.cdp) {
              meshRepeaterSet.add(s2);
              meshParentMap.set(s2, { parentSerial: s1, parentName: e1.device?.name || s1, parentPort: e1.discovered?.lldp?.portId || e1.discovered?.cdp?.portId || null });
            }
          } else if (apSerials.has(s1) && wiredPeerSerials.has(s2)) {
            // AP→Switch/Gateway link from topology — use as fallback for LLDP
            const peerDev = allWiredPeerDevices.find((d: any) => d.serial === s2);
            const peerName = peerDev?.name || peerDev?.model || s2;
            const portId = e2.discovered?.lldp?.portId || e2.discovered?.cdp?.portId || "";
            const portMatch = portId.match(/(\d+)(?:\/\d+)*$/);
            const portN = portMatch ? portMatch[1] : portId;
            if (portN) topoConnMap.set(s1, { switchName: peerName, portNum: portN });
          } else if (apSerials.has(s2) && wiredPeerSerials.has(s1)) {
            // Switch/Gateway→AP link (reversed ends)
            const peerDev = allWiredPeerDevices.find((d: any) => d.serial === s1);
            const peerName = peerDev?.name || peerDev?.model || s1;
            const portId = e1.discovered?.lldp?.portId || e1.discovered?.cdp?.portId || "";
            const portMatch = portId.match(/(\d+)(?:\/\d+)*$/);
            const portN = portMatch ? portMatch[1] : portId;
            if (portN) topoConnMap.set(s2, { switchName: peerName, portNum: portN });
          }
        }
      }
    }
  } catch (e) { console.error(`[Section:aps] topología no disponible (${networkId}):`, e); }

  // --- Datos auxiliares ---
  let switchPortsRaw: any[] = [];
  try { switchPortsRaw = await getOrFetch("networkById", `swPortStatuses:${networkId}`, () => getNetworkSwitchPortsStatuses(networkId)); } catch (e) { console.error(`[Section:aps] getNetworkSwitchPortsStatuses(${networkId}):`, e); }

  let wirelessEthernetStatuses: any[] = [];
  if (orgId) {
    try { wirelessEthernetStatuses = (await getOrgWirelessDevicesEthernetStatuses(orgId, { "networkIds[]": networkId })) || []; } catch (e) { console.error(`[Section:aps] getOrgWirelessDevicesEthernetStatuses(${networkId}):`, e); }
  }

  let networkWirelessStats: any = null;
  try { networkWirelessStats = await getNetworkWirelessConnectionStats(networkId, { timespan: 3600 }); } catch (e) { console.error(`[Section:aps] getNetworkWirelessConnectionStats(${networkId}):`, e); }

  const cachedLldpMap = getFromCache<Record<string, any>>("lldpByNetwork", networkId) || {};
  const lldpSnapshots: Record<string, any> = {};
  const wirelessStats: Record<string, any> = {};

  // Parallelize per-AP LLDP + wireless stats calls
  await Promise.all(accessPoints.map(async (ap) => {
    const [lldpResult, statsResult] = await Promise.allSettled([
      cachedLldpMap[ap.serial] ? Promise.resolve(cachedLldpMap[ap.serial]) : getDeviceLldpCdp(ap.serial),
      getDeviceWirelessConnectionStats(ap.serial, { timespan: 3600 }),
    ]);
    if (lldpResult.status === "fulfilled") lldpSnapshots[ap.serial] = lldpResult.value;
    if (statsResult.status === "fulfilled") wirelessStats[ap.serial] = statsResult.value;
  }));

  // Fetch availability change history for APs (24h)
  const apAvailabilityBySerial = new Map<string, any[]>();
  if (orgId) {
    try {
      const history: any[] = await getOrFetch("networkById", `availHistory:${networkId}`, () => getOrganizationDevicesAvailabilitiesChangeHistory(orgId, { "networkIds[]": networkId, timespan: 86400 }));
      if (Array.isArray(history)) {
        for (const evt of history) {
          const serial = evt?.device?.serial;
          if (!serial) continue;
          if (!apAvailabilityBySerial.has(serial)) apAvailabilityBySerial.set(serial, []);
          apAvailabilityBySerial.get(serial)!.push(evt);
        }
      }
    } catch (e) { console.error(`[Section:aps] availabilityChangeHistory(${networkId}):`, e); }
  }

  // --- Map de APs ---
  result.accessPoints = accessPoints.map((ap: any) => {
    const lldp = lldpSnapshots[ap.serial];
    let port: any = null;
    let switchName = "";
    let portNum = "";

    if (lldp?.ports) {
      for (const key of Object.keys(lldp.ports)) {
        const p = lldp.ports[key];
        if (p.lldp || p.cdp) { port = p; break; }
      }
    }

    if (port) {
      const { cdp, lldp: lldpData } = port;
      const devMac = port.deviceMac || "";
      // Try to match the LLDP peer against known switches or gateway devices for a proper name
      const allWiredPeers = [...switches, ...gatewayDevices];
      const knownSw = devMac ? allWiredPeers.find((s: any) => s.mac?.replace(/:/g, "").toLowerCase() === devMac.replace(/:/g, "").toLowerCase()) : null;
      if (knownSw) {
        switchName = knownSw.name || knownSw.model || knownSw.serial;
      } else if (lldpData?.systemName) {
        // Parse "Meraki MS225-24P - 460855 - switch" → take everything after "Meraki MODEL - "
        const nameMatch = lldpData.systemName.match(/Meraki\s+\S+\s+-\s+(.+)/i);
        switchName = nameMatch ? nameMatch[1].trim() : lldpData.systemName;
      } else if (cdp?.deviceId) {
        switchName = cdp.platform ? `${cdp.platform} (${cdp.address || cdp.deviceId})` : cdp.deviceId;
      }
      if (lldpData?.portId) { const m = lldpData.portId.match(/(\d+)(?:\/\d+)*$/); portNum = m ? m[1] : lldpData.portId; }
      else if (cdp?.portId) { const m = cdp.portId.match(/(\d+)(?:\/\d+)*$/); portNum = m ? m[1] : cdp.portId; }
    }

    // Fallback: si LLDP no retornó datos, usar topología link-layer
    if (!switchName && !portNum) {
      const topoConn = topoConnMap.get(ap.serial);
      if (topoConn) {
        switchName = topoConn.switchName;
        portNum = topoConn.portNum;
      }
    }

    const connectedTo = switchName && portNum ? `${switchName}/Port ${portNum}` : switchName || "-";

    // --- Wired speed + duplex (3-prioridad) ---
    let wiredSpeed = "";
    let duplex = "";
    const ethSt = wirelessEthernetStatuses.find((s: any) => s.serial === ap.serial);
    const ethPort = ethSt?.ports?.[0];
    const ethApiSpeed = ethPort?.linkNegotiation?.speed ?? ethPort?.speed ?? ethSt?.speed;
    const ethApiDuplex = ethPort?.linkNegotiation?.duplex || ethPort?.duplex || "";
    if (ethApiDuplex) duplex = /full/i.test(ethApiDuplex) ? "full" : /half/i.test(ethApiDuplex) ? "half" : "";

    if (ethApiSpeed) {
      wiredSpeed = typeof ethApiSpeed === "number" ? `${ethApiSpeed} Mbps` : String(ethApiSpeed).includes("Mbps") ? String(ethApiSpeed) : `${ethApiSpeed} Mbps`;
    } else if (port) {
      const pSpeed = port.lldp?.portSpeed || port.cdp?.portSpeed || "";
      if (pSpeed.includes("10000")) wiredSpeed = "10000 Mbps";
      else if (pSpeed.includes("1000")) wiredSpeed = "1000 Mbps";
      else if (pSpeed.includes("100")) wiredSpeed = "100 Mbps";
      else if (pSpeed.includes("10")) wiredSpeed = "10 Mbps";
      else {
        const platform = port.cdp?.platform || port.lldp?.systemDescription || "";
        if (/gigabit/i.test(platform) || /MS225|MS250|MS350|MS120|MS125/.test(platform)) wiredSpeed = "1000 Mbps";
        else if (/fast ethernet|100/i.test(platform)) wiredSpeed = "100 Mbps";
      }
      // Extraer duplex del LLDP si no lo conseguimos del ethPort
      if (!duplex) {
        const pSpeedStr = pSpeed || port.lldp?.systemDescription || port.cdp?.platform || "";
        if (/full/i.test(pSpeedStr)) duplex = "full";
        else if (/half/i.test(pSpeedStr)) duplex = "half";
      }

      // Fallback: consultar velocidad del puerto del switch donde conecta el AP
      if (!wiredSpeed && switchName && portNum) {
        const sw = switches.find((s: any) => s.name === switchName || s.name?.includes(switchName) || s.serial === switchName);
        if (sw) {
          const swPort = switchPortsRaw.find((p: any) => p.serial === sw.serial && p.portId === portNum);
          if (swPort) {
            const ls = swPort.linkSpeed || swPort.speed;
            if (ls) wiredSpeed = typeof ls === "number" ? `${ls} Mbps` : ls.includes("Mbps") ? ls : `${ls} Mbps`;
            if (!duplex && swPort.duplex) duplex = /full/i.test(swPort.duplex) ? "full" : "half";
          }
        }
      }
    }

    // Si no se detectó duplex pero hay velocidad >= 1000 Mbps, asumir full duplex (estándar Gigabit)
    if (!duplex) {
      const speedNum = parseInt(wiredSpeed);
      if (speedNum >= 1000) duplex = "full";
    }

    // Agregar duplex al string de velocidad
    if (duplex && wiredSpeed && !/(full|half)\s*duplex/i.test(wiredSpeed)) {
      wiredSpeed = `${wiredSpeed}, ${duplex === "full" ? "Full Duplex" : "Half Duplex"}`;
    }

    // --- Mesh detection ---
    // PRIORIDAD: Si el AP tiene conexión LLDP/CDP a un switch/gateway real, o un puerto ethernet activo,
    // entonces NO es un mesh repeater, sin importar lo que diga la topología.
    const deviceStatus = statusMap.get(ap.serial);
    const isFromTopology = meshRepeaterSet.has(ap.serial);
    const hasWiredLldpConn = !!(switchName && portNum);
    const hasActiveEthPort = !!ethApiSpeed && ethApiSpeed !== "N/A";
    const isMeshRepeater = !hasWiredLldpConn && !hasActiveEthPort && (isFromTopology || (ethSt && !ethApiSpeed));

    const meshParent = meshParentMap.get(ap.serial);
    let finalConnectedTo = connectedTo;
    let finalWiredSpeed = wiredSpeed || "—";
    let meshParentName: string | null = null;

    if (isMeshRepeater) {
      finalConnectedTo = meshParent ? `${meshParent.parentName} (Mesh)` : "Mesh Repeater";
      meshParentName = meshParent?.parentName || null;
      finalWiredSpeed = "—";
    }

    const stats = wirelessStats[ap.serial];
    const firmware = deviceStatus?.firmware || ap.firmware || null;

    // --- Power mode detection ---
    const powerMode = ethSt?.power?.mode || null; // "full" | "low" | null

    return {
      serial: ap.serial, name: ap.name, model: ap.model,
      status: deviceStatus?.status || ap.status,
      mac: ap.mac, lanIp: ap.lanIp, firmware,
      publicIp: deviceStatus?.publicIp || null,
      lastReportedAt: deviceStatus?.lastReportedAt || null,
      connectedTo: finalConnectedTo,
      connectedPort: isMeshRepeater ? "—" : (port?.cdp?.portId || port?.lldp?.portId || "-"),
      wiredSpeed: finalWiredSpeed,
      isMeshRepeater, meshParentName, powerMode,
      availabilityHistory: apAvailabilityBySerial.get(ap.serial) || [],
      connectionStats: stats ? {
        assoc: stats.assoc || 0, auth: stats.auth || 0,
        dhcp: stats.dhcp || 0, dns: stats.dns || 0,
        success: stats.success || 0,
        successRate: stats.success && stats.assoc ? ((stats.success / stats.assoc) * 100).toFixed(1) + "%" : "N/A",
      } : null,
    };
  });

  // --- GAP correction (Z3 + 1 AP sin switches) ---
  const hasZ3 = devices.some((d) => (d.model || "").toUpperCase().startsWith("Z3"));
  const isGAPConfig = hasZ3 && switches.length === 0 && result.accessPoints.length === 1;
  if (isGAPConfig) {
    result.accessPoints = result.accessPoints.map((ap: any) => {
      const dev = ap.connectedTo.split("/")[0].trim();
      return { ...ap, connectedTo: `${dev}/Port 5`, connectedPort: "5", _correctedForGAP: true };
    });
  }

  if (networkWirelessStats) {
    result.networkWirelessStats = {
      assoc: networkWirelessStats.assoc || 0, auth: networkWirelessStats.auth || 0,
      dhcp: networkWirelessStats.dhcp || 0, dns: networkWirelessStats.dns || 0,
      success: networkWirelessStats.success || 0,
      successRate: networkWirelessStats.success && networkWirelessStats.assoc
        ? ((networkWirelessStats.success / networkWirelessStats.assoc) * 100).toFixed(1) + "%" : "N/A",
    };
  }

  // --- Wireless signal + failed connections ---
  if (accessPoints.length > 0 && orgId) {
    try {
      const wp = { "networkIds[]": networkId, timespan: DEFAULT_WIRELESS_TIMESPAN };
      const [signalByDevice, signalHistory, failedConnections] = await Promise.allSettled([
        getOrgWirelessSignalQualityByDevice(orgId, wp),
        getNetworkWirelessSignalQualityHistory(networkId, { timespan: DEFAULT_WIRELESS_TIMESPAN, resolution: 300 }),
        getNetworkWirelessFailedConnections(networkId, { timespan: DEFAULT_WIRELESS_TIMESPAN }),
      ]);
      if (signalByDevice.status === "fulfilled") result.wirelessSignalByDevice = signalByDevice.value;
      if (signalHistory.status === "fulfilled") result.wirelessSignalHistory = signalHistory.value;
      if (failedConnections.status === "fulfilled") result.wirelessFailedConnections = failedConnections.value;

      // Enrich each AP with per-device signal quality + tooltipInfo (like original composeWirelessMetrics)
      const signalDeviceArray: any[] = signalByDevice.status === "fulfilled" ? (Array.isArray(signalByDevice.value) ? signalByDevice.value : []) : [];
      const failedArray: any[] = failedConnections.status === "fulfilled" ? (Array.isArray(failedConnections.value) ? failedConnections.value : []) : [];

      if (result.accessPoints) {
        const signalMap = new Map<string, any>();
        for (const entry of signalDeviceArray) {
          const s = entry?.serial || entry?.deviceSerial;
          if (s) signalMap.set(s.toUpperCase(), entry);
        }

        // Count + collect failed connections per AP
        const failCountMap = new Map<string, number>();
        const failTimestampsMap = new Map<string, { ts: string; type: string; step: string }[]>();
        for (const f of failedArray) {
          const s = f?.serial;
          if (s) {
            const key = s.toUpperCase();
            failCountMap.set(key, (failCountMap.get(key) || 0) + 1);
            if (!failTimestampsMap.has(key)) failTimestampsMap.set(key, []);
            failTimestampsMap.get(key)!.push({ ts: f.ts || f.timestamp, type: f.type || "", step: f.failureStep || "" });
          }
        }

        result.accessPoints = result.accessPoints.map((ap: any) => {
          const sigEntry = signalMap.get((ap.serial || "").toUpperCase());
          const signalQuality = sigEntry?.signalQuality?.average ?? sigEntry?.averageSignalQuality ?? sigEntry?.signalQuality ?? null;
          const clients = sigEntry?.clients ?? sigEntry?.clientCount ?? null;
          const microDrops = failCountMap.get((ap.serial || "").toUpperCase()) || 0;
          const failureEvents = failTimestampsMap.get((ap.serial || "").toUpperCase()) || [];

          return {
            ...ap,
            signalQuality: typeof signalQuality === "number" ? Math.round(signalQuality) : null,
            clients: typeof clients === "number" ? clients : null,
            microDrops,
            failureEvents,
            tooltipInfo: {
              type: "access-point",
              name: ap.name || ap.serial,
              model: ap.model,
              serial: ap.serial,
              firmware: ap.firmware,
              lanIp: ap.lanIp,
              publicIp: ap.publicIp,
              signalQuality: typeof signalQuality === "number" ? Math.round(signalQuality) : null,
              clients: typeof clients === "number" ? clients : null,
              microDrops,
              connectedTo: ap.connectedTo,
              wiredSpeed: ap.wiredSpeed,
            },
          };
        });
      }
    } catch (e) { console.error(`[Section:aps] sin datos wireless (${networkId}):`, e); }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Appliance Status
// ═══════════════════════════════════════════════════════════════
async function buildApplianceSection(
  networkId: string,
  orgId: string | undefined,
  devices: any[],
  statusMap: Map<string, any>,
) {
  const result: any = {};
  const appliances = devices.filter((d) => /^mx|^z[13]/i.test(d.model));

  // Uplink statuses de la organización filtrado por esta red
  let uplinks: any[] = [];
  if (orgId) {
    try {
      const allUplinks = await getOrgApplianceUplinkStatuses(orgId, { "networkIds[]": networkId });
      uplinks = Array.isArray(allUplinks) ? allUplinks : [];
    } catch (e) { console.error(`[Section:appliance] getOrgApplianceUplinkStatuses(${networkId}):`, e); }
  }

  // Gather switch LLDP data to enrich appliance ports with connectivity
  const switches = devices.filter((d) => /^ms/i.test(d.model));
  const switchLldpMap: Record<string, { name: string; serial: string; uplinkPortOnRemote: string | null }> = {};

  await Promise.all(
    switches.map(async (sw) => {
      try {
        const lldp = await getDeviceLldpCdp(sw.serial);
        if (lldp?.ports) {
          for (const portData of Object.values(lldp.ports) as any[]) {
            const lldpInfo = portData.lldp || portData.cdp;
            if (!lldpInfo) continue;
            const remoteName = lldpInfo.deviceId || lldpInfo.systemName || "";
            const remotePort = lldpInfo.portId || lldpInfo.portDescription || "";
            // Check if this LLDP peer is an MX appliance in this network
            const isAppliance = appliances.some(
              (a) =>
                remoteName.includes(a.serial) ||
                remoteName.includes(a.name) ||
                (a.model && remoteName.includes(a.model))
            );
            if (isAppliance) {
              const portMatch = remotePort.match(/(\d+)/);
              switchLldpMap[sw.serial] = {
                name: sw.name || sw.model || sw.serial,
                serial: sw.serial,
                uplinkPortOnRemote: portMatch ? portMatch[1] : null,
              };
              break;
            }
          }
        }
      } catch (e) { console.error(`[Section:appliance] LLDP switch(${sw.serial}):`, e); }
    })
  );

  // Get LLDP from the appliance(s) to detect actual port connections
  const applianceLldpMap: Record<string, { deviceName: string; deviceSerial: string; deviceMac: string; deviceType: string; remotePort: string }> = {};
  await Promise.all(
    appliances.map(async (dev) => {
      try {
        const lldp = await getDeviceLldpCdp(dev.serial);
        if (lldp?.ports) {
          for (const [portKey, portData] of Object.entries(lldp.ports) as [string, any][]) {
            const lldpInfo = portData.lldp || portData.cdp;
            if (!lldpInfo) continue;
            const portMatch = portKey.match(/(\d+)/);
            if (!portMatch) continue;
            const portNum = portMatch[1];
            const devMac = portData.deviceMac || "";
            // Determine device type and name
            const platform = portData.cdp?.platform || "";
            const sysName = portData.lldp?.systemName || "";
            const remotePortId = lldpInfo.portId || lldpInfo.portDescription || "";
            const remotePortNum = remotePortId.match(/(\d+)/);
            let devName = sysName || platform || lldpInfo.deviceId || devMac;
            // Match against known network devices for a better name
            const knownDevice = devices.find((d) => devMac && d.mac?.replace(/:/g, "").toLowerCase() === devMac.replace(/:/g, "").toLowerCase());
            if (knownDevice) devName = knownDevice.name || knownDevice.model || devName;
            let devType = "device";
            if (/^ms/i.test(platform) || /switch/i.test(sysName)) devType = "switch";
            else if (/^mr/i.test(platform) || /access.point/i.test(sysName)) devType = "ap";
            else if (knownDevice) {
              if (/^ms/i.test(knownDevice.model)) devType = "switch";
              else if (/^mr/i.test(knownDevice.model)) devType = "ap";
            }
            applianceLldpMap[portNum] = {
              deviceName: devName,
              deviceSerial: knownDevice?.serial || lldpInfo.deviceId || devMac,
              deviceMac: devMac,
              deviceType: devType,
              remotePort: remotePortNum ? remotePortNum[1] : remotePortId,
            };
          }
        }
      } catch (e) { console.error(`[Section:appliance] LLDP appliance(${dev.serial}):`, e); }
    })
  );

  // Fetch network-level port config (always available, even when device-level statuses return 404)
  let networkPortConfigs: any[] = [];
  try {
    networkPortConfigs = await getAppliancePorts(networkId);
    if (!Array.isArray(networkPortConfigs)) networkPortConfigs = [];
  } catch (e) { console.error(`[Section:appliance] getAppliancePorts(${networkId}):`, e); }

  // Port statuses por dispositivo
  const accessPoints = devices.filter((d) => /^mr/i.test(d.model));
  const devicesWithPorts = await Promise.all(
    appliances.map(async (dev) => {
      let ports: any[] = [];
      try {
        ports = await getDeviceAppliancePortsStatuses(dev.serial);
      } catch (e) { console.error(`[Section:appliance] getDeviceAppliancePortsStatuses(${dev.serial}):`, e); }

      // If device-level statuses are empty, use network-level config as base
      // Note: config only tells if port is enabled, NOT if something is connected
      // enabled + no status data → "Disconnected" (no carrier info available)
      // Track if we're using config fallback (no real port status data)
      let isConfigFallback = false;
      if ((!ports || ports.length === 0) && networkPortConfigs.length > 0) {
        isConfigFallback = true;
        ports = networkPortConfigs.map((cfg: any) => ({
          portId: String(cfg.number),
          number: cfg.number,
          enabled: cfg.enabled ?? true,
          status: cfg.enabled ? "Disconnected" : "disabled",
          type: cfg.type || "access",
          vlan: cfg.vlan ?? null,
          allowedVlans: cfg.allowedVlans ?? null,
          dropUntaggedTraffic: cfg.dropUntaggedTraffic ?? false,
          accessPolicy: cfg.accessPolicy ?? null,
        }));
      } else if (ports.length > 0 && networkPortConfigs.length > 0) {
        // Merge: overlay config data onto status data
        const configMap = new Map(networkPortConfigs.map((c: any) => [String(c.number), c]));
        ports = ports.map((p: any) => {
          const key = String(p.number || p.portId);
          const cfg = configMap.get(key);
          if (cfg) {
            return {
              ...p,
              type: p.type || cfg.type,
              vlan: p.vlan ?? cfg.vlan,
              allowedVlans: p.allowedVlans ?? cfg.allowedVlans,
              accessPolicy: p.accessPolicy ?? cfg.accessPolicy,
              dropUntaggedTraffic: p.dropUntaggedTraffic ?? cfg.dropUntaggedTraffic,
            };
          }
          return p;
        });
      }

      // Enrich ports with connectivity from switch LLDP + appliance LLDP
      // If LLDP reports a valid peer on a port, that IS evidence of connectivity.
      // The Meraki port status API can report "Disconnected" on ports that actually
      // have a device connected (common on Z3 PoE ports with APs). LLDP is the
      // definitive source: if a peer is seen, the port is connected.

      const enrichedPorts = ports.map((port) => {
        const portNumber = (port.number || port.portId || "").toString();

        // 1) Check switch LLDP: find any switch whose uplinkPortOnRemote matches this port
        const matchedSwitch = Object.values(switchLldpMap).find(
          (s) => s.uplinkPortOnRemote === portNumber
        );
        if (matchedSwitch) {
          return {
            ...port,
            connectedTo: matchedSwitch.name,
            connectedDevice: matchedSwitch.serial,
            connectedDeviceType: "switch",
            statusNormalized: "connected",
            status: "connected",
            hasCarrier: true,
            tooltipInfo: {
              type: "lan-switch-connection",
              deviceName: matchedSwitch.name,
              deviceSerial: matchedSwitch.serial,
              deviceType: "switch",
              appliancePort: portNumber,
              detectionMethod: "lldp-real-data",
              status: "connected",
            },
          };
        }
        // 2) Check appliance's own LLDP: the appliance sees what's connected to each port
        const lldpPeer = applianceLldpMap[portNumber];
        if (lldpPeer) {
          return {
            ...port,
            connectedTo: lldpPeer.deviceName,
            connectedDevice: lldpPeer.deviceSerial,
            connectedDeviceType: lldpPeer.deviceType,
            statusNormalized: "connected",
            status: "connected",
            hasCarrier: true,
            tooltipInfo: {
              type: lldpPeer.deviceType === "switch" ? "lan-switch-connection" : lldpPeer.deviceType === "ap" ? "lan-ap-connection" : "lan-switch-connection",
              deviceName: lldpPeer.deviceName,
              deviceSerial: lldpPeer.deviceSerial,
              deviceType: lldpPeer.deviceType,
              devicePort: lldpPeer.remotePort,
              appliancePort: portNumber,
              detectionMethod: "appliance-lldp",
              status: "connected",
            },
          };
        }
        return port;
      });

      // Detect APs connected directly to appliance (Z3 + AP on PoE port 5)
      // Also applies when LLDP didn't already detect the connection
      const isZ3 = (dev.model || "").toUpperCase().startsWith("Z3");
      if (isZ3 && accessPoints.length > 0) {
        for (const ap of accessPoints) {
          const apStatus = statusMap.get(ap.serial)?.status || ap.status || "";
          const apIsOnline = /online|active/i.test(apStatus);
          // Check if port 5 already has a connection from LLDP
          const port5AlreadyConnected = enrichedPorts.some(
            (p) => (p.number || p.portId || "").toString() === "5" && p.connectedTo
          );
          // If AP is online and port 5 isn't already attributed, assign it
          const apPort = apIsOnline && !port5AlreadyConnected ? "5" : null;
          if (apPort) {
            const idx = enrichedPorts.findIndex((p) => (p.number || p.portId || "").toString() === apPort);
            if (idx >= 0) {
              const apName = ap.name || ap.model || ap.serial;
              enrichedPorts[idx] = {
                ...enrichedPorts[idx],
                connectedTo: apName,
                connectedDevice: ap.serial,
                connectedDeviceType: "ap",
                statusNormalized: "connected",
                status: "connected",
                hasCarrier: true,
                tooltipInfo: {
                  type: "lan-ap-connection",
                  deviceName: apName,
                  deviceSerial: ap.serial,
                  deviceType: "ap",
                  appliancePort: apPort,
                  detectionMethod: "gap-rule-port5",
                  status: "connected",
                },
              };
            }
          }
        }
      }

      return {
        serial: dev.serial,
        name: dev.name,
        model: dev.model,
        mac: dev.mac,
        lanIp: dev.lanIp,
        status: statusMap.get(dev.serial)?.status || dev.status,
        ports: enrichedPorts,
      };
    })
  );

  // Extraer uplinks flat para el gráfico de conectividad
  const flatUplinks: any[] = [];
  for (const us of uplinks) {
    const serial = us.serial || us.networkId;
    for (const uplink of us.uplinks || []) {
      flatUplinks.push({
        serial,
        interface: uplink.interface,
        status: uplink.status,
        ip: uplink.ip,
        gateway: uplink.gateway,
        publicIp: uplink.publicIp,
        dns: uplink.dns,
        provider: uplink.provider,
        connectionType: uplink.connectionType || null,
        loss: uplink.lossPercent ?? uplink.loss ?? null,
        latency: uplink.latencyMs ?? uplink.latency ?? null,
        jitter: uplink.jitterMs ?? uplink.jitter ?? null,
      });
    }
  }

  result.applianceStatus = {
    devices: devicesWithPorts,
    uplinks: flatUplinks,
  };

  return result;
}

// ═══════════════════════════════════════════════════════════════
// DEMO: Predio imaginario 111111 — 5 APs en distintos estados
// ═══════════════════════════════════════════════════════════════
function buildDemoAccessPoints() {
  const now = Math.floor(Date.now() / 1000);

  function makeHistory(pattern: "stable-online" | "stable-offline" | "flapping" | "recently-down" | "dormant") {
    const events: any[] = [];
    const base = now - 86400;
    switch (pattern) {
      case "stable-online":
        events.push({ ts: new Date(base * 1000).toISOString(), details: { new: { status: "online" } } });
        break;
      case "stable-offline":
        events.push({ ts: new Date(base * 1000).toISOString(), details: { new: { status: "offline" } } });
        break;
      case "flapping":
        for (let i = 0; i < 8; i++) {
          const t = base + i * 10800;
          events.push({ ts: new Date(t * 1000).toISOString(), details: { new: { status: i % 2 === 0 ? "online" : "offline" } } });
        }
        events.push({ ts: new Date((now - 3600) * 1000).toISOString(), details: { new: { status: "online" } } });
        break;
      case "recently-down":
        events.push({ ts: new Date(base * 1000).toISOString(), details: { new: { status: "online" } } });
        events.push({ ts: new Date((now - 7200) * 1000).toISOString(), details: { new: { status: "offline" } } });
        break;
      case "dormant":
        break;
    }
    return events;
  }

  return {
    accessPoints: [
      {
        serial: "DEMO-0001-0001", name: "AP_DEMO_01", model: "MR46",
        status: "online", mac: "aa:bb:cc:dd:ee:01", lanIp: "10.0.0.101",
        firmware: "wireless-30-6", publicIp: "203.0.113.10",
        connectedTo: "DEMO-Switch/Port 1", connectedPort: "1",
        wiredSpeed: "1000 Mbps, Full Duplex",
        isMeshRepeater: false, meshParentName: null, powerMode: "full",
        availabilityHistory: makeHistory("stable-online"),
        connectionStats: { assoc: 150, auth: 148, dhcp: 145, dns: 142, success: 140, successRate: "93.3%" },
      },
      {
        serial: "DEMO-0001-0002", name: "AP_DEMO_02", model: "MR36",
        status: "online", mac: "aa:bb:cc:dd:ee:02", lanIp: null,
        firmware: "wireless-30-6", publicIp: null,
        connectedTo: "AP_DEMO_01 (Mesh)", connectedPort: "—",
        wiredSpeed: "—",
        isMeshRepeater: true, meshParentName: "AP_DEMO_01", powerMode: null,
        availabilityHistory: makeHistory("stable-online"),
        connectionStats: { assoc: 45, auth: 44, dhcp: 43, dns: 42, success: 40, successRate: "88.9%" },
      },
      {
        serial: "DEMO-0001-0003", name: "AP_DEMO_03", model: "MR46",
        status: "alerting", mac: "aa:bb:cc:dd:ee:03", lanIp: "10.0.0.103",
        firmware: "wireless-30-6", publicIp: "203.0.113.10",
        connectedTo: "DEMO-Switch/Port 3", connectedPort: "3",
        wiredSpeed: "10 Mbps, Half Duplex",
        isMeshRepeater: false, meshParentName: null, powerMode: "low",
        availabilityHistory: makeHistory("flapping"),
        connectionStats: { assoc: 80, auth: 75, dhcp: 60, dns: 55, success: 50, successRate: "62.5%" },
      },
      {
        serial: "DEMO-0001-0004", name: "AP_DEMO_04", model: "MR36",
        status: "alerting", mac: "aa:bb:cc:dd:ee:04", lanIp: null,
        firmware: "wireless-30-6", publicIp: null,
        connectedTo: "AP_DEMO_01 (Mesh)", connectedPort: "—",
        wiredSpeed: "—",
        isMeshRepeater: true, meshParentName: "AP_DEMO_01", powerMode: null,
        availabilityHistory: makeHistory("recently-down"),
        connectionStats: { assoc: 10, auth: 8, dhcp: 5, dns: 3, success: 2, successRate: "20.0%" },
      },
      {
        serial: "DEMO-0001-0005", name: "AP_DEMO_05", model: "MR46",
        status: "offline", mac: "aa:bb:cc:dd:ee:05", lanIp: "10.0.0.105",
        firmware: "wireless-30-6", publicIp: null,
        connectedTo: "DEMO-Switch/Port 5", connectedPort: "5",
        wiredSpeed: "—",
        isMeshRepeater: false, meshParentName: null, powerMode: null,
        availabilityHistory: makeHistory("stable-offline"),
        connectionStats: null,
      },
    ],
  };
}
