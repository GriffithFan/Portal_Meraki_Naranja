export const DEFAULT_SECTIONS = [
  { k: "topology", t: "Topología", icon: "topology" },
  { k: "switches", t: "Switches", icon: "switch" },
  { k: "access_points", t: "Puntos de acceso", icon: "wifi" },
  { k: "appliance_status", t: "Estado (appliances)", icon: "server" },
] as const;

export const DEFAULT_UPLINK_TIMESPAN = 24 * 3600; // 24h
export const DEFAULT_UPLINK_RESOLUTION = 300; // 5 min buckets
