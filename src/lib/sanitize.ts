/** Sanitiza un string de búsqueda: recorta espacios, limita longitud y elimina caracteres de control. */
export function sanitizeSearch(input: string | null | undefined, maxLength = 100): string {
  if (!input) return "";
  // Eliminar caracteres de control y trim
  return input.replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, maxLength);
}

type SanitizeTextOptions = {
  maxLength?: number;
  multiline?: boolean;
};

/** Limpia texto ingresado por usuarios sin convertirlo en HTML ni tocar acentos. */
export function sanitizeUserText(input: string, options: SanitizeTextOptions = {}) {
  const { maxLength, multiline = true } = options;
  let value = input.normalize("NFC").replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "");
  value = multiline
    ? value.replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    : value.replace(/[\x00-\x1F\x7F]/g, "");
  value = value.trim();
  return typeof maxLength === "number" ? value.slice(0, maxLength) : value;
}
