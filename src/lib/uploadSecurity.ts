type UploadValidationOptions = {
  file: File;
  allowedMimeTypes: readonly string[];
  allowedExtensions: readonly string[];
  maxSizeBytes: number;
  label: string;
};

type UploadValidationResult =
  | { ok: false; error: string }
  | { ok: true; buffer: Buffer; extension: string; mime: string };

const SIGNATURES: Record<string, (buffer: Buffer) => boolean> = {
  pdf: (buffer) => buffer.subarray(0, 4).toString("ascii") === "%PDF",
  jpg: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  jpeg: (buffer) => SIGNATURES.jpg(buffer),
  png: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  gif: (buffer) => ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii")),
  webp: (buffer) => buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP",
  mp4: (buffer) => buffer.subarray(4, 8).toString("ascii") === "ftyp",
  mov: (buffer) => buffer.subarray(4, 8).toString("ascii") === "ftyp",
  webm: (buffer) => buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  mp3: (buffer) => buffer.subarray(0, 3).toString("ascii") === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0),
  ogg: (buffer) => buffer.subarray(0, 4).toString("ascii") === "OggS",
  wav: (buffer) => buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WAVE",
  zip: (buffer) => buffer[0] === 0x50 && buffer[1] === 0x4b,
  docx: (buffer) => SIGNATURES.zip(buffer),
  doc: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
};

export function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._\-() áéíóúñÁÉÍÓÚÑ]/g, "_").slice(0, 200);
}

export function getFileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

export async function validateAndReadUpload({ file, allowedMimeTypes, allowedExtensions, maxSizeBytes, label }: UploadValidationOptions): Promise<UploadValidationResult> {
  const extension = getFileExtension(file.name);
  const mime = file.type.split(";")[0].trim().toLowerCase();

  if (!allowedExtensions.includes(extension)) {
    return { ok: false, error: `Extensión de ${label} no permitida: ${file.name}` };
  }

  if (!allowedMimeTypes.includes(mime)) {
    return { ok: false, error: `Tipo de ${label} no permitido: ${file.name}` };
  }

  if (file.size > maxSizeBytes) {
    return { ok: false, error: `${file.name} supera el tamaño permitido` };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length !== file.size) {
    return { ok: false, error: `No se pudo validar el tamaño real de ${file.name}` };
  }

  const signature = SIGNATURES[extension];
  if (signature && !signature(buffer)) {
    return { ok: false, error: `El contenido de ${file.name} no coincide con su extensión` };
  }

  return { ok: true, buffer, extension, mime };
}