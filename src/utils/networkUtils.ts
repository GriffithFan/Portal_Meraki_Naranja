/**
 * Normaliza valores de reachability/status de dispositivos
 */
export const normalizeReachability = (value: unknown, fallback = "unknown"): string => {
  if (!value) return fallback;
  const normalized = value.toString().trim().toLowerCase();
  if (/(not\s*connected|disconnected|offline|down|failed|inactive|unplugged)/.test(normalized)) return "disconnected";
  if (/(alerting|warning|degraded|issues?|problem|unstable|limited|partial)/.test(normalized)) return "warning";
  if (/(connected|online|up|active|ready|reachable|operational)/.test(normalized)) return "connected";
  if (/disabled/.test(normalized)) return "disabled";
  return normalized || fallback;
};

/**
 * Obtiene el color según el estado
 */
export const getStatusColor = (value: unknown): string => {
  const normalized = normalizeReachability(value);
  if (normalized === "connected") return "#22c55e";
  if (normalized === "warning") return "#f59e0b";
  if (normalized === "disconnected") return "#ef4444";
  if (normalized === "disabled") return "#94a3b8";
  return "#6366f1";
};

/**
 * Resuelve el color de un puerto basado en su estado
 */
export const resolvePortColor = (port: { enabled?: boolean; statusNormalized?: string; status?: string }): string => {
  if (!port.enabled && port.enabled !== undefined) return "#94a3b8";
  const normalized = normalizeReachability(port.statusNormalized || port.status);
  if (normalized === "connected") return "#047857";
  if (normalized === "warning") return "#f59e0b";
  if (normalized === "disconnected") return "#ef4444";
  if (normalized === "disabled") return "#94a3b8";
  return "#60a5fa";
};

/**
 * Determina si un valor parece un número de serie
 */
export const looksLikeSerial = (value: unknown): boolean => {
  if (!value) return false;
  const text = value.toString().trim();
  if (!text) return false;
  const pattern = /^[A-Z0-9]{2,}(?:-[A-Z0-9]{2,}){2,}$/i;
  if (pattern.test(text)) return true;
  const compact = text.replace(/[^a-z0-9]/gi, "");
  return compact.length >= 10 && /[a-z]/i.test(compact) && /\d/.test(compact);
};
