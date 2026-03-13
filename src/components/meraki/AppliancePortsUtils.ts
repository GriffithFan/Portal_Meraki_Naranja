/* eslint-disable @typescript-eslint/no-explicit-any */

// ═══════════════════════════════════════════════════════════════
// Constants: model layouts & WAN interface mapping
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_WAN_INTERFACE_MAP: Record<string, number> = {
  wan1: 1, internet1: 1, primary: 1, wan: 1, internet: 1,
  wan2: 2, internet2: 2, secondary: 2,
};

export const MODEL_PORT_LAYOUTS: Record<string, any> = {
  MX84: {
    management: [{ number: "mgmt", displayNumber: "MGMT", overrides: { role: "management", type: "management" } }],
    columns: [
      { label: "Internet", kind: "wan", top: { number: 1, overrides: { role: "wan", type: "wan", enabled: true } }, bottom: { number: 2, overrides: { role: "wan", type: "wan", enabled: true } } },
      { label: "", kind: "lan", top: 3, bottom: 4 },
      { label: "", kind: "lan", top: 5, bottom: 6 },
      { label: "", kind: "lan", top: 7, bottom: 8 },
      { label: "", kind: "lan", top: 9, bottom: 10 },
      { label: "", kind: "sfp", top: { number: 11, overrides: { formFactor: "sfp", type: "sfp" } }, bottom: { number: 12, overrides: { formFactor: "sfp", type: "sfp" } } },
    ],
    interfaceToPort: { wan1: 1, wan2: 2 },
  },
  MX85: {
    management: [{ number: "mgmt", displayNumber: "MGMT", overrides: { role: "management", type: "management" } }],
    columns: [
      { label: "Internet", kind: "wan", top: { number: 1, overrides: { role: "wan", type: "wan", enabled: true } }, bottom: { number: 2, overrides: { role: "wan", type: "wan", enabled: true } } },
      { label: "", kind: "lan", top: 3, bottom: 4 },
      { label: "", kind: "lan", top: 5, bottom: 6 },
      { label: "", kind: "lan", top: 7, bottom: 8 },
      { label: "", kind: "lan", top: 9, bottom: 10 },
      { label: "", kind: "sfp", top: { number: 11, overrides: { formFactor: "sfp", type: "sfp" } }, bottom: { number: 12, overrides: { formFactor: "sfp", type: "sfp" } } },
    ],
    interfaceToPort: { wan1: 1, wan2: 2 },
  },
  MX67: {
    management: [],
    columns: [
      { label: "Internet", kind: "wan", top: { number: 1, overrides: { role: "wan", type: "wan", enabled: true } }, bottom: { number: 2, overrides: { role: "wan", type: "wan", enabled: true } } },
      { label: "", kind: "lan", top: 3, bottom: 4 },
      { label: "", kind: "lan", top: 5, bottom: 6 },
      { label: "", kind: "lan", top: 7, bottom: 8 },
      { label: "", kind: "lan", top: 9, bottom: 10 },
      { label: "", kind: "lan", top: 11, bottom: 12 },
    ],
    interfaceToPort: { wan1: 1, wan2: 2 },
  },
  MX68: {
    management: [],
    columns: [
      { label: "Internet", kind: "wan", top: { number: 1, overrides: { role: "wan", type: "wan", enabled: true } }, bottom: { number: 2, overrides: { role: "wan", type: "wan", enabled: true } } },
      { label: "", kind: "lan", top: 3, bottom: 4 },
      { label: "", kind: "lan", top: 5, bottom: 6 },
      { label: "", kind: "lan", top: 7, bottom: 8 },
      { label: "", kind: "lan", top: 9, bottom: 10 },
      { label: "", kind: "lan", top: 11, bottom: 12 },
    ],
    interfaceToPort: { wan1: 1, wan2: 2 },
  },
  MX65: {
    management: [],
    columns: [
      { label: "Internet", kind: "wan", top: { number: 1, overrides: { role: "wan", type: "wan", enabled: true } }, bottom: { number: 2, overrides: { role: "wan", type: "wan", enabled: true } } },
      { label: "", kind: "lan", top: 3, bottom: 4 },
      { label: "", kind: "lan", top: 5, bottom: 6 },
      { label: "", kind: "lan", top: 7, bottom: 8 },
      { label: "", kind: "lan", top: 9, bottom: 10 },
      { label: "", kind: "lan", top: 11, bottom: 12 },
    ],
    interfaceToPort: { wan1: 1, wan2: 2 },
  },
  Z3: {
    management: [],
    columns: [
      { label: "Internet", kind: "wan", top: { number: 1, overrides: { role: "wan", type: "wan", enabled: true } } },
      { label: "", kind: "lan", top: { number: 2 } },
      { label: "", kind: "lan", top: { number: 3 } },
      { label: "", kind: "lan", top: { number: 4 } },
      { label: "", kind: "lan", top: { number: 5 } },
    ],
    interfaceToPort: { wan1: 1 },
  },
};

