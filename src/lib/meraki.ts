import "server-only";
import axios, { AxiosInstance } from "axios";

const MERAKI_API_KEY = process.env.MERAKI_API_KEY || "";
const BASE_URL = process.env.MERAKI_BASE_URL || "https://api.meraki.com/api/v1";

const client: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    "X-Cisco-Meraki-API-Key": MERAKI_API_KEY,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

/* ── Retry automático para 429 (Meraki rate limit: 10 req/s) ──── */
client.interceptors.response.use(undefined, async (error) => {
  const config = error.config;
  if (!config || !error.response || error.response.status !== 429) {
    return Promise.reject(error);
  }
  const attempt = (config.__retryCount || 0) + 1;
  if (attempt > 3) return Promise.reject(error);
  config.__retryCount = attempt;
  const retryAfter = parseInt(error.response.headers["retry-after"] || "1", 10);
  const delayMs = Math.max(retryAfter, 1) * 1000;
  await new Promise((r) => setTimeout(r, delayMs));
  return client(config);
});

/* ── Paginación ───────────────────────────────────────── */

function parseNextCursor(linkHeader: string | string[] | undefined): string | null {
  if (!linkHeader) return null;
  const source = Array.isArray(linkHeader) ? linkHeader.join(",") : linkHeader;
  for (const segment of source.split(",")) {
    const [rawUrl, ...rest] = segment.split(";").map((p) => p.trim());
    if (!rawUrl) continue;
    if (!rest.some((item) => /rel="?next"?/i.test(item))) continue;
    const match = rawUrl.match(/startingAfter=([^&>]+)/i) ?? rawUrl.match(/starting_after=([^&>]+)/i);
    if (match?.[1]) {
      try { return decodeURIComponent(match[1]); } catch { return match[1]; }
    }
  }
  return null;
}

function getNextCursorFromHeaders(headers: Record<string, string> = {}): string | null {
  const direct =
    headers["x-next-page-starting-after"] ??
    headers["x-next-starting-after"] ??
    headers["x-next-page-cursor"] ??
    headers["x-page-next"];
  if (direct) return direct;
  return parseNextCursor(headers.link ?? headers.Link);
}

async function fetchAllPages<T = unknown>(
  path: string,
  params: Record<string, unknown> = {},
  opts: { perPage?: number; maxPages?: number; timeoutMs?: number } = {}
): Promise<T[]> {
  const { perPage = 1000, maxPages = 100, timeoutMs = 60_000 } = opts;
  const results: T[] = [];
  let cursor = params.startingAfter as string | undefined;
  let page = 0;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    while (page < maxPages) {
      const query: Record<string, unknown> = { ...params, perPage };
      if (cursor) query.startingAfter = cursor;

      const { data, headers } = await client.get(path, {
        params: query,
        signal: controller.signal,
      });

      if (Array.isArray(data)) results.push(...data);
      else if (data?.items && Array.isArray(data.items)) results.push(...data.items);
      else if (data) results.push(data);

      const next = getNextCursorFromHeaders(headers as Record<string, string>);
      if (!next || next === cursor) break;
      cursor = next;
      page++;
    }
  } finally {
    clearTimeout(timer);
  }
  return results;
}

/* ── Helper seguro ─────────────────────────────────────── */

async function safeGet<T = unknown>(path: string, params: Record<string, unknown> = {}, fallback: T | null = null): Promise<T | null> {
  try {
    const { data } = await client.get(path, { params });
    return data as T;
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    if (status !== 404 && status !== 400) {
      console.error(`[Meraki] safeGet ${path} failed (${status ?? "unknown"}):`, axios.isAxiosError(err) ? err.message : err);
    }
    return fallback;
  }
}

/* ── Organizations ─────────────────────────────────────── */

export async function getOrganizations() {
  const { data } = await client.get("/organizations");
  return data;
}

/* ── Networks ──────────────────────────────────────────── */

export async function getNetworks(orgId: string) {
  return fetchAllPages(`/organizations/${orgId}/networks`);
}

