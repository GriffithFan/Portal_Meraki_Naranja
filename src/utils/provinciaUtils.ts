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

/**
 * Unifica el nombre de una provincia para agrupar y mostrar.
 *
 * Hace falta porque la misma provincia entra escrita de dos formas: `detectarProvincia`
 * la deduce del código y devuelve MAYUSCULAS SIN ACENTO ("ENTRE RIOS"), mientras que lo
 * que viene de Salesforce llega en capitalización normal ("Entre Ríos"). Medido en la
 * base: 97 predios como "Entre Ríos" y 16 como "ENTRE RIOS", 1.637 "Buenos Aires" y 38
 * "BUENOS AIRES", 605 "Santa Fe" y 2 "SANTA FE".
 *
 * Sin unificar, cualquier corte por provincia parte la misma zona en dos filas. En el
 * informe que se manda a dirección eso se nota.
 */
const CANONICO: Record<string, string> = {
  "buenos aires": "Buenos Aires",
  "santa fe": "Santa Fe",
  "entre rios": "Entre Ríos",
  "cordoba": "Córdoba",
  "rio negro": "Río Negro",
  "neuquen": "Neuquén",
  "tucuman": "Tucumán",
  "sgo del estero": "Sgo. del Estero",
  "santiago del estero": "Sgo. del Estero",
  "tierra del fuego": "Tierra del Fuego",
};

export function provinciaCanonica(valor?: string | null): string | null {
  const limpio = (valor || "").trim();
  if (!limpio) return null;
  const clave = limpio.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\./g, "").replace(/\s+/g, " ").trim();
  if (CANONICO[clave]) return CANONICO[clave];
  // Desconocida: se deja legible en vez de gritada.
  return clave.replace(/(^| )(\w)/g, (_m, sep, c) => sep + c.toUpperCase());
}