// ═══════════════════════════════════════════════════════════════
// Pure utility functions
// ═══════════════════════════════════════════════════════════════

export const getModelLayout = (model = "") => {
  if (!model) return null;
  const n = model.toString().trim().toUpperCase();
  if (n.startsWith("Z3")) return MODEL_PORT_LAYOUTS.Z3;
  if (MODEL_PORT_LAYOUTS[n]) return MODEL_PORT_LAYOUTS[n];
  const prefix = n.replace(/[-\s].*$/, "");
  if (MODEL_PORT_LAYOUTS[prefix]) return MODEL_PORT_LAYOUTS[prefix];
  return null;
};

export const toDescriptor = (value: any) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  return { number: value };
};

export const parsePortNumber = (value: any): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  const numeric = parseInt(value.toString().replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(numeric) ? numeric : null;
};

export const normalizeReachability = (value: any, fallback = "unknown"): string => {
  if (!value) return fallback;
  const text = value.toString().trim().toLowerCase();
  if (!text) return fallback;
  if (/(not\s*connected|disconnected|offline|down|failed|inactive|unplugged|alerting)/.test(text)) return "disconnected";
  if (/(connected|online|up|active|ready|reachable|operational)/.test(text)) return "connected";
  if (/disabled/.test(text)) return "disabled";
  return text;
};

export const collectTokens = (port: any = {}): string[] => {
  const raw = [port.role, port.type, port.purpose, port.name, port.label, port.description, port.assignment, port.medium, port.formFactor, port.portMode, port.connectionType, port.productType, port.status, port.statusNormalized, port.tags, port.notes, port.band];
  return raw.flatMap((t) => { if (!t) return []; if (Array.isArray(t)) return t; return t.toString().split(/[\s,]+/).filter(Boolean); }).map((t: any) => t.toString().toLowerCase());
};

export const createPlaceholderPort = ({ number, displayNumber, label, overrides = {} }: any) => {
  const numeric = parsePortNumber(number);
  return {
    number: numeric ?? number ?? null,
    displayNumber: displayNumber || (numeric === null && number ? number.toString().toUpperCase() : null),
    label: label || null,
    role: (overrides as any).role || "lan",
    type: (overrides as any).type || (overrides as any).role || "lan",
    formFactor: (overrides as any).formFactor,
    enabled: (overrides as any).enabled ?? false,
    status: (overrides as any).status ?? null,
    statusNormalized: (overrides as any).statusNormalized ?? "unknown",
    synthetic: true,
    ...overrides,
  };
};

export const applyUplinkStatus = (port: any, portNumber: number | null, uplinkByPort: Map<number, any>) => {
  if (!port) return port;
  const numeric = portNumber ?? parsePortNumber(port.number);
  if (numeric !== null && uplinkByPort.has(numeric)) {
    const uplink = uplinkByPort.get(numeric)!;
    const normalized = normalizeReachability(uplink.statusNormalized || uplink.status);
    return { ...port, enabled: port.enabled ?? normalized !== "disabled", status: uplink.status || uplink.statusNormalized || normalized, statusNormalized: normalized, uplink, hasCarrier: normalized === "connected", speedLabel: port.speedLabel || uplink.speedLabel || uplink.speed || uplink.throughput || null };
  }
  return { ...port };
};

export const getPortAlias = (port: any, networkName = "", model = "", group = "", deviceCount: any = {}) => {
  if (!port) return "";
  const isUSAP = (networkName && networkName.toUpperCase().includes("USAP")) || (deviceCount.aps > 3 && deviceCount.hasMX);
  const isMX = model && model.toUpperCase().startsWith("MX");
  if (isUSAP && isMX && (group === "wan" || port.role === "wan") && port.number) {
    if (port.number === 1) return "Wan1";
    if (port.number === 2) return "Wan2";
  }
  if (port.uplink?.interface) return port.uplink.interface.toUpperCase();
  if (port.name?.trim()) return port.name;
  if (port.label?.trim()) return port.label;
  if (port.role?.trim()) return port.role;
  return `Puerto ${port.number ?? ""}`.trim();
};

