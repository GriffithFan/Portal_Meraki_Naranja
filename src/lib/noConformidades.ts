/**
 * Por qué rebotó un predio: de dónde se lee el motivo, cómo se lo desarma y cómo se agrupa.
 *
 * ── Los dos bugs que este archivo corrige ────────────────────────────────────
 * Esta lógica vivía copiada en cuatro rutas (dashboard/kpis, supervisor/asignados,
 * mi-progreso y tareas/mis) y las copias ya habían divergido.
 *
 * 1. Tres de las cuatro devolvían `Predio.incidencias` como "motivo", y ese campo NO es un
 *    motivo: es el CÓDIGO de la incidencia ("NI-000129814"). Para cualquier predio con
 *    código —en producción, los 66 NO CONFORME lo tienen— el motivo reportado era un
 *    código, y el clasificador lo mandaba a "Otros" porque un código no matchea nada.
 *
 * 2. El clasificador comparaba SUBCADENAS: "escuela" contiene "cue", "placa" contiene
 *    "lac", y "ap" está dentro de "apagado", "aplicar", "capacidad" y "rapido". Palabras
 *    que aparecen todo el tiempo caían en la categoría equivocada sin que nada avisara.
 *
 * ── Cómo viene el texto de verdad ────────────────────────────────────────────
 * Verificado sobre los 66 NO CONFORME de producción (muestra de sólo lectura, 09/2026):
 * el motivo NO está en los comentarios —ninguno de los 66 tenía uno— sino en `notas`
 * (60) y `notasTecnico` (6), y llega con esta forma, importado del portal de origen:
 *
 *     Comentarios de incidencia NI-000164063:
 *     • 01/09/2026 — Por favor adjuntar actas legibles. AK
 *     • 08/09/2026 — 7.2 Por favor verificar S/N del acta.
 *
 * O sea: un encabezado con el código, y después UNA LÍNEA POR REBOTE, fechada. 48 de 66
 * traen ese encabezado y algunos acumulan hasta seis entradas. Tomar el campo entero
 * como "el motivo" mezcla el rechazo de hoy con los de hace meses; lo que importa es la
 * ÚLTIMA entrada, y la cantidad de entradas dice cuántas veces rebotó ese predio.
 *
 * ── Por qué NO se lee `descripcion` ──────────────────────────────────────────
 * `Predio.descripcion` NO es el motivo del rechazo: es la ORDEN DE TRABAJO que baja del
 * portal ("Se solicita asistir al Predio a normalizar el Piso actualmente con equipos
 * offline..."), y es prácticamente el mismo texto en todos los predios. Verificado: los
 * 66 NO CONFORME la tienen llena, ninguna trae la fecha del formato de rebote, y ninguno
 * tiene descripción SIN notas. Sumarla al motivo inundaría el clasificador con "offline",
 * "equipos" y "reparaciones" de la orden en vez de lo que dijo quien rechazó.
 *
 * ── El punto de checklist ────────────────────────────────────────────────────
 * 17 de los 66 empiezan con un número tipo "7.2" o "2.1": es el punto del checklist de
 * auditoría que falló. Cuando está, es la respuesta más precisa a "en qué estamos
 * fallando" que cualquier categoría por palabras, porque lo puso quien audita y no un
 * algoritmo. Se extrae aparte y se reporta aparte.
 */

/** De dónde salió el texto del motivo. */
export type FuenteMotivo = "comentario" | "nota-tecnico" | "nota" | null;

/** Un rebote: la fecha en que lo rechazaron y lo que dijeron. */
export interface EntradaMotivo {
  /** dd/mm/aaaa como viene del portal, o null si esa línea no traía fecha. */
  fecha: string | null;
  texto: string;
}

export interface MotivoNoConformidad {
  /** El último rechazo: el que hay que resolver. Vacío si no hay texto. */
  motivo: string;
  /** Todos los rechazos registrados, del más viejo al más nuevo. */
  entradas: EntradaMotivo[];
  /** Cuántas veces rebotó según el registro. 1 cuando no se puede desglosar. */
  rebotes: number;
  /** Puntos del checklist citados en el último rechazo ("7.2", "2.1"). */
  puntos: string[];
  fuente: FuenteMotivo;
  /** Fecha del último rechazo, cuando se puede leer. */
  fecha: string | null;
  /** Quién lo escribió, cuando se sabe (sólo los comentarios lo traen). */
  autor: string | null;
}

