/* eslint-disable @typescript-eslint/no-explicit-any */
// Utilidades de subida de archivos al chat, pensadas para redes móviles:
//  - comprime imágenes en el navegador antes de subir (fotos de celular de
//    5-12 MB pasan a ~300-500 KB → 10-20x menos datos y menos timeouts)
//  - sube con XMLHttpRequest para poder reportar progreso real
//  - reintenta una vez automáticamente ante corte de red

const COMPRESSIBLE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const COMPRESS_THRESHOLD = 400 * 1024; // no tocar imágenes ya livianas
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

/** Comprime una imagen en el cliente. Ante cualquier problema devuelve el archivo original. */
export async function comprimirImagenChat(file: File): Promise<File> {
  if (!COMPRESSIBLE_TYPES.includes(file.type) || file.size <= COMPRESS_THRESHOLD) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    // Si la compresión no achica (ej. imagen ya optimizada), mandar la original
    if (!blob || blob.size >= file.size) return file;
    const nombre = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nombre, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Comprime las imágenes de un lote; videos/audios/zip pasan sin tocar. */
export async function prepararArchivosChat(files: File[]): Promise<File[]> {
  return Promise.all(files.map((file) => comprimirImagenChat(file)));
}

export type SubidaChatResultado = { ok: true; data: any } | { ok: false; error: string };

const NETWORK_ERROR = "__network__";

function intentoSubida(fd: FormData, onProgress?: (pct: number) => void): Promise<SubidaChatResultado> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/chat/upload");
    xhr.withCredentials = true;
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      let data: any = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* respuesta no JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve({ ok: true, data });
      } else {
        resolve({ ok: false, error: data?.error || `Error al subir el archivo (HTTP ${xhr.status})` });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: NETWORK_ERROR });
    xhr.ontimeout = () => resolve({ ok: false, error: "La subida tardó demasiado. Verificá tu señal e intentá de nuevo." });
    xhr.send(fd);
  });
}

/**
 * Sube archivos a una conversación con progreso y un reintento automático
 * ante corte de red (frecuente en celulares en campo).
 */
export async function subirArchivosChat(opts: {
  conversacionId: string;
  files: File[];
  replyToId?: string | null;
  mensaje?: string;
  onProgress?: (pct: number) => void;
}): Promise<SubidaChatResultado> {
  const fd = new FormData();
  opts.files.forEach((file) => fd.append("file", file));
  fd.append("conversacionId", opts.conversacionId);
  if (opts.replyToId) fd.append("replyToId", opts.replyToId);
  if (opts.mensaje) fd.append("mensaje", opts.mensaje);

  let resultado = await intentoSubida(fd, opts.onProgress);
  if (!resultado.ok && resultado.error === NETWORK_ERROR) {
    opts.onProgress?.(0);
    resultado = await intentoSubida(fd, opts.onProgress);
  }
  if (!resultado.ok && resultado.error === NETWORK_ERROR) {
    return { ok: false, error: "Sin conexión. Verificá tu señal e intentá de nuevo." };
  }
  return resultado;
}

/** Normaliza la respuesta del upload (mensaje único u objeto {mensajes}) a una lista. */
export function mensajesDeRespuestaUpload(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data.mensajes)) return data.mensajes;
  return data.id ? [data] : [];
}
