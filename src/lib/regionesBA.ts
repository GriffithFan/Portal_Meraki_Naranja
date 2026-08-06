/**
 * Regiones educativas de la Provincia de Buenos Aires (DGCyE): 25 regiones, cada
 * una agrupa varios partidos. En Carrot el partido del predio se guarda en
 * `Predio.ciudad` (verificado: valores tipo "LINCOLN", "GENERAL VIAMONTE"...).
 *
 * Se usa para aplicar reglas particulares por región en el enriquecimiento
 * (ej. LAC-R estricto por ventana en las regiones seleccionadas). Los nombres
 * están en mayúsculas sin acentos, igual que la BD; el match se hace con `norm`.
 *
 * OJO: las regiones 14 y 15 (las que traen la restricción por defecto) están
 * verificadas contra los partidos reales de la BD. Si en el futuro se activa la
 * restricción en otra región, conviene revisar su lista de partidos acá (la
 * pantalla de config muestra los partidos de cada región para poder controlarlo).
 */

export const REGIONES_BA: Record<number, string[]> = {
  1: ["LA PLATA", "BERISSO", "ENSENADA", "BRANDSEN", "MAGDALENA", "PUNTA INDIO"],
  2: ["AVELLANEDA", "LOMAS DE ZAMORA", "LANUS"],
  3: ["LA MATANZA"],
  4: ["BERAZATEGUI", "FLORENCIO VARELA", "QUILMES"],
  5: ["ALMIRANTE BROWN", "ESTEBAN ECHEVERRIA", "EZEIZA", "PRESIDENTE PERON", "SAN VICENTE"],
  6: ["SAN FERNANDO", "SAN ISIDRO", "TIGRE", "VICENTE LOPEZ"],
  7: ["HURLINGHAM", "GENERAL SAN MARTIN", "TRES DE FEBRERO"],
  8: ["ITUZAINGO", "MERLO", "MORON"],
  9: ["JOSE C PAZ", "MALVINAS ARGENTINAS", "MORENO", "SAN MIGUEL"],
  10: ["GENERAL LAS HERAS", "GENERAL RODRIGUEZ", "LUJAN", "MARCOS PAZ", "MERCEDES", "NAVARRO", "SUIPACHA"],
  11: ["CAMPANA", "EXALTACION DE LA CRUZ", "ESCOBAR", "PILAR", "ZARATE"],
  12: ["ARRECIFES", "BARADERO", "CAPITAN SARMIENTO", "RAMALLO", "SAN NICOLAS", "SAN PEDRO"],
  13: ["CARMEN DE ARECO", "COLON", "PERGAMINO", "ROJAS", "SAN ANTONIO DE ARECO", "SALTO"],
  14: ["CHACABUCO", "FLORENTINO AMEGHINO", "GENERAL ARENALES", "GENERAL PINTO", "GENERAL VIAMONTE", "JUNIN", "LEANDRO N ALEM", "LINCOLN"],
  15: ["9 DE JULIO", "ALBERTI", "BRAGADO", "CARLOS CASARES", "CHIVILCOY", "HIPOLITO YRIGOYEN", "PEHUAJO"],
  16: ["AYACUCHO", "CASTELLI", "DOLORES", "GENERAL GUIDO", "GENERAL LAVALLE", "GENERAL MADARIAGA", "LA COSTA", "MAIPU", "PINAMAR", "TORDILLO", "VILLA GESELL"],
  17: ["CHASCOMUS", "GENERAL BELGRANO", "GENERAL PAZ", "LEZAMA", "MONTE", "PILA"],
  18: ["CAÑUELAS", "LOBOS", "LAS FLORES", "SALADILLO", "ROQUE PEREZ"],
  19: ["ADOLFO GONZALES CHAVES", "CORONEL DORREGO", "CORONEL PRINGLES", "SAN CAYETANO", "TRES ARROYOS"],
  20: ["BALCARCE", "GENERAL PUEYRREDON", "LOBERIA", "MAR CHIQUITA", "NECOCHEA", "TANDIL"],
  21: ["BENITO JUAREZ", "GENERAL ALVARADO", "GENERAL LAMADRID", "LAPRIDA", "OLAVARRIA"],
  22: ["BAHIA BLANCA", "CORONEL ROSALES", "MONTE HERMOSO", "PATAGONES", "VILLARINO"],
  23: ["ADOLFO ALSINA", "CORONEL SUAREZ", "GUAMINI", "PUAN", "SAAVEDRA", "TORNQUIST"],
  24: ["25 DE MAYO", "GENERAL ALVEAR", "TAPALQUE", "AZUL", "BOLIVAR", "RAUCH"],
  25: ["CARLOS TEJEDOR", "DAIREAUX", "GENERAL VILLEGAS", "PELLEGRINI", "RIVADAVIA", "SALLIQUELO", "TRENQUE LAUQUEN", "TRES LOMAS"],
};

/** Orden de regiones para listar/seleccionar en la UI. */
export const REGIONES_ORDEN: number[] = Object.keys(REGIONES_BA).map(Number).sort((a, b) => a - b);

/** Normaliza un nombre de partido: mayúsculas, sin acentos, sin puntos, un solo espacio. */
export function norm(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[.\-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Mapa inverso partido(normalizado) -> número de región (se arma una vez).
const PARTIDO_A_REGION = new Map<string, number>();
for (const [region, partidos] of Object.entries(REGIONES_BA)) {
  for (const p of partidos) PARTIDO_A_REGION.set(norm(p), Number(region));
}

/** Región educativa (1-25) del partido/`ciudad` del predio, o null si no matchea. */
export function regionDePartido(ciudad: string | null | undefined): number | null {
  const key = norm(ciudad);
  if (!key) return null;
  return PARTIDO_A_REGION.get(key) ?? null;
}
