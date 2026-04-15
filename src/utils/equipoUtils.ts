/**
 * Fuente única de verdad para el mapeo de técnicos / equipos.
 *
 * Cada entrada define:
 *   key      – Identificador canónico (TH01, Ariel, Gustavo, etc.)
 *   aliases  – Nombres/variantes que aparecen en la DB o que el usuario puede tipear
 *   display  – Nombre para mostrar en la UI
 *
 * Para agregar un técnico nuevo, solo hay que añadir una entrada aquí.
 */

export interface EquipoEntry {
  key: string;
  aliases: string[];
  display: string;
}

const EQUIPOS: EquipoEntry[] = [
  { key: "TH01",    aliases: ["DANIEL", "DANI", "DANIEL C01"],          display: "DANIEL" },
  { key: "TH02",    aliases: [],                                        display: "TH02" },
  { key: "TH03",    aliases: ["JORGE"],                                 display: "JORGE" },
  { key: "TH04",    aliases: ["LUCIO", "ADOLFO"],                       display: "LUCIO" },
  { key: "TH05",    aliases: [],                                        display: "TH05" },
  { key: "TH06",    aliases: [],                                        display: "TH06" },
  { key: "TH07",    aliases: ["FEDE", "FEDERICO"],                      display: "FEDE" },
  { key: "TH08",    aliases: [],                                        display: "TH08" },
  { key: "TH09",    aliases: [],                                        display: "TH09" },
  { key: "TH10",    aliases: [],                                        display: "TH10" },
  { key: "Gustavo", aliases: ["GUSTAVO"],                               display: "GUSTAVO" },
  { key: "Ariel",   aliases: ["ARIEL", "ARIEL MAIOLI", "A. MAIOLI", "A.MAIOLI", "MAIOLI"], display: "ARIEL MAIOLI" },
  { key: "Julian",  aliases: ["JULIAN", "JULIÁN"],                      display: "JULIAN" },
];

// ── Índices precalculados ───────────────────────────────────────────

/** Mapa normalizado → EquipoEntry (key + cada alias) */
const NORM_INDEX = new Map<string, EquipoEntry>();

function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/[\s_-]+/g, " ");
}

for (const entry of EQUIPOS) {
  NORM_INDEX.set(norm(entry.key), entry);
  for (const alias of entry.aliases) {
    NORM_INDEX.set(norm(alias), entry);
  }
}

// ── Funciones públicas ──────────────────────────────────────────────

/**
 * Dado un nombre/key cualquiera, devuelve TODOS los nombres posibles
 * bajo los que ese equipo aparece en la DB (key + aliases).
 * Sirve para construir `equipoAsignado IN [...]` en queries Prisma.
 */
export function getAllEquipoVariants(name: string): string[] {
  const entry = NORM_INDEX.get(norm(name));
  if (!entry) return [];
  return [entry.key, ...entry.aliases];
}

/**
 * Dado un nombre de usuario (session.nombre) o un nombre del CSV,
 * devuelve la key canónica del equipo (ej: "TH01", "Ariel").
 * Devuelve null si no se reconoce.
 */
export function resolveEquipoKey(name: string): string | null {
  if (!name) return null;
  const entry = NORM_INDEX.get(norm(name));
  if (entry) return entry.key;
  // Fallback: patrón TH## directo
  const m = name.match(/\b(TH\d{1,2})\b/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Devuelve el nombre "bonito" para mostrar a partir de cualquier
 * variante de equipo (key, alias o nombre de usuario).
 */
export function getEquipoDisplayName(name: string): string {
  const entry = NORM_INDEX.get(norm(name));
  return entry?.display ?? name;
}

/**
 * Construye el filtro Prisma `where` para equipoAsignado dado un nombre.
 * Si se reconoce, devuelve `{ in: [...], mode: "insensitive" }`.
 * Si no, devuelve `{ equals: name, mode: "insensitive" }`.
 */
export function equipoFilter(name: string): { in: string[]; mode: "insensitive" } | { equals: string; mode: "insensitive" } {
  const variants = getAllEquipoVariants(name);
  if (variants.length > 0) {
    return { in: variants, mode: "insensitive" };
  }
  return { equals: name, mode: "insensitive" };
}

/**
 * Forward map: dado un nombre/alias (UPPERCASE en la DB), devuelve la key TH.
 * Equivalente al viejo EQUIPO_TH_MAP.
 */
export function aliasToKey(alias: string): string | null {
  const entry = NORM_INDEX.get(norm(alias));
  return entry?.key ?? null;
}

/**
 * Inverse map: dado una key TH, devuelve el display name.
 * Equivalente al viejo TH_NOMBRE_MAP.
 */
export function keyToDisplay(key: string): string {
  const entry = NORM_INDEX.get(norm(key));
  return entry?.display ?? key;
}

/** Lista de keys disponibles para dropdowns (equivalente al viejo TH_OPTIONS). */
export const EQUIPO_OPTIONS: string[] = EQUIPOS.map(e => e.key);

/** Acceso directo a todas las entradas (para iteración avanzada). */
export const EQUIPO_ENTRIES: readonly EquipoEntry[] = EQUIPOS;
