/**
 * Mapeo de prefijo de 2 dígitos de número de predio → Provincia argentina.
 * Basado en los códigos de jurisdicción utilizados por Meraki / CUE.
 */
const PREFIX_TO_PROVINCIA: Record<string, string> = {
  "10": "CATAMARCA",
  "14": "CORDOBA",
  "18": "CORRIENTES",
  "22": "CHACO",
  "26": "CHUBUT",
  "30": "ENTRE RIOS",
  "34": "FORMOSA",
  "38": "JUJUY",
  "42": "LA PAMPA",
  "46": "LA RIOJA",
  "50": "MENDOZA",
  "54": "MISIONES",
  "58": "NEUQUEN",
  "60": "BUENOS AIRES",
  "61": "BUENOS AIRES",
  "62": "RIO NEGRO",
  "66": "SALTA",
  "70": "SAN JUAN",
  "74": "SAN LUIS",
  "78": "SANTA CRUZ",
  "82": "SANTA FE",
  "86": "SGO. DEL ESTERO",
  "90": "TUCUMAN",
  "94": "TIERRA DEL FUEGO",
};

/**
 * Detecta la provincia a partir de un número de predio.
 * @param codigo Código o número del predio (ej: "600277", "460023")
 * @returns Nombre de la provincia o null si no se puede determinar
 */
export function detectarProvincia(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  const clean = codigo.toString().trim();
  if (clean.length < 2 || !/^\d/.test(clean)) return null;
  return PREFIX_TO_PROVINCIA[clean.substring(0, 2)] || null;
}

/**
 * Retorna la provincia de un predio: usa el campo explícito si existe,
 * si no, intenta detectar a partir del código.
 */
export function obtenerProvincia(
  provinciaExplicita: string | null | undefined,
  codigo: string | null | undefined
): string {
  if (provinciaExplicita && provinciaExplicita.trim()) return provinciaExplicita.trim();
  return detectarProvincia(codigo) || "";
}

/** Lista de todas las provincias disponibles en el mapeo (sin duplicados, ordenadas) */
export const PROVINCIAS = Array.from(new Set(Object.values(PREFIX_TO_PROVINCIA))).sort((a, b) =>
  a.localeCompare(b, "es")
);
