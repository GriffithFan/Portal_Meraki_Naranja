type SecurityEvent = {
  type: string;
  ip?: string | null;
  path?: string | null;
  method?: string | null;
  userId?: string | null;
  status?: number;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

function cleanText(value: unknown, maxLength = 160) {
  if (value == null) return undefined;
  return String(value).replace(/[\r\n\t]+/g, " ").slice(0, maxLength);
}

export function getClientIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

export function logSecurityEvent(event: SecurityEvent) {
  const payload = {
    at: new Date().toISOString(),
    type: cleanText(event.type, 80),
    ip: cleanText(event.ip, 80),
    path: cleanText(event.path, 180),
    method: cleanText(event.method, 12),
    userId: cleanText(event.userId, 80),
    status: event.status,
    reason: cleanText(event.reason, 220),
    metadata: event.metadata,
  };
  console.warn("[SECURITY_EVENT]", JSON.stringify(payload));
}