export const formatSpeed = (speed: any): string | null => {
  if (!speed) return null;
  if (typeof speed === "string" && /[a-zA-Z]/.test(speed)) return speed;
  const mbps = Number(speed);
  if (!Number.isFinite(mbps) || mbps <= 0) return speed?.toString() || null;
  if (mbps >= 1000) return `${mbps / 1000} Gbps`;
  return `${mbps} Mbps`;
};

export const buildPortClassName = (port: any, { rotated }: { rotated?: boolean } = {}) => {
  const classes = ["NodePort"];
  const typeText = [port?.formFactor, port?.medium, port?.type].map((i) => (i || "").toString().toLowerCase()).find((i) => i);
  if (typeText && /sfp|fiber/.test(typeText)) classes.push("sfp");
  else if (typeText && /usb/.test(typeText)) classes.push("usb");
  else classes.push("rj45");
  if (rotated) classes.push("rotated");
  if (port?.enabled === false) { classes.push("disabled"); }
  else {
    const normalized = normalizeReachability(port?.statusNormalized || port?.status);
    if (normalized === "warning") { classes.push("warning"); return classes.join(" "); }
    const hasCarrier = port?.hasCarrier === true || normalizeReachability(port?.uplink?.statusNormalized || port?.uplink?.status) === "connected" || normalized === "connected" || /up|ready|active/.test(normalized || "") || (typeof port?.speed === "number" && port.speed > 0) || Boolean(port?.speedLabel);
    if (hasCarrier) classes.push("has_carrier");
    else if (normalized === "disabled") classes.push("disabled");
    else if (/alert|warn|degrad|loss/.test(normalized || "")) classes.push("warning");
    else classes.push("passthrough");
  }
  return classes.join(" ");
};

export const isPoEPort = (port: any, model: string) => {
  if (!port) return false;
  if (port.poeEnabled || port.poe === true || port.poeActive === true || port.poeActivePorts) return true;
  if (model && model.toString().trim().toUpperCase().startsWith("Z3")) {
    const num = parsePortNumber(port.number ?? port.displayNumber);
    if (num === 5) return true;
  }
  return false;
};

// ═══════════════════════════════════════════════════════════════
// buildColumns — core layout algorithm
// ═══════════════════════════════════════════════════════════════