/** La forma mínima que hace falta leer de un predio. */
export interface PredioConMotivo {
  notas?: string | null;
  notasTecnico?: string | null;
  comentarios?: Array<{
    contenido?: string | null;
    createdAt?: Date | string | null;
    usuario?: { nombre?: string | null } | null;
  }> | null;
}

const SIN_MOTIVO: MotivoNoConformidad = {
  motivo: "", entradas: [], rebotes: 0, puntos: [], fuente: null, fecha: null, autor: null,
};

/** "Comentarios de incidencia NI-000164063:" al principio del campo. */
const RE_ENCABEZADO = /^\s*Comentarios de incidencia\s+\S+\s*:\s*/i;
/**
 * "• 08/09/2026 — texto" (una línea por rebote), y la variante que también aparece en
 * producción: "16/07/2026 12:57 - Inc-AA: texto", con hora y un prefijo de origen.
 */
const RE_ENTRADA = /^\s*[•·*-]?\s*(\d{2}\/\d{2}\/\d{4})(?:\s+\d{1,2}:\d{2})?\s*[—–-]\s*(?:Inc-\w+\s*:\s*)?(.*)$/;
/** "7.2", "1.10": punto del checklist de auditoría. */
const RE_PUNTO = /(?:^|[\s,;])(\d{1,2}\.\d{1,2})(?=[\s,;:]|$)/g;

/** Los puntos de checklist citados en un texto, sin repetir y en orden de aparición. */
export function puntosChecklist(texto: string): string[] {
  const vistos: string[] = [];
  for (const m of Array.from(texto.matchAll(RE_PUNTO))) {
    if (!vistos.includes(m[1])) vistos.push(m[1]);
  }
  return vistos;
}

/**
 * Desarma el campo tal como llega en un historial de rebotes.
 *
 * Si el texto no tiene la forma esperada (no lo importó el portal, o lo escribió alguien
 * a mano) se devuelve entero como una sola entrada sin fecha: es preferible mostrar el
 * texto crudo que perderlo por no matchear un formato.
 */
export function desglosarMotivo(bruto: string): EntradaMotivo[] {
  const limpio = bruto.replace(RE_ENCABEZADO, "").trim();
  if (!limpio) return [];

  const entradas: EntradaMotivo[] = [];
  for (const linea of limpio.split(/\r?\n/)) {
    const m = RE_ENTRADA.exec(linea);
    if (m) {
      const texto = m[2].trim();
      if (texto) entradas.push({ fecha: m[1], texto });
    } else if (linea.trim() && entradas.length > 0) {
      // Continuación de la entrada anterior (un rechazo largo cortado en varias líneas).
      entradas[entradas.length - 1].texto += " " + linea.trim();
    }
  }

  return entradas.length > 0 ? entradas : [{ fecha: null, texto: limpio }];
}

/**
 * El motivo por el que rebotó un predio.
 *
 * `comentarios` tiene que venir del más nuevo al más viejo (`orderBy: createdAt desc`).
 *
 * NO recibe `incidencias` ni `descripcion` a propósito: la primera es el código de la
 * incidencia y la segunda la orden de trabajo. Ninguna de las dos explica por qué rebotó,
 * y meter la primera fue exactamente el bug que dejó el análisis sin contenido.
 */
