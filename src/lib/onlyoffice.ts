import { SignJWT, jwtVerify } from "jose";
import path from "path";

/**
 * Integración con OnlyOffice Document Server (autohospedado en office.thnet.com.ar).
 * Permite editar documentos de Actas (.docx) con fidelidad Word y descargarlos
 * (incluido "Descargar como PDF" desde el propio editor).
 *
 * Seguridad: todo va firmado con JWT (HS256) usando ONLYOFFICE_JWT_SECRET, el
 * mismo secreto configurado en el contenedor de OnlyOffice.
 */

export const ONLYOFFICE_URL = (process.env.ONLYOFFICE_URL || "").replace(/\/+$/, "");
const SECRET = process.env.ONLYOFFICE_JWT_SECRET || "";
export const ONLYOFFICE_ENABLED = Boolean(ONLYOFFICE_URL && SECRET);
/** Base pública de Carrot para las URLs que OnlyOffice tiene que alcanzar. */
export const PUBLIC_BASE = (process.env.NEXTAUTH_URL || process.env.BASE_URL || "").replace(/\/+$/, "");

function key() {
  return new TextEncoder().encode(SECRET);
}

/** Firma un payload como JWT (para el config del editor y para tokens de archivo). */
export async function signOnlyOffice(payload: Record<string, unknown>, expiresIn = "2h"): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key());
}

/** Verifica un JWT emitido/recibido por OnlyOffice. Lanza si es inválido. */
export async function verifyOnlyOffice<T = Record<string, unknown>>(token: string): Promise<T> {
  const { payload } = await jwtVerify(token, key());
  return payload as T;
}

/** Extensión de archivo sin el punto (docx, doc, ...). */
export function fileExt(nombre: string): string {
  return path.extname(nombre || "").replace(/^\./, "").toLowerCase();
}

/** documentType de OnlyOffice según la extensión. */
export function documentType(ext: string): "word" | "cell" | "slide" | "pdf" {
  if (["xls", "xlsx", "ods", "csv"].includes(ext)) return "cell";
  if (["ppt", "pptx", "odp"].includes(ext)) return "slide";
  if (ext === "pdf") return "pdf";
  return "word";
}

/** Extensiones editables con OnlyOffice. */
export function esEditableOnlyOffice(nombre: string): boolean {
  return ["docx", "doc", "odt", "xlsx", "xls", "pptx", "ppt"].includes(fileExt(nombre));
}
