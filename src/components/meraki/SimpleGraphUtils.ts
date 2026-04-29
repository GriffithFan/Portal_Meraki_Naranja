/* eslint-disable @typescript-eslint/no-explicit-any */

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

export const KIND_ORDER: Record<string, number> = {
  external: 0, appliance: 1, gateway: 1, switch: 2, bridge: 3, ap: 4, camera: 5, sensor: 6, device: 7,
};

export const STATUS_COLOR: Record<string, string> = {
  online: "#45991f", connected: "#45991f", ready: "#45991f",
  alerting: "#f59e0b", warning: "#f59e0b", degraded: "#f59e0b",
  offline: "#e74c3c", down: "#e74c3c",
};

const SERIAL_PATTERN = /^[A-Z0-9]{2,}(?:-[A-Z0-9]{2,}){2,}$/i;

// ═══════════════════════════════════════════════════════════════
// Pure utility functions
// ═══════════════════════════════════════════════════════════════

export const looksLikeSerial = (value: any): boolean => {
  if (!value) return false;
  const text = value.toString().trim();
  if (!text) return false;
  if (SERIAL_PATTERN.test(text)) return true;
  const compact = text.replace(/[^a-z0-9]/gi, "");
  return compact.length >= 10 && /[a-z]/i.test(compact) && /\d/.test(compact);
};

export const computeNodeLabels = (node: any = {}) => {
  const meta = node.meta || {};
  const serial = (node.serial || meta.serial || node.id || "").toString().trim();
  const mac = (node.mac || meta.mac || "").toString().trim();
  const modelLower = (node.model || meta.model || "").toString().toLowerCase();

  const isZ3Utm = modelLower.startsWith("z") || modelLower.includes("utm") || modelLower.includes("z3") || modelLower.includes("z4") || modelLower.includes("teleworker") || modelLower.startsWith("mx");

  const nameCandidates = [node.name, meta.name, node.label, meta.description, node.model, meta.model, node.productType, Array.isArray(node.productTypes) ? node.productTypes[0] : null]
    .map((c: any) => (c || "").toString().trim())
    .filter(Boolean);

  let primary = nameCandidates.find((c: string) => c && !looksLikeSerial(c) && c !== serial);
  if (!primary) {
    if (isZ3Utm && mac) primary = mac;
    else primary = serial || node.label || node.model || node.id || "Device";
  }

  let secondary: string | null = null;
  let tertiary: string | null = null;

  if (node.kind !== "external") {
    if (serial && serial !== primary && !looksLikeSerial(primary)) {
      secondary = `S: ${serial}`;
      if (mac && mac !== primary && mac !== serial) tertiary = `M: ${mac}`;
    } else if (mac && mac !== primary) {
      secondary = `M: ${mac}`;
    }
  }

  if (secondary === primary) secondary = null;
  if (tertiary === primary || tertiary === secondary) tertiary = null;

  return { primary, secondary, tertiary };
};

export const classifyKind = (node: any = {}): string => {
  const rawType = (node.type || "").toLowerCase();
  const modelLower = (node.model || "").toString().toLowerCase();
  const productType = (node.productType || "").toString().toLowerCase();
  const productTypes = Array.isArray(node.productTypes) ? node.productTypes.map((i: any) => i.toString().toLowerCase()) : [];
  const metaProductTypes = Array.isArray(node.meta?.productTypes) ? node.meta.productTypes.map((i: any) => i.toString().toLowerCase()) : [];
  const tags = Array.isArray(node.meta?.tags) ? node.meta.tags.map((t: any) => t.toString().toLowerCase()) : [];

  const text = [node.model, node.label, node.name, node.id, node.serial, rawType, productType, ...productTypes, ...metaProductTypes, ...tags].filter(Boolean).join(" ").toLowerCase();

  if (rawType === "external" || text.includes("wan") || text.includes("internet")) return "external";
  if (modelLower.startsWith("mx") || text.includes("gateway") || text.includes("gtw")) return "gateway";
  if (modelLower.startsWith("ms") || text.includes("switch")) return "switch";
  if (modelLower.startsWith("mr") || text.includes("access point") || text.includes("ap_") || text.includes(" mr")) return "ap";
  if (modelLower.startsWith("mv") || text.includes("camera")) return "camera";
  if (modelLower.startsWith("mt") || text.includes("sensor")) return "sensor";
  if (modelLower.startsWith("z") || text.includes("z3") || text.includes("z4") || text.includes("utm") || text.includes("teleworker") || text.includes("security appliance")) return "appliance";
  if (rawType === "mx") return "gateway";
  if (rawType === "ms") return "switch";
  if (rawType === "mr") return "ap";
  if (productType === "gateway" || productTypes.includes("gateway") || metaProductTypes.includes("gateway")) return "gateway";
  if (productType === "appliance" || productTypes.includes("appliance") || metaProductTypes.includes("appliance")) return "appliance";
  if (productType === "switch" || productTypes.includes("switch") || metaProductTypes.includes("switch")) return "switch";
  if (productType === "wireless" || productTypes.includes("wireless")) return "ap";
  return rawType || "device";
};