export async function getNetworkInfo(networkId: string) {
  const { data } = await client.get(`/networks/${networkId}`);
  return data;
}

export async function getNetworkDevices(networkId: string) {
  const { data } = await client.get(`/networks/${networkId}/devices`);
  return data;
}

/* ── Devices / Statuses ───────────────────────────────── */

export async function getOrganizationDevicesStatuses(orgId: string, params: Record<string, unknown> = {}) {
  return fetchAllPages(`/organizations/${orgId}/devices/statuses`, params);
}

/* ── Topology ──────────────────────────────────────────── */

export async function getNetworkTopologyLinkLayer(networkId: string) {
  const { data } = await client.get(`/networks/${networkId}/topology/linkLayer`);
  return data;
}

export async function getOrgSwitchPortsTopologyDiscoveryByDevice(orgId: string) {
  const { data } = await client.get(`/organizations/${orgId}/switch/ports/topology/discovery/byDevice`);
  return data;
}

/* ── LLDP / CDP ────────────────────────────────────────── */

export async function getDeviceLldpCdp(serial: string) {
  // Try primary endpoint; if it 404s, try legacy endpoint
  const primary = await safeGet(`/devices/${serial}/lldpCdp`);
  if (primary !== null) return primary;
  return safeGet(`/devices/${serial}/lldp/cdp`);
}

/* ── Switches ──────────────────────────────────────────── */

export async function getNetworkSwitchPortsStatuses(networkId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return safeGet(`/networks/${networkId}/switch/ports/statuses`, { perPage: 1000 }, []) as Promise<any[]>;
}

export async function getDeviceSwitchPortsStatuses(serial: string) {
  return fetchAllPages(`/devices/${serial}/switch/ports/statuses`);
}

export async function getDeviceSwitchPorts(serial: string) {
  const { data } = await client.get(`/devices/${serial}/switch/ports`);
  return data;
}

export async function getNetworkSwitchAccessControlLists(networkId: string) {
  return safeGet(`/networks/${networkId}/switch/accessControlLists`, {}, { rules: [] });
}

/* ── Wireless / APs ────────────────────────────────────── */

export async function getDeviceWirelessConnectionStats(serial: string, params: Record<string, unknown> = {}) {
  return safeGet(`/devices/${serial}/wireless/connectionStats`, params);
}

export async function getNetworkWirelessConnectionStats(networkId: string, params: Record<string, unknown> = {}) {
  return safeGet(`/networks/${networkId}/wireless/connectionStats`, params);
}

export async function getNetworkWirelessFailedConnections(networkId: string, params: Record<string, unknown> = {}) {
  return safeGet(`/networks/${networkId}/wireless/failedConnections`, params, []);
}

export async function getOrgWirelessSignalQualityByDevice(orgId: string, params: Record<string, unknown> = {}) {
  return safeGet(`/organizations/${orgId}/wireless/devices/signalQuality/byDevice`, params);
}

export async function getNetworkWirelessSignalQualityHistory(networkId: string, params: Record<string, unknown> = {}) {
  return safeGet(`/networks/${networkId}/wireless/signalQualityHistory`, params);
}

export async function getNetworkWirelessSSIDs(networkId: string) {
  const { data } = await client.get(`/networks/${networkId}/wireless/ssids`);
  return data;
}

/* ── Appliance ─────────────────────────────────────────── */

export async function getApplianceStatuses(networkId: string) {
  try {
    const { data } = await client.get(`/networks/${networkId}/appliance/uplinks/statuses`);
    return data;
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 404) {
      const { data } = await client.get(`/networks/${networkId}/appliance/uplink/statuses`);
      return data;
    }
    throw e;
  }
}

export async function getAppliancePorts(networkId: string) {
  const { data } = await client.get(`/networks/${networkId}/appliance/ports`);
  return data;
}

export async function getDeviceAppliancePortsStatuses(serial: string) {
  try {
    const { data } = await client.get(`/devices/${serial}/appliance/ports/statuses`);
    return data;
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 404) {
      const { data } = await client.get(`/devices/${serial}/appliance/ports/status`);
      return data;
    }
    throw e;
  }
}

