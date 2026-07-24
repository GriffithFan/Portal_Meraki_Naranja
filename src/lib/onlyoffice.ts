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

/** Extensiones que se pueden convertir a PDF con OnlyOffice. */
export function esConvertibleAPdf(nombre: string): boolean {
  return ["docx", "doc", "odt", "rtf", "txt"].includes(fileExt(nombre));
}

// Mensajes de los códigos de error de la API de conversión de OnlyOffice.
const CONVERT_ERRORES: Record<number, string> = {
  [-1]: "Error desconocido de conversión",
  [-2]: "Tiempo de conversión agotado",
  [-3]: "Error de conversión del documento",
  [-4]: "No se pudo descargar el documento de origen",
  [-5]: "Contraseña incorrecta",
  [-6]: "Error al acceder a la base de datos de conversión",
  [-7]: "Documento de entrada inválido",
  [-8]: "Token JWT inválido",
  [-9]: "Formato de conversión no soportado",
};

/**
 * Convierte un documento (por URL alcanzable por OnlyOffice) a otro formato.
 * Devuelve la URL del archivo convertido (hospedado por OnlyOffice, temporal).
 * Usa la API /converter con JWT. `async:false` + reintentos por si tarda.
 */
export async function convertirDocumento(opts: {
  url: string;            // URL del documento de origen (alcanzable por OnlyOffice)
  filetype: string;       // extensión de origen (docx, doc, ...)
  outputtype: string;     // extensión destino (pdf)
  key: string;            // clave única de la conversión
  title?: string;
}): Promise<string> {
  if (!ONLYOFFICE_ENABLED) throw new Error("El servidor de documentos no está configurado");

  const base = {
    async: false,
    filetype: opts.filetype,
    outputtype: opts.outputtype,
    key: opts.key,
    title: opts.title || `documento.${opts.filetype}`,
    url: opts.url,
  };

  // El endpoint de conversión cambió de nombre entre versiones del Document
  // Server: probamos el moderno (/converter) y caemos al clásico (ConvertService.ashx).
  const endpoints = [`${ONLYOFFICE_URL}/converter`, `${ONLYOFFICE_URL}/ConvertService.ashx`];

  async function llamar(url: string): Promise<{ error?: number; endConvert?: boolean; fileUrl?: string } | null> {
    const token = await signOnlyOffice(base, "5m");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...base, token }),
    });
    if (res.status === 404) return null; // endpoint inexistente en esta versión
    if (!res.ok) throw new Error(`El servidor de documentos respondió ${res.status}`);
    return (await res.json()) as { error?: number; endConvert?: boolean; fileUrl?: string };
  }

  // Elegir el endpoint disponible una sola vez.
  let endpoint: string | null = null;
  for (const url of endpoints) {
    const data = await llamar(url);
    if (data === null) continue;
    endpoint = url;
    if (typeof data.error === "number") throw new Error(CONVERT_ERRORES[data.error] || `Error de conversión (${data.error})`);
    if (data.endConvert && data.fileUrl) return data.fileUrl;
    break;
  }
  if (!endpoint) throw new Error("El servidor de documentos no expone el conversor");

  // Hasta ~28s más: poll con la misma key hasta que termine.
  for (let intento = 0; intento < 14; intento++) {
    await new Promise((r) => setTimeout(r, 2000));
    const data = await llamar(endpoint);
    if (!data) throw new Error("El conversor dejó de responder");
    if (typeof data.error === "number") throw new Error(CONVERT_ERRORES[data.error] || `Error de conversión (${data.error})`);
    if (data.endConvert && data.fileUrl) return data.fileUrl;
  }
  throw new Error("La conversión tardó demasiado");
}
