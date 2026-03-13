/* ── Meraki Domain Types ─────────────────────────────────── */

export interface MerakiOrganization {
  id: string;
  name: string;
  url?: string;
}

export interface MerakiNetwork {
  id: string;
  organizationId: string;
  name: string;
  productTypes?: string[];
  tags?: string[];
  timeZone?: string;
  enrollmentString?: string;
  notes?: string;
  url?: string;
  isBoundToConfigTemplate?: boolean;
}

export interface MerakiDevice {
  serial: string;
  name: string;
  model: string;
  mac: string;
  networkId: string;
  lanIp?: string;
  tags?: string[];
  lat?: number;
  lng?: number;
  address?: string;
  firmware?: string;
  floorPlanId?: string;
  notes?: string;
}

export interface MerakiDeviceStatus {
  serial: string;
  name: string;
  model: string;
  mac: string;
  networkId: string;
  status: string;
  lanIp?: string;
  publicIp?: string;
  lastReportedAt?: string;
  productType?: string;
  gateway?: string;
  primaryDns?: string;
  secondaryDns?: string;
}

/* ── Port Types ──────────────────────────────────────────── */

export interface MerakiPortUsage {
  recv?: number;
  sent?: number;
}

export interface MerakiSwitchPort {
  portId: string;
  name?: string;
  enabled?: boolean;
  poeEnabled?: boolean;
  type?: string;
  vlan?: number;
  voiceVlan?: number;
  allowedVlans?: string;
  accessPolicyType?: string;
  linkNegotiation?: string;
  rstpEnabled?: boolean;
  stpGuard?: string;
  tags?: string[];
  mode?: string;
}

export interface MerakiSwitchPortStatus {
  portId: string;
  enabled: boolean;
  status: string;
  speed?: string;
  duplex?: string;
  clientCount?: number;
  trafficInKbps?: { recv?: number; sent?: number };
  usageInKb?: MerakiPortUsage;
  poe?: { isAllocated?: boolean };
  lldp?: Record<string, string>;
  cdp?: Record<string, string>;
  warnings?: string[];
  errors?: string[];
  isUplink?: boolean;
}

export interface MerakiAppliancePort {
  number: number;
  enabled: boolean;
  type: string;
  dropUntaggedTraffic?: boolean;
  vlan?: number;
  allowedVlans?: string;
  accessPolicy?: string;
  peerSgtCapable?: boolean;
}

export interface MerakiAppliancePortStatus {
  number?: number;
  portId?: string;
  enabled: boolean;
  status: string;
  speed?: string;
  duplex?: string;
  usageInKb?: MerakiPortUsage;
  role?: string;
  type?: string;
  alias?: string;
  name?: string;
  wiredSpeed?: string;
  statusNormalized?: string;
  connectedDevice?: {
    deviceName: string;
    deviceSerial: string;
    deviceType: string;
  };
}

/* ── Topology Types ──────────────────────────────────────── */

export interface TopologyNode {
  id: string;
  serial?: string;
  name?: string;
  model?: string;
  mac?: string;
  label?: string;
  type?: string;
  status?: string;
}

export interface TopologyLink {
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  ends?: TopologyLinkEnd[];
}

export interface TopologyLinkEnd {
  device?: MerakiDevice;
  node?: { portId?: string };
  discovered?: {
    lldp?: { portId?: string };
    cdp?: { portId?: string };
  };
}

export interface TopologyResponse {
  nodes?: TopologyNode[];
  links?: TopologyLink[];
}

/* ── Wireless Types ──────────────────────────────────────── */

export interface WirelessConnectionStats {
  assoc?: number;
  auth?: number;
  dhcp?: number;
  dns?: number;
  success?: number;
}

export interface WirelessSSID {
  number: number;
  name: string;
  enabled: boolean;
  splashPage?: string;
  authMode?: string;
  encryptionMode?: string;
  bandSelection?: string;
  minBitrate?: number;
}

/* ── Appliance Types ─────────────────────────────────────── */

export interface ApplianceUplinkStatus {
  serial: string;
  model: string;
  networkId: string;
  uplinks: ApplianceUplink[];
}

export interface ApplianceUplink {
  interface: string;
  status: string;
  ip?: string;
  gateway?: string;
  publicIp?: string;
  dns?: string;
  primaryDns?: string;
  secondaryDns?: string;
}

export interface AppliancePerformance {
  perfScore: number;
}

export interface LossAndLatencyEntry {
  startTime: string;
  endTime: string;
  lossPercent: number;
  latencyMs: number;
  goodput?: number;
  jitter?: number;
}

/* ── Security Types ──────────────────────────────────────── */

export interface SecurityIntrusionSettings {
  mode: string;
  idsRulesets: string;
  protectedNetworks?: {
    useDefault: boolean;
    includedCidr?: string[];
    excludedCidr?: string[];
  };
}

export interface SecurityMalwareSettings {
  mode: string;
  allowedUrls?: { url: string; comment?: string }[];
  allowedFiles?: { sha256: string; comment?: string }[];
}

/* ── VLAN Types ──────────────────────────────────────────── */

export interface MerakiVlan {
  id: number;
  networkId: string;
  name: string;
  applianceIp?: string;
  subnet?: string;
  dhcpHandling?: string;
  dhcpLeaseTime?: string;
  dnsNameservers?: string;
  fixedIpAssignments?: Record<string, { ip: string; name?: string }>;
  reservedIpRanges?: { start: string; end: string; comment?: string }[];
}

/* ── Firewall Types ──────────────────────────────────────── */

export interface FirewallRule {
  comment?: string;
  policy: string;
  protocol: string;
  destPort?: string;
  destCidr: string;
  srcPort?: string;
  srcCidr: string;
  syslogEnabled?: boolean;
}

/* ── DHCP Types ──────────────────────────────────────────── */

export interface DhcpSubnet {
  subnet: string;
  vlanId: number;
  usedCount: number;
  freeCount: number;
}

/* ── Client Types ────────────────────────────────────────── */

export interface MerakiClient {
  id: string;
  mac: string;
  description?: string;
  ip?: string;
  vlan?: number;
  switchport?: string;
  usage?: { recv: number; sent: number };
  user?: string;
  dhcpHostname?: string;
  mdnsName?: string;
}

/* ── Live Tools Types ────────────────────────────────────── */

export interface PingResult {
  pingId: string;
  status: string;
  request: { serial: string; target: string; count: number };
  results?: {
    sent: number;
    received: number;
    loss: { percentage: number };
    latencies?: { minimum: number; average: number; maximum: number };
    replies?: { sequenceId: number; size: number; latency: number }[];
  };
}

export interface CableTestResult {
  cableTestId: string;
  status: string;
  request: { serial: string; ports: string[] };
  results?: {
    port: string;
    speedMbps?: number;
    pairs?: { index: number; status: string; lengthMeters?: number }[];
    error?: string;
  }[];
}