export async function getDeviceAppliancePerformance(serial: string, params: Record<string, unknown> = {}) {
  return safeGet(`/devices/${serial}/appliance/performance`, params);
}

export async function getOrgApplianceUplinkStatuses(orgId: string, params: Record<string, unknown> = {}) {
  try {
    return await fetchAllPages(`/organizations/${orgId}/appliance/uplink/statuses`, params);
  } catch {
    return [];
  }
}

export async function getOrgDevicesUplinksLossAndLatency(orgId: string, params: Record<string, unknown> = {}) {
  return safeGet(`/organizations/${orgId}/devices/uplinksLossAndLatency`, params, []);
}

export async function getDeviceLossAndLatencyHistory(serial: string, params: Record<string, unknown> = {}) {
  return safeGet(`/devices/${serial}/lossAndLatencyHistory`, params, []);
}

export async function getOrgApplianceUplinksUsageByDevice(orgId: string, params: Record<string, unknown> = {}) {
  return safeGet(`/organizations/${orgId}/appliance/uplinks/usage/byDevice`, params, []);
}

export async function getNetworkClientsBandwidthUsage(networkId: string, timespan = 3600) {
  return safeGet(`/networks/${networkId}/clients/bandwidthUsageHistory`, { timespan, resolution: 300 }, []);
}

export async function getOrgWirelessDevicesEthernetStatuses(orgId: string, params: Record<string, unknown> = {}) {
  return safeGet(`/organizations/${orgId}/wireless/devices/ethernet/statuses`, params, []);
}

export async function getNetworkApplianceUplinksUsageHistory(networkId: string, params: Record<string, unknown> = {}) {
  return safeGet(`/networks/${networkId}/appliance/uplinks/usageHistory`, params, []);
}

export async function getNetworkApplianceConnectivityMonitoringDestinations(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/connectivityMonitoringDestinations`, {}, {});
}

export async function getNetworkWirelessSSID(networkId: string, number: number) {
  return safeGet(`/networks/${networkId}/wireless/ssids/${number}`, {}, {});
}

/* ── Device lookup (serial / MAC) ──────────────────────── */

export async function getDevice(serial: string) {
  const { data } = await client.get(`/devices/${serial}`);
  return data;
}

export async function getOrganizationDevices(orgId: string, params: Record<string, unknown> = {}) {
  return fetchAllPages(`/organizations/${orgId}/devices`, params, { perPage: 1000 });
}

/* ── Device Clients ────────────────────────────────────── */

export async function getDeviceClients(serial: string, params: Record<string, unknown> = {}) {
  return safeGet(`/devices/${serial}/clients`, params, []);
}

/* ── DHCP Subnets ──────────────────────────────────────── */

export async function getDeviceApplianceDhcpSubnets(serial: string) {
  return safeGet(`/devices/${serial}/appliance/dhcp/subnets`, {}, []);
}

/* ── VLANs ─────────────────────────────────────────────── */

export async function getNetworkApplianceVlans(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/vlans`, {}, []);
}

export async function getNetworkApplianceVlan(networkId: string, vlanId: number) {
  return safeGet(`/networks/${networkId}/appliance/vlans/${vlanId}`);
}

export async function getNetworkApplianceVlansSettings(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/vlans/settings`);
}

/* ── Firewall Rules ────────────────────────────────────── */

export async function getNetworkApplianceFirewallL3Rules(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/firewall/l3FirewallRules`);
}

export async function getNetworkApplianceFirewallL7Rules(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/firewall/l7FirewallRules`);
}

export async function getNetworkApplianceFirewallPortForwardingRules(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/firewall/portForwardingRules`);
}

export async function getNetworkApplianceFirewallOneToOneNatRules(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/firewall/oneToOneNatRules`);
}

export async function getNetworkApplianceFirewallOneToManyNatRules(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/firewall/oneToManyNatRules`);
}

export async function getNetworkApplianceFirewallInboundFirewallRules(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/firewall/inboundFirewallRules`);
}

export async function getNetworkApplianceFirewallSettings(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/firewall/settings`);
}

