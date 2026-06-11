import { authenticator } from "otplib";

/**
 * 2FA basado en TOTP (apps tipo Google Authenticator / Authy).
 * Tolerancia de ±1 paso (30s) para drift de reloj.
 */
authenticator.options = { window: 1 };

const ISSUER = "Carrot";

export function generarSecret(): string {
  return authenticator.generateSecret();
}

/** URL otpauth:// para generar el QR de enrolamiento. */
export function otpauthURL(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

/** Verifica un código TOTP contra el secret. Tolera espacios. */
export function verificarCodigo(code: string, secret: string): boolean {
  const token = (code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) return false;
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}
