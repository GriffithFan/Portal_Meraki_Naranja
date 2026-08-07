/**
 * Fuente única de verdad para el mapeo de técnicos / equipos.
 *
 * Cada entrada define:
 *   key      – Identificador canónico que se guarda en DB (nombre visible)
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
  { key: "Dani",    aliases: ["TH01", "DANIEL", "DANI", "DANIEL C01"], display: "Dani" },
  { key: "TH02",    aliases: [],                                        display: "TH02" },
  { key: "Jorge",   aliases: ["TH03", "JORGE"],                         display: "Jorge" },
  { key: "Lucio",   aliases: ["TH04", "LUCIO", "ADOLFO"],               display: "Lucio" },
  { key: "Gustavo", aliases: ["TH05", "GUSTAVO"],                       display: "Gustavo" },
  { key: "TH06",    aliases: [],                                        display: "TH06" },
  { key: "Fede",    aliases: ["TH07", "FEDE", "FEDERICO"],             display: "Fede" },
  { key: "TH08",    aliases: [],                                        display: "TH08" },
  { key: "TH09",    aliases: [],                                        display: "TH09" },
  { key: "TH10",    aliases: [],                                        display: "TH10" },
  { key: "Ariel",   aliases: ["ARIEL", "ARIEL MAIOLI", "A. MAIOLI", "A.MAIOLI", "MAIOLI"], display: "Ariel Maioli" },
  { key: "Julian",  aliases: ["JULIAN", "JULIÁN"],                      display: "Julian" },
];

// ── Índices precalculados ───────────────────────────────────────────

/** Mapa normalizado → EquipoEntry (key + cada alias) */
const NORM_INDEX = new Map<string, EquipoEntry>();

function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/[\s_-]+/g, " ");
}

export function normalizeAssigneeName(name: string): string {
  return norm(name || "");
}

function isAliasEmail(email?: string | null): boolean {
  return /^th\d+@/i.test(email || "");
}

function preferUser<T extends { id: string; nombre: string; email?: string | null }>(current: T, candidate: T): T {
  const currentIsAlias = isAliasEmail(current.email);
  const candidateIsAlias = isAliasEmail(candidate.email);
  if (currentIsAlias !== candidateIsAlias) return candidateIsAlias ? current : candidate;
  return current.nombre.localeCompare(candidate.nombre, "es") <= 0 ? current : candidate;
}

export function dedupeUsersByName<T extends { id: string; nombre: string; email?: string | null }>(users: T[]): T[] {
  const byName = new Map<string, T>();
  for (const user of users) {
    const key = normalizeAssigneeName(user.nombre);
    if (!key) continue;
    const current = byName.get(key);
    byName.set(key, current ? preferUser(current, user) : user);
  }
  return Array.from(byName.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
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
 * devuelve la key canónica del equipo (ej: "Dani", "Ariel").
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

export interface TecnicoAcreditado { mergeKey: string; equipoKey: string; displayName: string }
type AsignacionParaOrden = {
  createdAt: Date | string;
  usuario: { id: string; nombre: string | null; rol?: string | null; activo?: boolean | null } | null;
};

/**
 * Ordena los técnicos de un predio por fecha de asignación (PRIMERO → ÚLTIMO),
 * deduplicados por equipo. `opts.soloTecnicos` filtra a técnicos activos (para el
 * ranking); sin eso incluye a todos los asignados (para facturación).
 * Devuelve [primero(s)…, último] — el último es quien lo resolvió.
 */
export function ordenarTecnicosAsignados(
  asignaciones: AsignacionParaOrden[],
  opts: { soloTecnicos?: boolean } = {}
): TecnicoAcreditado[] {
  const validas = asignaciones
    .filter((a) => {
      const u = a.usuario;
      if (!u) return false;
      if (opts.soloTecnicos) return u.activo !== false && u.rol === "TECNICO";
      return true;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const seen = new Set<string>();
  const out: TecnicoAcreditado[] = [];
  for (const a of validas) {
    const u = a.usuario!;
    const nombre = u.nombre ?? "";
    const resolvedKey = resolveEquipoKey(nombre);
    const mergeKey = resolvedKey || normalizeAssigneeName(nombre) || u.id;
    if (seen.has(mergeKey)) continue;
    seen.add(mergeKey);
    const equipoKey = resolvedKey || nombre || u.id;
    out.push({ mergeKey, equipoKey, displayName: getEquipoDisplayName(equipoKey) });
  }
  return out;
}

/**
 * Elige el ÚNICO técnico al que se le acredita un predio en el ranking (para NO
 * duplicar): el ÚLTIMO asignado entre los técnicos activos, o null si no hay.
 */
export function elegirTecnicoAcreditado(asignaciones: AsignacionParaOrden[]): TecnicoAcreditado | null {
  const ordenados = ordenarTecnicosAsignados(asignaciones, { soloTecnicos: true });
  return ordenados.length ? ordenados[ordenados.length - 1] : null;
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
 */
export function aliasToKey(alias: string): string | null {
  const entry = NORM_INDEX.get(norm(alias));
  return entry?.key ?? null;
}

/**
 * Inverse map: dado una key TH, devuelve el display name.
 */
export function keyToDisplay(key: string): string {
  const entry = NORM_INDEX.get(norm(key));
  return entry?.display ?? key;
}

/** Lista de nombres canónicos disponibles para dropdowns. */
export const EQUIPO_OPTIONS: string[] = EQUIPOS.map(e => e.key);

/** Acceso directo a todas las entradas (para iteración avanzada). */
export const EQUIPO_ENTRIES: readonly EquipoEntry[] = EQUIPOS;

/**
 * Genera opciones dinámicas de equipo: entradas estáticas de EQUIPOS +
 * usuarios activos de la DB que no están ya representados.
 */
export function buildEquipoOptions(
  dbUsers: { nombre: string }[]
): { key: string; display: string }[] {
  const options = EQUIPOS.map(e => ({ key: e.key, display: e.display }));
  const knownNorms = new Set<string>();
  for (const e of EQUIPOS) {
    knownNorms.add(norm(e.key));
    for (const a of e.aliases) knownNorms.add(norm(a));
  }
  for (const u of dbUsers) {
    if (!u.nombre) continue;
    const n = norm(u.nombre);
    if (!knownNorms.has(n)) {
      options.push({ key: u.nombre, display: u.nombre.toUpperCase() });
      knownNorms.add(n);
    }
  }
  return options;
}