/* ── Security (IDS/IPS/Malware) ────────────────────────── */

export async function getNetworkApplianceSecurityIntrusion(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/security/intrusion`);
}

export async function getNetworkApplianceSecurityMalware(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/security/malware`);
}

export async function getNetworkApplianceSecurityEvents(networkId: string, params: Record<string, unknown> = {}) {
  return fetchAllPages(`/networks/${networkId}/appliance/security/events`, params, { perPage: 100, maxPages: 5 });
}

/* ── Content Filtering ─────────────────────────────────── */

export async function getNetworkApplianceContentFiltering(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/contentFiltering`);
}

/* ── Appliance Settings & Static Routes ────────────────── */

export async function getNetworkApplianceSettings(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/settings`);
}

export async function getNetworkApplianceStaticRoutes(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/staticRoutes`, {}, []);
}

export async function getNetworkApplianceSingleLan(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/singleLan`);
}

/* ── Appliance VPN ─────────────────────────────────────── */

export async function getNetworkApplianceVpnSiteToSiteVpn(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/vpn/siteToSiteVpn`);
}

export async function getNetworkApplianceWarmSpare(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/warmSpare`);
}

/* ── Appliance Traffic Shaping ─────────────────────────── */

export async function getNetworkApplianceTrafficShapingRules(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/trafficShaping/rules`);
}

export async function getNetworkApplianceTrafficShapingUplinkBandwidth(networkId: string) {
  return safeGet(`/networks/${networkId}/appliance/trafficShaping/uplinkBandwidth`);
}

/* ── Switch Routing ────────────────────────────────────── */

export async function getDeviceSwitchRoutingInterfaces(serial: string) {
  return safeGet(`/devices/${serial}/switch/routing/interfaces`, {}, []);
}

export async function getDeviceSwitchRoutingStaticRoutes(serial: string) {
  return safeGet(`/devices/${serial}/switch/routing/staticRoutes`, {}, []);
}

/* ── Switch Port Packets ───────────────────────────────── */

export async function getDeviceSwitchPortsStatusesPackets(serial: string, params: Record<string, unknown> = {}) {
  return safeGet(`/devices/${serial}/switch/ports/statuses/packets`, params, []);
}

/* ── Switch Config ─────────────────────────────────────── */

export async function getNetworkSwitchSettings(networkId: string) {
  return safeGet(`/networks/${networkId}/switch/settings`);
}

export async function getNetworkSwitchAccessPolicies(networkId: string) {
  return safeGet(`/networks/${networkId}/switch/accessPolicies`, {}, []);
}

export async function getNetworkSwitchPortSchedules(networkId: string) {
  return safeGet(`/networks/${networkId}/switch/portSchedules`, {}, []);
}

export async function getNetworkSwitchMtu(networkId: string) {
  return safeGet(`/networks/${networkId}/switch/mtu`);
}

export async function getNetworkSwitchStpSettings(networkId: string) {
  return safeGet(`/networks/${networkId}/switch/stp`);
}

export async function getDeviceSwitchWarmSpare(serial: string) {
  return safeGet(`/devices/${serial}/switch/warmSpare`);
}

/* ── Wireless Advanced ─────────────────────────────────── */

export async function getDeviceWirelessStatus(serial: string) {
  return safeGet(`/devices/${serial}/wireless/status`);
}

export async function getDeviceWirelessLatencyStats(serial: string, params: Record<string, unknown> = {}) {
  return safeGet(`/devices/${serial}/wireless/latencyStats`, params);
}

export async function getDeviceWirelessRadioSettings(serial: string) {
  return safeGet(`/devices/${serial}/wireless/radio/settings`);
}

export async function getNetworkWirelessLatencyHistory(networkId: string, params: Record<string, unknown> = {}) {
  return safeGet(`/networks/${networkId}/wireless/latencyHistory`, params, []);
}

export async function getNetworkWirelessClientCountHistory(networkId: string, params: Record<string, unknown> = {}) {
  return safeGet(`/networks/${networkId}/wireless/clientCountHistory`, params, []);
}

export async function getNetworkWirelessUsageHistory(networkId: string, params: Record<string, unknown> = {}) {
  return safeGet(`/networks/${networkId}/wireless/usageHistory`, params, []);
}

export async function getNetworkWirelessChannelUtilizationHistory(networkId: string, params: Record<string, unknown> = {}) {
  return safeGet(`/networks/${networkId}/wireless/channelUtilizationHistory`, params, []);
}

export async function getNetworkWirelessDataRateHistory(networkId: string, params: Record<string, unknown> = {}) {
  return safeGet(`/networks/${networkId}/wireless/dataRateHistory`, params, []);
}

export async function getNetworkWirelessSettings(networkId: string) {
  return safeGet(`/networks/${networkId}/wireless/settings`);
}

export async function getNetworkWirelessRfProfiles(networkId: string) {
  return safeGet(`/networks/${networkId}/wireless/rfProfiles`, {}, []);
}

/* ── Network Alerts ────────────────────────────────────── */

export async function getNetworkAlertsHistory(networkId: string, params: Record<string, unknown> = {}) {
  return fetchAllPages(`/networks/${networkId}/alerts/history`, params, { perPage: 100, maxPages: 3 });
}

export async function getNetworkAlertsSettings(networkId: string) {
  return safeGet(`/networks/${networkId}/alerts/settings`);
}

/* ── Device Management Interface ───────────────────────── */

export async function getDeviceManagementInterface(serial: string) {
  return safeGet(`/devices/${serial}/managementInterface`);
}

/* ── Live Tools ────────────────────────────────────────── */

export async function createDeviceLiveToolsPing(serial: string, target: string, count = 5) {
  const { data } = await client.post(`/devices/${serial}/liveTools/ping`, { target, count });
  return data;
}

export async function getDeviceLiveToolsPing(serial: string, pingId: string) {
  const { data } = await client.get(`/devices/${serial}/liveTools/ping/${pingId}`);
  return data;
}

export async function createDeviceLiveToolsCableTest(serial: string, ports: string[]) {
  const { data } = await client.post(`/devices/${serial}/liveTools/cableTest`, { ports });
  return data;
}

export async function getDeviceLiveToolsCableTest(serial: string, cableTestId: string) {
  const { data } = await client.get(`/devices/${serial}/liveTools/cableTest/${cableTestId}`);
  return data;
}

export async function createDeviceLiveToolsThroughputTest(serial: string) {
  const { data } = await client.post(`/devices/${serial}/liveTools/throughputTest`);
  return data;
}

export async function getDeviceLiveToolsThroughputTest(serial: string, throughputTestId: string) {
  const { data } = await client.get(`/devices/${serial}/liveTools/throughputTest/${throughputTestId}`);
  return data;
}

/* ── Organization Extras ───────────────────────────────── */

export async function getOrganizationInventoryDevices(orgId: string, params: Record<string, unknown> = {}) {
  return fetchAllPages(`/organizations/${orgId}/inventoryDevices`, params);
}

export async function getOrganizationDevicesAvailabilities(orgId: string, params: Record<string, unknown> = {}) {
  return fetchAllPages(`/organizations/${orgId}/devices/availabilities`, params);
}

export async function getOrganizationDevicesAvailabilitiesChangeHistory(orgId: string, params: Record<string, unknown> = {}) {
  return fetchAllPages(`/organizations/${orgId}/devices/availabilities/changeHistory`, params);
}

export async function getOrganizationSummaryTopDevicesByUsage(orgId: string, params: Record<string, unknown> = {}) {
  return safeGet(`/organizations/${orgId}/summary/top/devices/byUsage`, params, []);
}

export async function getOrganizationSummaryTopClientsByUsage(orgId: string, params: Record<string, unknown> = {}) {
  return safeGet(`/organizations/${orgId}/summary/top/clients/byUsage`, params, []);
}

export async function getOrganizationApplianceVpnStatuses(orgId: string, params: Record<string, unknown> = {}) {
  return fetchAllPages(`/organizations/${orgId}/appliance/vpn/statuses`, params);
}
