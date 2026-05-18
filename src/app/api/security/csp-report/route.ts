import { NextRequest, NextResponse } from "next/server";
import { getClientIp, logSecurityEvent } from "@/lib/securityEvents";

export async function POST(request: NextRequest) {
  try {
    const report = await request.json().catch(() => null);
    const details = report?.["csp-report"] || report;
    logSecurityEvent({
      type: "CSP_REPORT_ONLY_VIOLATION",
      ip: getClientIp(request.headers),
      path: request.nextUrl.pathname,
      method: request.method,
      status: 204,
      metadata: {
        documentUri: details?.["document-uri"],
        violatedDirective: details?.["violated-directive"],
        effectiveDirective: details?.["effective-directive"],
        blockedUri: details?.["blocked-uri"],
      },
    });
  } catch {
    // Los reportes CSP nunca deben afectar la navegación del usuario.
  }
  return new NextResponse(null, { status: 204 });
}