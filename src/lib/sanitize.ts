/** Sanitiza un string de búsqueda: recorta espacios, limita longitud y elimina caracteres de control. */
export function sanitizeSearch(input: string | null | undefined, maxLength = 100): string {
  if (!input) return "";
  // Eliminar caracteres de control y trim
  return input.replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, maxLength);
}