export function motivoNoConformidad(predio: PredioConMotivo): MotivoNoConformidad {
  const comentario = predio.comentarios?.[0];
  const bruto =
    comentario?.contenido?.trim() ||
    predio.notasTecnico?.trim() ||
    predio.notas?.trim() ||
    "";
  if (!bruto) return SIN_MOTIVO;

  const fuente: FuenteMotivo = comentario?.contenido?.trim()
    ? "comentario"
    : predio.notasTecnico?.trim()
      ? "nota-tecnico"
      : "nota";

  const entradas = desglosarMotivo(bruto);
  const ultima = entradas[entradas.length - 1];

  // Un comentario no trae la fecha dentro del texto pero sí en createdAt: se la pasa al
  // mismo formato para que quien lea el informe no tenga que distinguir de dónde vino.
  const fechaComentario =
    fuente === "comentario" && comentario?.createdAt ? formatoDdMmAaaa(new Date(comentario.createdAt)) : null;

  return {
    motivo: ultima?.texto ?? "",
    entradas,
    rebotes: entradas.length,
    puntos: ultima ? puntosChecklist(ultima.texto) : [],
    fuente,
    fecha: ultima?.fecha ?? fechaComentario,
    autor: fuente === "comentario" ? comentario?.usuario?.nombre?.trim() || null : null,
  };
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");
/** dd/mm/aaaa, el mismo formato en que el portal fecha cada rebote. */
function formatoDdMmAaaa(d: Date): string | null {
  return Number.isNaN(d.getTime())
    ? null
    : `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Minúsculas, sin acentos ni puntuación, espacios colapsados. */
export function normalizarTexto(valor?: string | null): string {
  return (valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Categorías de fallo, en el orden en que se evalúan: la primera que matchea gana.
 *
 * Calibradas sobre los 66 NO CONFORME de producción, no a ojo. Los términos que más
 * aparecen en el último rechazo son, en orden: evidenciar (12), rack (10), acta (9),
 * equipos (9), establecimiento (9), tension (8), adjuntar (7), evidencias (7),
 * protector (7), conectado (6), foto (6), modem (5), directivo (5), piso (5),
 * switch (4), offline (4), unificacion (4).
 *
 * El orden importa: "falta la foto del rack" es un problema de evidencias, no de
 * instalación, aunque diga "rack". Por eso evidencias va primero.
 */
export const CATEGORIAS_NC = [
  {
    // Va PRIMERO a propósito: si el predio se mudó, la escuela está en obra o no hay
    // contrato vigente, el rebote no es un fallo del técnico y no debería contarse como
    // tal cuando se mide "en qué está fallando cada persona". Mezclarlo con los demás
    // castiga a alguien por algo que no dependía de él.
    nombre: "Fuera de alcance (no imputable al técnico)",
    terminos: ["muda", "mudanza", "obra", "refaccion", "demolicion", "contrato", "vigente",
      "clausurada", "no funciona la escuela", "sin actividad", "cerro definitivamente"],
  },
  {
    nombre: "Equipamiento (reemplazo o retiro)",
    terminos: ["reemplazar", "remplazar", "reemplazo", "retiro", "retirar", "quemado",
      "quemada", "roto", "rota", "gabinete", "repisa", "falla", "fallado"],
  },
  {
    nombre: "Evidencias (faltan o no se ven)",
    terminos: ["evidenciar", "evidencia", "evidencias", "evidenciado", "foto", "fotos", "adjuntar",
      "adjunto", "imagen", "imagenes", "captura", "visualizar", "visualiza", "visible", "legibles",
      "legible", "ilegible", "borrosa", "borrosas", "detallada", "claras"],
  },
  {
    nombre: "Actas y documentación",
    terminos: ["acta", "actas", "formulario", "planilla", "checklist", "firma", "firmada", "firmado",
      "directivo", "sello", "documentacion", "incompleta", "incompleto"],
  },
  {
    nombre: "Enlace y conectividad",
    terminos: ["offline", "off", "enlace", "conexion", "conectividad", "wan", "wan2", "jurisdiccional",
      "100mbit", "100mbps", "10mbit", "crc", "velocidad", "mbps", "mbit"],
  },
  {
    nombre: "Rotulado y datos técnicos",
    terminos: ["etiqueta", "etiquetas", "etiquetado", "rotulo", "rotulos", "rotulado", "serial",
      "seriales", "serie", "cue", "lac", "lacr", "numeracion", "inventario"],
  },
  {
    nombre: "Instalación física (rack, canalizado, equipos)",
    terminos: ["rack", "canalizado", "canalizacion", "cable", "cables", "cableado", "recablear",
      "patchera", "pdu", "protector", "tension", "modem", "switch", "conectado", "puerto", "puertos",
      "limpieza", "unificacion", "unificar", "ordenamiento"],
  },
  {
    nombre: "GPS y ubicación",
    terminos: ["gps", "coordenada", "coordenadas", "ubicacion", "latitud", "longitud", "mapa",
      "georreferencia"],
  },
  {
    nombre: "Acceso y visita",
    terminos: ["acceso", "ausente", "cerrado", "cerrada", "reprogramar", "reprogramado", "visita",
      "no atendieron", "sin llave", "escuela cerrada", "no habia nadie"],
  },
] as const;

export const CATEGORIA_OTROS = "Otros motivos";
export const CATEGORIA_SIN_DETALLE = "Sin detalle registrado";

/**
 * Compara por PALABRA COMPLETA, no por subcadena — ver el bug 2 arriba.
 * Un término de varias palabras ("no atendieron") se compara como secuencia.
 */
function contienePalabra(texto: string, termino: string): boolean {
  const palabras = texto.split(" ");
  const buscadas = termino.split(" ");
  for (let i = 0; i + buscadas.length <= palabras.length; i++) {
    if (buscadas.every((b, j) => palabras[i + j] === b)) return true;
  }
  return false;
}

/**
 * A qué grupo pertenece un motivo.
 *
 * "Sin detalle registrado" y "Otros motivos" son distintos a propósito: el primero es que
 * nadie escribió nada —un problema de proceso— y el segundo que sí escribieron pero no
 * cae en ninguna categoría conocida. Si "Otros" crece, las categorías se desactualizaron
 * respecto de lo que escribe la gente: hay que mirar `terminosFrecuentes`, no agregar
 * palabras a ojo.
 */
export function clasificarMotivo(texto: string): string {
  const t = normalizarTexto(texto);
  if (!t) return CATEGORIA_SIN_DETALLE;
  for (const cat of CATEGORIAS_NC) {
    if (cat.terminos.some((termino) => contienePalabra(t, termino))) return cat.nombre;
  }
  return CATEGORIA_OTROS;
}

/** Palabras vacías: aparecen en todos lados y no dicen en qué se está fallando. */
const VACIAS = new Set([
  "que", "para", "con", "sin", "del", "las", "los", "por", "una", "uno", "unos", "unas",
  "esta", "este", "estos", "estas", "desde", "hasta", "sobre", "entre", "fue", "fueron",
  "hay", "muy", "mas", "pero", "porque", "donde", "cuando", "como", "solo", "nota",
  "notas", "predio", "tecnico", "mesa", "ayuda", "aun", "aunque", "sino", "debe", "deben",
  "quedo", "queda", "falta", "faltan", "tiene", "tener", "ninguna", "ninguno", "mismo",
  "misma", "mismos", "mismas", "todo", "toda", "todos", "todas", "favor", "gracias",
  "buenas", "buen", "dia", "senor", "revisar", "corregir", "hacer", "realizar", "verificar",
  "otro", "otra", "estar", "creo", "encuentra", "observa", "corresponde", "correspondiente",
]);

/** Términos con contenido de un motivo, para calibrar las categorías con datos reales. */
export function palabrasClave(texto: string): string[] {
  const t = normalizarTexto(texto);
  if (!t) return [];
  return t.split(" ").filter((p) => p.length >= 4 && !VACIAS.has(p) && !/^\d+$/.test(p));
}

/**
 * Los términos más repetidos de un conjunto de motivos.
 *
 * Es la herramienta para responder "cuál es el indicador común de fallos" sin inventar:
 * en vez de decidir las categorías a ojo, se miran las palabras que de verdad aparecen.
 */
export function terminosFrecuentes(
  motivos: string[],
  limite = 20
): Array<{ termino: string; veces: number }> {
  const cuenta = new Map<string, number>();
  for (const m of motivos) {
    // Una palabra repetida dentro de un mismo motivo cuenta una vez: si no, un comentario
    // largo que insiste con un término lo instala como problema general.
    // Array.from y no spread: el target de tsconfig no itera Sets directamente.
    for (const p of Array.from(new Set(palabrasClave(m)))) {
      cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
    }
  }
  return Array.from(cuenta.entries())
    .map(([termino, veces]) => ({ termino, veces }))
    .sort((a, b) => b.veces - a.veces || a.termino.localeCompare(b.termino, "es"))
    .slice(0, limite);
}