export const buildColumns = (ports: any[] = [], model: string, uplinks: any[] = [], connectedOverrides: any[] = []) => {
  const layout = getModelLayout(model);
  const portByNumber = new Map<number, any>();
  const managementCandidates: any[] = [];
  const connectedSet = new Set((Array.isArray(connectedOverrides) ? connectedOverrides : []).map(Number).filter(Number.isFinite));

  ports.forEach((port) => {
    const copy = { ...port };
    const number = parsePortNumber(copy.number);
    if (number !== null) portByNumber.set(number, copy);
    const tokens = collectTokens(copy);
    if (tokens.some((t) => /manage|mgmt|admin|console/.test(t))) managementCandidates.push(copy);
  });

  const interfaceToPort = { ...DEFAULT_WAN_INTERFACE_MAP, ...(layout?.interfaceToPort || {}) };
  const uplinkByPort = new Map<number, any>();
  uplinks.forEach((uplink) => {
    if (!uplink) return;
    const interfaceKey = uplink.interface ? uplink.interface.toString().toLowerCase() : null;
    let mapped: number | null = null;
    if (uplink.portId !== undefined) mapped = parsePortNumber(uplink.portId);
    if (mapped == null && uplink.port !== undefined) mapped = parsePortNumber(uplink.port);
    if (mapped == null && uplink.portNumber !== undefined) mapped = parsePortNumber(uplink.portNumber);
    if (mapped == null && uplink.number !== undefined) mapped = parsePortNumber(uplink.number);
    if (mapped == null && interfaceKey && interfaceToPort[interfaceKey] !== undefined) mapped = interfaceToPort[interfaceKey];
    if (mapped != null) uplinkByPort.set(mapped, uplink);
  });

  const resolveDescriptor = (descriptor: any, kind = "lan") => {
    const config = toDescriptor(descriptor);
    if (!config) return null;
    const baseRole = kind === "wan" ? "wan" : kind === "management" ? "management" : "lan";
    const overrides = { role: baseRole, type: baseRole, ...(config.overrides || {}) };
    const number = parsePortNumber(config.number);
    let resolved: any = null;
    if (number !== null && portByNumber.has(number)) resolved = { ...portByNumber.get(number) };
    if (!resolved && typeof config.number === "string") { const match = ports.find((p) => p.number?.toString() === config.number.toString()); if (match) resolved = { ...match }; }
    if (!resolved) { resolved = createPlaceholderPort({ number: config.number, displayNumber: config.displayNumber, label: config.label, overrides }); }
    else { resolved = { ...resolved, ...config.overrides }; if (config.displayNumber) resolved.displayNumber = config.displayNumber; if (config.label && !resolved.label) resolved.label = config.label; if (!resolved.role && overrides.role) resolved.role = overrides.role; if (!resolved.type && overrides.type) resolved.type = overrides.type; }
    if (overrides.formFactor && !resolved.formFactor) resolved.formFactor = overrides.formFactor;
    if (!resolved.displayNumber && config.displayNumber) resolved.displayNumber = config.displayNumber;
    const applied = applyUplinkStatus(resolved, parsePortNumber(resolved.number ?? config.number), uplinkByPort);
    const numeric = parsePortNumber(applied.number);
    if (numeric !== null && connectedSet.has(numeric)) return { ...applied, status: applied.status || "connected", statusNormalized: "connected", hasCarrier: true };
    return applied;
  };

  let management = managementCandidates.map((p) => applyUplinkStatus(p, parsePortNumber(p.number), uplinkByPort));
  management = management.map((p) => { const n = parsePortNumber(p.number); if (n !== null && connectedSet.has(n)) return { ...p, status: p.status || "connected", statusNormalized: "connected", hasCarrier: true }; return p; });
  if (!management.length && layout?.management?.length) management = layout.management.map((d: any) => resolveDescriptor(d, "management")).filter(Boolean);
  managementCandidates.forEach((p) => { const n = parsePortNumber(p.number); if (n !== null) portByNumber.delete(n); });

  let columns: any[] = [];
  if (layout) {
    columns = layout.columns.map((col: any) => {
      const kind = col.kind || col.group || "lan";
      return { group: kind === "wan" ? "wan" : "lan", label: col.label || "", kind, top: resolveDescriptor(col.top, kind), bottom: resolveDescriptor(col.bottom, kind) };
    });
  } else {
    const managementNumbers = new Set(managementCandidates.map((p) => p.number?.toString()));
    const classified = ports.filter((p) => !managementNumbers.has(p.number?.toString())).map((p) => applyUplinkStatus({ ...p }, parsePortNumber(p.number), uplinkByPort));
    const wan: any[] = [];
    const others: any[] = [];
    classified.forEach((port) => {
      const tokens = collectTokens(port);
      const number = parsePortNumber(port.number);
      const looksWan = port.isWan === true || port.wanEnabled === true || Boolean(port.uplink) || tokens.some((t) => /wan|uplink|internet|pppoe|primary|secondary/.test(t)) || (number !== null && number <= 2 && !tokens.some((t) => /lan|access/.test(t)));
      if (looksWan) wan.push(port); else others.push(port);
    });
    uplinkByPort.forEach((_uplink, number) => { if (!wan.some((p) => parsePortNumber(p.number) === number)) wan.push(applyUplinkStatus(createPlaceholderPort({ number, overrides: { role: "wan", type: "wan", enabled: true } }), number, uplinkByPort)); });
    connectedSet.forEach((num) => { const already = wan.some((p) => parsePortNumber(p.number) === num) || classified.some((p) => parsePortNumber(p.number) === num); if (!already) wan.push({ ...createPlaceholderPort({ number: num, overrides: { role: "lan", type: "lan", enabled: true } }), status: "connected", statusNormalized: "connected", hasCarrier: true }); });
    const wanSorted = wan.sort((a, b) => (parsePortNumber(a.number) ?? 0) - (parsePortNumber(b.number) ?? 0));
    wanSorted.forEach((port, idx) => { if (idx % 2 === 0) columns.push({ group: "wan", label: columns.some((c: any) => c.group === "wan") ? "" : "Internet", top: port, bottom: wanSorted[idx + 1] || null }); });
    const sortedOthers = others.sort((a, b) => (parsePortNumber(a.number) ?? 0) - (parsePortNumber(b.number) ?? 0));
    const oddLan = sortedOthers.filter((p) => { const n = parsePortNumber(p.number); return n !== null && n % 2 === 1; });
    const evenLan = sortedOthers.filter((p) => { const n = parsePortNumber(p.number); return n !== null && n % 2 === 0; });
    const rows = Math.max(oddLan.length, evenLan.length);
    for (let i = 0; i < rows; i++) columns.push({ group: "lan", label: "", top: oddLan[i] || null, bottom: evenLan[i] || null });
  }
  return { management, columns: columns.filter((c: any) => c.top || c.bottom) };
};
