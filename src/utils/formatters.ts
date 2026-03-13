import type { MerakiAppliancePortStatus, MerakiSwitchPortStatus } from "@/types/meraki";

/**
 * Formatea un valor métrico
 */
export const formatMetric = (value: unknown): string => {
  if (value == null || value === "") return "-";
  if (typeof value === "string") return value;
  return String(value);
};

/**
 * Formatea una fecha/hora
 */
export const formatDateTime = (value: unknown): string => {
  if (!value) return "-";
  return new Date(value as string).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
};

/**
 * Formatea una lista de valores separados por coma
 */
export const formatList = (value: unknown): string => {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string") return value;
  return String(value || "-");
};

/**
 * Formatea una duración en segundos a formato legible
 */
export const formatDuration = (seconds: number): string => {
  if (!seconds || seconds === 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ");
};

/**
 * Formatea un valor en Kbps a formato legible
 */
export const formatKbpsValue = (value: unknown): string => {
  if (value == null || value === "") return "-";
  const num = parseFloat(value as string);
  if (isNaN(num)) return "-";
  if (num >= 1000) return `${(num / 1000).toFixed(1)} Mbps`;
  return `${num.toFixed(1)} Kbps`;
};

/**
 * Resume el uso de un puerto (recv/sent)
 */
export const summarizeUsage = (port: MerakiAppliancePortStatus | MerakiSwitchPortStatus | null): { recv: string; sent: string } => {
  if (!port) return { recv: "-", sent: "-" };
  const recv = port.usageInKb?.recv != null ? formatKbpsValue(port.usageInKb.recv) : "-";
  const sent = port.usageInKb?.sent != null ? formatKbpsValue(port.usageInKb.sent) : "-";
  return { recv, sent };
};

/**
 * Obtiene el alias de un puerto
 */
export const getPortAlias = (port: MerakiAppliancePortStatus | null): string => {
  if (!port) return "-";
  return port.alias || port.name || `Puerto ${port.number || port.portId || "?"}`;
};

/**
 * Obtiene la etiqueta de estado de un puerto
 */
export const getPortStatusLabel = (port: MerakiAppliancePortStatus | null): string => {
  if (!port) return "Unknown";
  return port.statusNormalized || port.status || "Unknown";
};

/**
 * Formatea la etiqueta de velocidad de un puerto
 */
export const formatSpeedLabel = (port: MerakiAppliancePortStatus | null): string => {
  if (!port) return "-";
  if (port.speed) return port.speed;
  if (port.wiredSpeed) return formatWiredSpeed(port.wiredSpeed);
  return "-";
};

/**
 * Formatea la velocidad cableada (Ethernet)
 */
export const formatWiredSpeed = (speedString: string): string => {
  if (!speedString || speedString === "—") return "-";

  if (/mbit|mbps/i.test(speedString)) return speedString;

  const lower = speedString.toLowerCase();

  let duplex = "";
  if (lower.includes("full")) duplex = " Full Duplex";
  else if (lower.includes("half")) duplex = " Half Duplex";

  if (/gbps|gb\/s|gbit/i.test(lower)) {
    const m = speedString.match(/(\d+(?:\.\d+)?)/);
    return m ? `${m[1]} Gbps${duplex}` : speedString;
  }
  if (/mbps|mb\/s|mbit/i.test(lower)) {
    const m = speedString.match(/(\d+(?:\.\d+)?)/);
    return m ? `${m[1]} Mbps${duplex}` : speedString;
  }
  if (/kbps|kb\/s/i.test(lower)) {
    const m = speedString.match(/(\d+(?:\.\d+)?)/);
    if (m) {
      const val = parseFloat(m[1]);
      return val >= 1000 ? `${(val / 1000).toFixed(1)} Mbps${duplex}` : `${m[1]} Kbps${duplex}`;
    }
  }

  const numMatch = speedString.match(/(\d+)/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    if (num >= 1000) return `${num / 1000} Gbps${duplex}`;
    return `${num} Mbps${duplex}`;
  }

  return speedString;
};

/**
 * Formatea un score de calidad (0-100)
 */
export const formatQualityScore = (value: unknown): string => {
  if (value == null) return "-";
  const num = parseFloat(value as string);
  if (isNaN(num)) return "-";
  return `${num.toFixed(0)}%`;
};

/**
 * Formatea un porcentaje de cobertura
 */
export const formatCoverage = (value: unknown): string => {
  if (value == null) return "-";
  const num = parseFloat(value as string);
  if (isNaN(num)) return "-";
  return `${num.toFixed(1)}%`;
};
