import type { TopologyResponse } from "@/types/meraki";

/* eslint-disable @typescript-eslint/no-explicit-any -- topology data from Meraki is deeply dynamic */

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  model?: string;
  mac?: string;
  serial?: string;
  status: string;
  switchPort?: number;
  switchPortRaw?: string;
  connectedToPort?: string;
  parentDevice?: string;
  [key: string]: unknown;
}

export interface GraphLink {
  source: string;
  target: string;
  status: string;
  details?: Record<string, unknown>[];
}

export interface TopologyGraph {
  nodes: GraphNode[];
  links: GraphLink[];
}

type StatusMap = Map<string, any>;

/* ── toGraphFromLinkLayer ──────────────────────────────── */

export function toGraphFromLinkLayer(data: TopologyResponse | null, statusMap?: StatusMap): TopologyGraph {
  if (!data || !Array.isArray(data.links)) return { nodes: [], links: [] };

  const nodes = new Map<string, GraphNode>();
  const linkSet = new Set<string>();

  const addNode = (info: any): string | null => {
    if (!info?.serial) return null;
    const id = info.serial;
    if (!nodes.has(id)) {
      const rawSt = statusMap?.get(id);
      const resolvedStatus = (typeof rawSt === "object" && rawSt !== null ? rawSt?.status : rawSt) || info.status || "unknown";
      nodes.set(id, {
        id,
        label: info.name || info.model || id,
        type: (info.model || "").slice(0, 2).toLowerCase(),
        model: info.model,
        mac: info.mac,
        serial: info.serial,
        status: resolvedStatus,
      });
    }
    return id;
  };

  if (Array.isArray(data.nodes)) data.nodes.forEach(addNode);

  for (const link of data.links) {
    if (!link?.ends || link.ends.length < 2) continue;
    const srcDev = link.ends[0]?.device;
    const tgtDev = link.ends[1]?.device;
    const srcPort = link.ends[0]?.discovered?.lldp?.portId ?? link.ends[0]?.discovered?.cdp?.portId ?? link.ends[0]?.node?.portId;
    const tgtPort = link.ends[1]?.discovered?.lldp?.portId ?? link.ends[1]?.discovered?.cdp?.portId ?? link.ends[1]?.node?.portId;

    const srcId = addNode(srcDev);
    const tgtId = addNode(tgtDev);

    if (srcId && tgtId && srcId !== tgtId) {
      if (srcPort && nodes.has(tgtId)) {
        const n = nodes.get(tgtId)!;
        const m = srcPort.toString().match(/\d+/);
        if (m && !n.switchPort) {
          n.switchPort = parseInt(m[0], 10);
          n.switchPortRaw = srcPort;
          n.connectedToPort = srcPort;
          n.parentDevice = srcDev?.name || srcId;
        }
      }
      if (tgtPort && nodes.has(srcId)) {
        const n = nodes.get(srcId)!;
        const m = tgtPort.toString().match(/\d+/);
        if (m && !n.switchPort) {
          n.switchPort = parseInt(m[0], 10);
          n.switchPortRaw = tgtPort;
          n.connectedToPort = tgtPort;
          n.parentDevice = tgtDev?.name || tgtId;
        }
      }
      linkSet.add([srcId, tgtId].sort().join("--"));
    }
  }

  const finalLinks: GraphLink[] = Array.from(linkSet).map((id) => {
    const [source, target] = id.split("--");
    return { source, target, status: "unknown" };
  });
  return { nodes: Array.from(nodes.values()), links: finalLinks };
}

/* ── toGraphFromDiscoveryByDevice ──────────────────────── */

export function toGraphFromDiscoveryByDevice(discovery: any[], statusMap?: StatusMap): TopologyGraph {
  if (!Array.isArray(discovery)) return { nodes: [], links: [] };
  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  const idOf = (x: any) => x?.serial || x?.deviceSerial || x?.mac || x?.neighborMac || x?.neighborSerial || x?.id || x?.name;

  for (const d of discovery) {
    const a = idOf(d) || idOf(d.device) || d.deviceMac || d.deviceId;
    if (!a) continue;
    if (!nodes.has(a)) { const rA = statusMap?.get(a); nodes.set(a, { id: a, label: d?.name || a, type: d?.model || "device", status: (typeof rA === 'object' && rA !== null ? rA?.status : rA) || "unknown" }); }
    for (const n of (d.neighbors || d.neighbours || d.adjacents || [])) {
      const b = idOf(n) || n?.chassisId || n?.systemName || n?.id;
      if (!b) continue;
      if (!nodes.has(b)) { const rB = statusMap?.get(b); nodes.set(b, { id: b, label: n?.name || n?.systemName || b, type: n?.model || "device", status: (typeof rB === 'object' && rB !== null ? rB?.status : rB) || "unknown" }); }
      links.push({ source: a, target: b, status: "unknown" });
    }
  }
  return { nodes: Array.from(nodes.values()), links };
}

/* ── buildTopologyFromLldp (principal) ─────────────────── */