export const cmpNodes = (nodeLookup: Map<string, any>) => (aId: string, bId: string): number => {
  const a = nodeLookup.get(aId) || {};
  const b = nodeLookup.get(bId) || {};
  if (a.switchPort != null && b.switchPort != null) return a.switchPort - b.switchPort;
  if (a.switchPort != null) return -1;
  if (b.switchPort != null) return 1;
  const orderA = KIND_ORDER[a.kind || "device"] ?? KIND_ORDER.device;
  const orderB = KIND_ORDER[b.kind || "device"] ?? KIND_ORDER.device;
  if (orderA !== orderB) return orderA - orderB;
  const labelA = (a.label || a.id || "").toLowerCase();
  const labelB = (b.label || b.id || "").toLowerCase();
  return labelA.localeCompare(labelB, undefined, { numeric: true, sensitivity: "base" });
};

export const statusColorOf = (status: any): string => STATUS_COLOR[status?.toLowerCase?.()] || "#7f8c8d";

export const resolveNodeOverlap = (nodes: any[] = []) => {
  const buckets = new Map<string, any[]>();
  nodes.forEach((node) => {
    const key = `${Math.round(node.x)}:${Math.round(node.y)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(node);
  });
  buckets.forEach((group) => {
    if (!group || group.length < 2) return;
    if (group.some((n) => n.kind === "switch")) return;
    const step = group.length > 5 ? 20 : 30;
    const center = (group.length - 1) / 2;
    group.sort((a, b) => (a.level - b.level) || a.id.localeCompare(b.id));
    group.forEach((node, index) => { node.y += (index - center) * step; });
  });
};

export const getNodeDimensions = (node: any = {}) => {
  if (node.kind === "appliance" || node.kind === "gateway") return { width: 70, height: 42 };
  if (node.kind === "switch" || node.kind === "bridge") return { width: 84, height: 49 };
  if (node.kind === "camera") return { width: 56, height: 39 };
  if (node.kind === "sensor") return { width: 56, height: 56 };
  if (node.kind === "external") return { width: 35, height: 35 };
  return { width: 49, height: 49 };
};

export const anchorForNode = (node: any, direction = 1) => {
  const { width } = getNodeDimensions(node);
  const nodeScale = node?.scale || 1;
  const padding = 18;
  const offset = (width * nodeScale) / 2 + padding * nodeScale;
  return { x: node.x + direction * offset, y: node.y };
};

export const buildLinkPath = (source: any, target: any): string => {
  if (!source || !target) return "";
  const direction = source.x <= target.x ? 1 : -1;
  const start = anchorForNode(source, direction);
  const end = anchorForNode(target, -direction);
  const dx = Math.abs(end.x - start.x);
  const controlDistance = Math.max(60, dx / 2);
  const dy = end.y - start.y;
  const curvature = dy * 0.25;
  return `M ${start.x} ${start.y} C ${start.x + direction * controlDistance} ${start.y + curvature}, ${end.x - direction * controlDistance} ${end.y - curvature}, ${end.x} ${end.y}`;
};

const estimateLabelBounds = (node: any, apCount: number): { top: number; bottom: number } => {
  if (node.kind === "external") return { top: -18, bottom: 36 };
  const { primary, secondary, tertiary } = computeNodeLabels(node);
  const offsets = apCount <= 4 ? [-76, -48, -24]
    : apCount <= 6 ? [-84, -52, -28]
      : apCount <= 8 ? [-60, -35, -10]
        : apCount <= 12 ? [-65, -40, -15]
          : apCount <= 20 ? [-70, -45, -20]
            : apCount <= 30 ? [-85, -55, -25]
              : apCount <= 40 ? [-95, -65, -35]
                : apCount <= 60 ? [-110, -75, -40]
                  : [-125, -90, -55];
  const visibleOffsets = [primary, secondary, tertiary]
    .map((value, index) => (value ? offsets[index] : null))
    .filter((value): value is number => value !== null);
  if (!visibleOffsets.length) return { top: -28, bottom: 28 };
  return {
    top: Math.min(...visibleOffsets) - 16,
    bottom: Math.max(...visibleOffsets) + 8,
  };
};

const estimateNodeFootprint = (node: any, apCount: number): { top: number; bottom: number } => {
  const dims = getNodeDimensions(node);
  const scale = node?.scale || 1;
  const labelBounds = estimateLabelBounds(node, apCount);
  const iconHalf = (dims.height * scale) / 2;
  return {
    top: node.y + Math.min(labelBounds.top, -iconHalf - 12),
    bottom: node.y + iconHalf + 22,
  };
};

const improveColumnVisibility = (nodes: any[], apCount: number) => {
  const columns = new Map<number, any[]>();
  nodes.forEach((node) => {
    if (node.kind === "external") return;
    const key = Math.round(node.x / 80) * 80;
    if (!columns.has(key)) columns.set(key, []);
    columns.get(key)!.push(node);
  });

  columns.forEach((columnNodes) => {
    if (columnNodes.length < 2) return;
    columnNodes.sort((a, b) => a.y - b.y);
    let previousBottom = -Infinity;
    columnNodes.forEach((node) => {
      const bounds = estimateNodeFootprint(node, apCount);
      const minGap = apCount <= 8 ? 18 : apCount <= 20 ? 16 : 14;
      const neededTop = previousBottom + minGap;
      if (bounds.top < neededTop) {
        const delta = neededTop - bounds.top;
        node.y += delta;
      }
      previousBottom = estimateNodeFootprint(node, apCount).bottom;
    });
  });
};

// ═══════════════════════════════════════════════════════════════
// buildLayout — core graph layout algorithm
// ═══════════════════════════════════════════════════════════════

export const buildLayout = (graph: any, deviceMap: Map<string, any> = new Map()) => {
  const rawNodes: any[] = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const rawLinks: any[] = Array.isArray(graph?.links) ? graph.links : [];
  if (!rawNodes.length) return { nodes: [], links: [], width: 560, height: 320 };

  const nodeMap = new Map<string, any>();
  rawNodes.forEach((node) => {
    const id = node?.id || node?.serial;
    if (!id) return;
    const serial = (node.serial || id).toString().trim();
    const serialUpper = serial.toUpperCase();
    const meta = deviceMap.get(serialUpper) || deviceMap.get(serial) || null;
    const metaProductTypesRaw = meta?.productTypes || meta?.productType || null;
    const metaProductTypes = Array.isArray(metaProductTypesRaw) ? metaProductTypesRaw : metaProductTypesRaw ? [metaProductTypesRaw] : [];
    const model = node.model || meta?.model || null;
    const name = node.name || meta?.name || null;
    const productType = node.productType || meta?.productType || (metaProductTypes.length ? metaProductTypes[0] : null);
    const productTypes = node.productTypes || metaProductTypes;
    const label = node.label || name || model || serial || id;
    const enriched = { ...node, id, serial, label, name, model, productType, productTypes, meta };
    const kind = classifyKind(enriched);
    nodeMap.set(id, { ...enriched, kind });
  });

  if (!nodeMap.size) return { nodes: [], links: [], width: 560, height: 320 };

  const adjacency = new Map<string, Set<string>>();
  const ensureAdj = (id: string) => { if (!adjacency.has(id)) adjacency.set(id, new Set()); return adjacency.get(id)!; };
  rawLinks.forEach((link) => { const s = link?.source; const t = link?.target; if (!nodeMap.has(s) || !nodeMap.has(t)) return; ensureAdj(s).add(t); ensureAdj(t).add(s); });
  nodeMap.forEach((_, id) => ensureAdj(id));

  const pickRoot = () => {
    const nodes = Array.from(nodeMap.values());
    const degreeOf = (id: string) => ensureAdj(id).size;
    const byDegreeDesc = (a: any, b: any) => degreeOf(b.id) - degreeOf(a.id);
    const isApplianceLike = (n: any) => { const text = [n.kind, n.type, n.model, n.label, n.id].filter(Boolean).join(" ").toLowerCase(); return n.kind === "appliance" || n.kind === "gateway" || /\b(mx|utm|z[23]|teleworker|security\s*appliance)\b/.test(text); };
    const appliances = nodes.filter((n) => isApplianceLike(n) && degreeOf(n.id) > 0);
    if (appliances.length) { appliances.sort(byDegreeDesc); return appliances[0]; }
    for (const kind of ["appliance", "gateway", "switch"]) { const c = nodes.find((n) => n.kind === kind && degreeOf(n.id) > 0); if (c) return c; }
    return nodes.sort(byDegreeDesc)[0];
  };

  const rootNode = pickRoot();
  if (!rootNode) return { nodes: [], links: [], width: 560, height: 320 };
  ensureAdj(rootNode.id);

  if (!Array.from(nodeMap.values()).some((n) => n.kind === "external")) {
    let externalId = "__external__"; let idx = 1;
    while (nodeMap.has(externalId)) externalId = `__external_${idx++}`;
    nodeMap.set(externalId, { id: externalId, label: "Internet", kind: "external", status: "online", synthetic: true });
    ensureAdj(externalId).add(rootNode.id); ensureAdj(rootNode.id).add(externalId);
  }

  const depth = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const queue = [rootNode.id];
  depth.set(rootNode.id, 0); parent.set(rootNode.id, null);
  while (queue.length) {
    const current = queue.shift()!;
    (adjacency.get(current) || new Set()).forEach((neighbor) => {
      if (depth.has(neighbor)) return;
      depth.set(neighbor, (depth.get(current) || 0) + 1);
      parent.set(neighbor, current); queue.push(neighbor);
    });
  }
  nodeMap.forEach((_, id) => { if (!depth.has(id)) { depth.set(id, 1); parent.set(id, rootNode.id); } });
  depth.forEach((_, id) => { const n = nodeMap.get(id); if (n?.kind === "external") depth.set(id, -1); });

  const children = new Map<string, string[]>();
  parent.forEach((pId, id) => { if (pId == null) return; if (!children.has(pId)) children.set(pId, []); children.get(pId)!.push(id); });
  const compare = cmpNodes(nodeMap);
  children.forEach((kids) => kids.sort(compare));

  const yPositions = new Map<string, number>();
  let nextLeafY = 50;
  const apCount = Array.from(nodeMap.values()).filter((n) => n.kind === "ap").length;
  const totalDevices = nodeMap.size;

  let scaleFactor = 1.0;
  let yGap = 75;
  if (apCount <= 4) { scaleFactor = 0.85; yGap = 140; }
  else if (apCount <= 6) { scaleFactor = 0.9; yGap = 150; }
  else if (apCount <= 12) { scaleFactor = 0.85; yGap = 120; }
  else if (apCount <= 20) { scaleFactor = 1.0; yGap = 140; }
  else if (apCount <= 40) { scaleFactor = 1.2; yGap = 180; }
  else if (apCount <= 60) { scaleFactor = 1.3; yGap = 220; }
  else { scaleFactor = 1.5; yGap = 270; }

  const assignY = (id: string): number => {
    const node = nodeMap.get(id);
    const kids = children.get(id) || [];
    if (node?.switchPort != null && node?.kind === "switch") {
      const y = nextLeafY; yPositions.set(id, y); nextLeafY += yGap;
      kids.forEach((kidId) => assignY(kidId)); return y;
    }
    if (!kids.length) { const y = nextLeafY; yPositions.set(id, y); nextLeafY += yGap; return y; }
    const acc = kids.map(assignY);
    const y = acc.reduce((s, v) => s + v, 0) / acc.length;
    yPositions.set(id, y); return y;
  };
  assignY(rootNode.id);

  const allSwitches = Array.from(nodeMap.entries())
    .filter(([, n]) => n.kind === "switch")
    .map(([id, n]) => ({ id, label: n.label || "" }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const switchesToAlignLater = new Set(allSwitches.slice(1).map((sw) => sw.id));

  const backboneKinds = new Set(["appliance", "gateway", "switch", "bridge"]);
  const alignBackbone = (id: string) => {
    const kids = children.get(id) || [];
    if (!kids.length) return;
    const parentNode = nodeMap.get(id);
    const backboneKids = kids.filter((cId) => backboneKinds.has(nodeMap.get(cId)?.kind));
    if (backboneKids.length === 1) {
      const childId = backboneKids[0];
      const childNode = nodeMap.get(childId);
      if (childNode?.switchPort != null) { /* skip */ }
      else if (switchesToAlignLater.has(childId)) { /* skip */ }
      else if (parentNode && childNode && backboneKinds.has(parentNode.kind)) {
        const parentY = yPositions.get(id);
        if (parentY !== undefined) yPositions.set(childId, parentY);
      }
    }
    kids.forEach((cId) => alignBackbone(cId));
  };
  alignBackbone(rootNode.id);

  nodeMap.forEach((_, id) => {
    if (!yPositions.has(id)) {
      const pId = parent.get(id);
      yPositions.set(id, pId ? (yPositions.get(pId) || nextLeafY) : nextLeafY);
      if (!pId) nextLeafY += yGap;
    }
  });

  const shiftSubtree = (nodeId: string, delta: number) => {
    if (!delta) return;
    yPositions.set(nodeId, (yPositions.get(nodeId) || 0) + delta);
    (children.get(nodeId) || []).forEach((cId) => shiftSubtree(cId, delta));
  };

  const getMaxY = (nodeId: string): number => {
    const nodeY = yPositions.get(nodeId) || 0;
    const kids = children.get(nodeId) || [];
    if (!kids.length) return nodeY;
    return Math.max(nodeY, Math.max(...kids.map(getMaxY)));
  };

  const enforceSiblingSpacing = (nodeId: string) => {
    const kids = (children.get(nodeId) || []).slice();
    if (!kids.length) return;
    kids.sort((a, b) => (yPositions.get(a) || 0) - (yPositions.get(b) || 0));
    const minSpacing = apCount <= 6 ? 120 : 55;
    for (let i = 1; i < kids.length; i++) {
      const prevMaxY = getMaxY(kids[i - 1]);
      const currentY = yPositions.get(kids[i]) || 0;
      const gap = currentY - prevMaxY;
      if (gap < minSpacing) shiftSubtree(kids[i], minSpacing - gap);
    }
    kids.forEach((cId) => enforceSiblingSpacing(cId));
  };
  enforceSiblingSpacing(rootNode.id);

  const levels = Array.from(depth.values());
  const minLevel = Math.min(...levels);
  const maxLevel = Math.max(...levels);
  const deviceLevels = maxLevel - minLevel + 1;
  let xGap = 700;
  if (deviceLevels <= 3) xGap = 650;
  if (deviceLevels >= 5) xGap = 750;
  const marginX = 40;

  const layoutNodes: any[] = [];
  depth.forEach((lvl, id) => {
    const node = nodeMap.get(id);
    if (!node) return;
    const x = marginX + (lvl - minLevel) * xGap;
    const y = yPositions.get(id) ?? marginX;
    layoutNodes.push({ ...node, level: lvl, x, y, parentId: parent.get(id), scale: scaleFactor });
  });

  // Redistribute children of all switches above/below
  allSwitches.forEach((switchInfo) => {
    const switchLayout = layoutNodes.find((n) => n.id === switchInfo.id);
    const switchKids = children.get(switchInfo.id) || [];
    if (switchLayout && switchKids.length > 0) {
      const switchY = switchLayout.y;
      const halfKids = Math.floor(switchKids.length / 2);
      let newY = switchY - halfKids * yGap;
      const newPositions = new Map<string, number>();
      for (let i = 0; i < switchKids.length; i++) {
        newPositions.set(switchKids[i], newY);
        newY += yGap;
        if (i === halfKids - 1) newY += yGap;
      }
      layoutNodes.forEach((node) => {
        if (newPositions.has(node.id)) {
          const oldY = node.y;
          node.y = newPositions.get(node.id)!;
          const delta = node.y - oldY;
          if (delta !== 0) {
            layoutNodes.filter((n) => {
              let curr = n.parentId;
              while (curr) { if (curr === node.id) return true; const pn = layoutNodes.find((p) => p.id === curr); curr = pn?.parentId; }
              return false;
            }).forEach((d) => { d.y += delta; });
          }
        }
      });
    }
  });

  const rootLayout = layoutNodes.find((n) => n.id === rootNode.id);
  if (rootLayout) {
    const externalNodes = layoutNodes.filter((n) => n.kind === "external");
    if (externalNodes.length) {
      const externalGap = 44;
      externalNodes.forEach((node, index) => { node.x = rootLayout.x - 170; node.y = rootLayout.y + (index - (externalNodes.length - 1) / 2) * externalGap; });
    }
    const applianceChildren = layoutNodes.filter((n) => (n.kind === "appliance" || n.kind === "gateway") && n.parentId === rootNode.id);
    if (applianceChildren.length) {
      const gapY = 32;
      const startY = rootLayout.y - ((applianceChildren.length - 1) * gapY) / 2;
      applianceChildren.forEach((node, index) => { node.x = rootLayout.x + xGap; node.y = startY + index * gapY; });
    }
  }

  resolveNodeOverlap(layoutNodes);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  layoutNodes.forEach((n) => { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y); });

  const paddingLeft = 30, paddingRight = 250, paddingTop = apCount <= 8 ? 165 : 155, paddingBottom = 200;
  const shiftX = paddingLeft - minX;
  let shiftY = paddingTop - minY;
  const isGAPorGTW = layoutNodes.some((n) => n.kind === "gateway" || n.model?.toUpperCase().includes("Z3"));
  const apCountForMargin = layoutNodes.filter((n) => n.kind === "ap").length;
  if (isGAPorGTW && apCountForMargin === 1) shiftY += 40;
  layoutNodes.forEach((n) => { n.x += shiftX; n.y += shiftY; });

  // Align first switch with MX/UTM
  const firstSwitch = allSwitches.length > 0 ? allSwitches[0].id : null;
  if (firstSwitch) {
    const fsLayout = layoutNodes.find((n) => n.id === firstSwitch);
    const fsParent = parent.get(firstSwitch);
    const pLayout = fsParent ? layoutNodes.find((n) => n.id === fsParent) : null;
    if (fsLayout && pLayout) {
      const deltaY = pLayout.y - fsLayout.y;
      if (deltaY !== 0) {
        const toMove = new Set<string>();
        const addDesc = (nId: string) => { toMove.add(nId); (children.get(nId) || []).forEach(addDesc); };
        addDesc(firstSwitch);
        layoutNodes.forEach((n) => { if (toMove.has(n.id)) n.y += deltaY; });
      }
    }
  }

  improveColumnVisibility(layoutNodes, apCount);

  minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
  layoutNodes.forEach((n) => { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y); });
  const width = maxX - minX + paddingLeft + paddingRight;
  const height = maxY - minY + paddingBottom;

  layoutNodes.sort((a, b) => (a.level - b.level) || compare(a.id, b.id));
  const lookup = new Map(layoutNodes.map((n) => [n.id, n]));
  const layoutLinks: any[] = [];
  parent.forEach((pId, id) => {
    if (pId == null) return;
    const source = lookup.get(pId);
    const target = lookup.get(id);
    if (source && target) layoutLinks.push({ source, target });
  });

  return { nodes: layoutNodes, links: layoutLinks, width, height, viewBoxX: minX - paddingLeft, viewBoxY: minY - paddingTop, scaleFactor, apCount, totalDevices };
};