export function buildTopologyFromLldp(
  devices: any[] = [],
  lldpBySerial: Record<string, any> = {},
  statusMap: StatusMap = new Map()
): TopologyGraph {
  const nodes = new Map<string, GraphNode>();
  const links = new Map<string, GraphLink>();

  const normMac = (mac: string) => (mac || "").toLowerCase().replace(/[^0-9a-f]/g, "");
  const slugify = (v: string) => (v || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const deviceBySerial = new Map<string, any>();
  const serialByMac = new Map<string, string>();
  const serialByName = new Map<string, string>();
  const syntheticCache = new Map<string, string>();
  const usedIds = new Set<string>();

  devices.forEach((d) => {
    if (!d?.serial) return;
    deviceBySerial.set(d.serial, d);
    if (d.mac) serialByMac.set(normMac(d.mac), d.serial);
    if (d.name) serialByName.set(d.name.toLowerCase(), d.serial);
    nodes.set(d.serial, {
      id: d.serial,
      label: d.name || d.model || d.serial,
      type: (d.model || "").slice(0, 2).toLowerCase() || "device",
      model: d.model,
      mac: d.mac,
      status: statusMap.get(d.serial) || d.status || "unknown",
    });
  });

  const ensureNode = (id: string, meta: any = {}) => {
    if (!id) return null;
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        label: meta.label || meta.name || meta.systemName || id,
        type: meta.type || "external",
        model: meta.model,
        mac: meta.mac,
        status: statusMap.get(id) || "unknown",
      });
    }
    return nodes.get(id)!;
  };

  const addLink = (src: string, tgt: string, detail?: any) => {
    if (!src || !tgt || src === tgt) return;
    const key = [src, tgt].sort().join("__");
    if (!links.has(key)) links.set(key, { source: src, target: tgt, status: "unknown", details: [] });
    if (detail) links.get(key)!.details!.push(detail);
  };

  const resolveNeighbor = (n: any): string | null => {
    const sc = n.serial || n.deviceId || n.chassisId;
    if (sc && deviceBySerial.has(sc)) return sc;
    const mc = normMac(n.mac || n.macAddress || n.chassisId);
    if (mc && serialByMac.has(mc)) return serialByMac.get(mc)!;
    const nc = (n.systemName || n.name || n.deviceId || "").toLowerCase();
    if (nc && serialByName.has(nc)) return serialByName.get(nc)!;
    return null;
  };

  const makeSyntheticId = (serial: string, localPort: string, n: any): string => {
    const parts = [n.systemName, n.name, n.deviceId, n.chassisId, normMac(n.mac || n.macAddress)].filter(Boolean).map((p) => p.toLowerCase());
    const ck = parts.join("|") || `port:${(n.portId || n.port || "").toLowerCase()}` || `serial:${serial}|${n.protocol || "unknown"}|${localPort || ""}`;
    if (syntheticCache.has(ck)) return syntheticCache.get(ck)!;
    const slug = slugify(parts[0] || n.portId || n.port || n.deviceId || n.systemName || n.chassisId || normMac(n.mac || n.macAddress) || "neighbor").slice(0, 40) || "neighbor";
    let id = `ext-${slug}`;
    let s = 2;
    while (usedIds.has(id) || nodes.has(id)) { id = `ext-${slug}-${s}`; s++; }
    syntheticCache.set(ck, id);
    usedIds.add(id);
    return id;
  };

  for (const [serial, payload] of Object.entries(lldpBySerial)) {
    ensureNode(serial);
    const portRecords: any[] = [];
    if (payload?.ports) portRecords.push(...Object.values(payload.ports));
    if (payload?.interfaces) portRecords.push(...Object.values(payload.interfaces));
    if (Array.isArray(payload?.entries)) portRecords.push(...payload.entries);
    if (Array.isArray(payload?.neighbors)) portRecords.push(...payload.neighbors);

    portRecords.forEach((record) => {
      if (!record) return;
      const localPort = record.portId || record.port || record.interfaceId || record.name;
      const neighbors: any[] = [];
      if (record.lldp) neighbors.push({ ...record.lldp, protocol: "lldp" });
      if (record.cdp) neighbors.push({ ...record.cdp, protocol: "cdp" });
      if (!neighbors.length) neighbors.push({ ...record, protocol: record.protocol || "unknown" });

      neighbors.forEach((n) => {
        if (!n) return;
        const resolved = resolveNeighbor(n);
        let targetId = resolved;

        if (!resolved) {
          targetId = makeSyntheticId(serial, localPort, n);
          ensureNode(targetId!, { label: n.systemName || n.name || n.deviceId || "Neighbor", model: n.platform, mac: n.mac || n.macAddress, type: "external" });
        } else {
          const td = deviceBySerial.get(resolved);
          const tm = td?.model || "";
          if (/^(mx|z\d|utm)/i.test(tm) && (n.portId || n.port)) {
            const rp = n.portId || n.port;
            const pm = rp.toString().match(/\d+/);
            const pn = pm ? pm[0] : rp;
            targetId = `${resolved}-port-${pn}`;
            ensureNode(targetId, { label: `${td.name || tm} Port ${pn}`, model: tm, type: "appliance-port" });
          } else {
            ensureNode(targetId!);
          }
        }

        addLink(serial, targetId!, { protocol: n.protocol || record.protocol || "unknown", localPort, remotePort: n.portId || n.port, remoteName: n.systemName || n.name || n.deviceId });

        if (nodes.has(targetId!) && localPort) {
          const tn = nodes.get(targetId!)!;
          const pm = localPort.toString().match(/\d+/);
          const pn = pm ? parseInt(pm[0], 10) : null;
          if (pn !== null && !tn.switchPort) {
            tn.switchPort = pn;
            tn.switchPortRaw = localPort;
            tn.connectedToPort = localPort;
          }
        }
      });
    });
  }

  const linkList = Array.from(links.values()).map((l) => {
    if (!l.details?.length) delete l.details;
    return l;
  });
  return { nodes: Array.from(nodes.values()), links: linkList };
}
