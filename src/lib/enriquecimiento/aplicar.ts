/**
 * Lógica de enriquecimiento seguro de predios a partir del Excel del extractor.
 *
 * Réplica de lo validado a mano (SF 2026 / SF Capital): rellena campos vacíos,
 * actualiza las fechas de cronograma, agrega comentarios de incidencia no
 * genéricos a las notas, y NUNCA toca estado ni asignados. Saltea predios en
 * CONFORME y, si se pide, los ya enriquecidos. Ante un desalineamiento de
 * ubicación (departamento distinto o GPS a >5 km) marca conflicto y saltea.
 *
 * Es pura (no toca la BD): produce un plan de cambios que la ruta aplica o
 * previsualiza. Guarda los valores previos por predio para poder revertir.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type FilaReporte = Record<string, string>;

export interface PredioActual {
  id: string;
  codigo: string | null;
  estadoNombre: string | null;
  yaEnriquecido: boolean;
  ciudad: string | null;
  direccion: string | null;
  cue: string | null;
  cuePredio: string | null;
  gpsPredio: string | null;
  latitud: number | null;
  longitud: number | null;
  telefono: string | null;
  lab: string | null;
  nombreInstitucion: string | null;
  ambito: string | null;
  provincia: string | null;
  fechaDesde: Date | null;
  fechaHasta: Date | null;
  lacR: string | null;
  notas: string | null;
  camposExtra: Record<string, any> | null;
}

export interface ComentarioIncidencia {
  ni: string;
  fecha: string;
  com: string;
}

export interface PlanCambio {
  predioId: string;
  codigo: string;
  upd: Record<string, any>;
  extra: Record<string, string>;
  cambiosPrevios: Record<string, any>;
}

export interface OpcionesPlan {
  excluirConforme: boolean;
  excluirYaEnriquecidos: boolean;
}

export interface ResultadoPlan {
  cambios: PlanCambio[];
  stats: Record<string, number>;
  // Conflictos DUROS (departamento distinto): se saltea el predio entero.
  conflictos: { codigo: string; motivo: string }[];
  // GPS dudoso (reporte lejos del actual): se enriquece TODO menos el GPS.
  gpsOmitido: { codigo: string; dist: number }[];
  sinVerificar: string[];
  salteadosConforme: string[];
  salteadosYaEnriquecidos: string[];
  sinMatch: string[];
}

const PLACEHOLDER_LAB = new Set(["sin-adjudicar", "sin adjudicar", "sin_adjudicar", ""]);

// Coordenadas "basura" conocidas: valores placeholder que aparecen repetidos en
// predios de provincias distintas (no son ubicaciones reales). Cuando un predio
// las tiene, se tratan como GPS vacío para que el enriquecimiento las corrija.
const GPS_PLACEHOLDERS: [number, number][] = [
  [-34.75940139473794, -58.37239525447914], // se veía repetida en ER y Bs As (cerca de Quilmes)
];

function esGpsPlaceholder(coord: [number, number] | null): boolean {
  if (!coord) return false;
  return GPS_PLACEHOLDERS.some(
    ([la, ln]) => Math.abs(coord[0] - la) < 0.001 && Math.abs(coord[1] - ln) < 0.001
  );
}

function g(fila: FilaReporte, col: string): string {
  const v = fila[col];
  return v == null ? "" : String(v).trim();
}

function primero(fila: FilaReporte, cols: string[]): string {
  for (const c of cols) {
    const v = g(fila, c);
    if (v) return v;
  }
  return "";
}

/** Parsea DD/MM/YYYY → Date a mediodía UTC (mismo formato que Carrot ya usa). */
function aFecha(dstr: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(dstr || "");
  if (!m) return null;
  const [, d, mo, y] = m;
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T12:00:00.000Z`;
  const date = new Date(iso);
  return isNaN(date.getTime()) ? null : date;
}

/** Convierte GPS en grados-minutos-segundos (33°1'9''S 60°37'37''W) a decimal. */
function dmsADecimal(s: string): [number, number] | null {
  if (!s) return null;
  const matches = Array.from(s.matchAll(/(\d+)\D+(\d+)'(\d+)''?\s*([NSEWnsew])/g));
  if (matches.length < 2) return null;
  const conv = (m: RegExpMatchArray) => {
    const val = parseInt(m[1]) + parseInt(m[2]) / 60 + parseInt(m[3]) / 3600;
    return ["S", "W"].includes(m[4].toUpperCase()) ? -val : val;
  };
  return [conv(matches[0]), conv(matches[1])];
}

/** Parsea un GPS decimal ("-33.15S -60.55W" o "-33.15, -60.55") a [lat, lng]. */
function gpsDecimal(s: string | null): [number, number] | null {
  if (!s) return null;
  const nums = String(s).match(/-?\d+\.\d+/g);
  if (!nums || nums.length < 2) return null;
  return [parseFloat(nums[0]), parseFloat(nums[1])];
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Detecta comentarios genéricos (repetidos en ≥3 predios) para excluirlos. */
function detectarGenericos(comentariosPorCodigo: Map<string, ComentarioIncidencia[]>): Set<string> {
  const conteo = new Map<string, number>();
  for (const items of Array.from(comentariosPorCodigo.values())) {
    const vistos = new Set<string>();
    for (const it of items) {
      if (vistos.has(it.com)) continue;
      vistos.add(it.com);
      conteo.set(it.com, (conteo.get(it.com) || 0) + 1);
    }
  }
  const genericos = new Set<string>();
  for (const [com, n] of Array.from(conteo.entries())) if (n >= 3) genericos.add(com);
  return genericos;
}

function construirNotas(
  items: ComentarioIncidencia[],
  genericos: Set<string>,
  existente: string
): string | null {
  // Solo comentarios que NO estén ya en la nota actual: así el enriquecimiento
  // AGREGA los nuevos debajo sin borrar lo que había ni duplicar en cada corrida.
  const nuevos = items.filter(
    (it) => it.com && !genericos.has(it.com) && !existente.includes(it.com)
  );
  if (nuevos.length === 0) return null; // nada nuevo → no se toca la nota
  const fdate = (f: string) => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(f || "");
    return m ? `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}` : "";
  };
  const lineas = nuevos.map((it) => {
    const d = fdate(it.fecha);
    return `• ${d ? d + " — " : ""}${it.com}`;
  });
  if (existente) {
    // Ya hay nota: agregar solo las líneas nuevas debajo (sin repetir encabezado).
    return existente.trimEnd() + "\n" + lineas.join("\n");
  }
  const ni = nuevos[0].ni;
  return `Comentarios de incidencia${ni ? " " + ni : ""}:\n` + lineas.join("\n");
}

/**
 * Construye el plan de enriquecimiento. No escribe nada.
 * @param filas filas de la hoja Datos_Completos (una por par predio-incidencia)
 * @param prediosPorCodigo predios actuales de Carrot, indexados por código
 * @param comentariosPorCodigo comentarios de incidencia por código de predio
 */
export function planificarEnriquecimiento(
  filas: FilaReporte[],
  prediosPorCodigo: Map<string, PredioActual>,
  comentariosPorCodigo: Map<string, ComentarioIncidencia[]>,
  opciones: OpcionesPlan
): ResultadoPlan {
  const genericos = detectarGenericos(comentariosPorCodigo);
  const cambios: PlanCambio[] = [];
  const stats: Record<string, number> = {
    ciudad: 0, nombreInstitucion: 0, cuePredio: 0, telefono: 0, lab: 0, labPlaceholder: 0,
    ambito: 0, gpsPredio: 0, latlong: 0, fechaDesde: 0, fechaHasta: 0,
    aps: 0, utm: 0, switch: 0, z3: 0, notas: 0, lacRSi: 0, lacRNo: 0,
  };
  // Umbral LAC-R por antigüedad (en días enteros) de la fecha HASTA del cronograma:
  //   diff >= 29 → "NO" (cronograma viejo)  → todos los estados salvo CONFORME
  //   diff <  29 → "SI" (cronograma vigente) → solo SIN ASIGNAR
  const MS_DIA = 24 * 60 * 60 * 1000;
  const hoyDia = Math.floor(Date.now() / MS_DIA);
  const diffDias = (d: Date) => hoyDia - Math.floor(d.getTime() / MS_DIA);
  const conflictos: { codigo: string; motivo: string }[] = [];
  const gpsOmitido: { codigo: string; dist: number }[] = [];
  const sinVerificar: string[] = [];
  const salteadosConforme: string[] = [];
  const salteadosYaEnriquecidos: string[] = [];
  const sinMatch: string[] = [];

  for (const fila of filas) {
    const codigo = g(fila, "Numero_Predio");
    if (!codigo) continue;
    const p = prediosPorCodigo.get(codigo);
    if (!p) { sinMatch.push(codigo); continue; }
    if (g(fila, "Predio_Verificado").toUpperCase() !== "SI") { sinVerificar.push(codigo); continue; }
    // CONFORME NUNCA se modifica (regla dura, sin importar el toggle).
    if ((p.estadoNombre || "").trim().toUpperCase() === "CONFORME") {
      salteadosConforme.push(codigo); continue;
    }
    if (opciones.excluirYaEnriquecidos && p.yaEnriquecido) {
      salteadosYaEnriquecidos.push(codigo); continue;
    }

    // ── Guard DURO: departamento distinto = identidad sospechosa → saltear todo.
    //    (El extractor ya verifica por nombre, así que esto casi nunca dispara.)
    const depRep = primero(fila, ["Departamento_Reporte", "Incidencia_Departamento", "Predio_Departamento"]).toUpperCase();
    const depCur = (p.ciudad || "").trim().toUpperCase();
    if (depRep && depCur && depRep !== depCur) {
      conflictos.push({ codigo, motivo: `departamento distinto (actual "${depCur}" vs reporte "${depRep}")` });
      continue;
    }

    // ── GPS: el placeholder basura se trata como vacío (se corrige); un GPS que
    //    discrepa >5 km NO frena el predio: se enriquece todo lo demás y solo se
    //    deja el GPS sin tocar (dato dudoso, requiere decisión humana). ──
    const gpsRep = dmsADecimal(primero(fila, ["GPS_Reporte", "Predio_Coordenadas_GPS"]));
    let gpsCurRaw = gpsDecimal(p.gpsPredio);
    if (!gpsCurRaw && p.latitud != null && p.longitud != null) gpsCurRaw = [p.latitud, p.longitud];
    const curEsPlaceholder = esGpsPlaceholder(gpsCurRaw);
    const gpsCur = curEsPlaceholder ? null : gpsCurRaw; // placeholder = como si no tuviera GPS
    let gpsBloqueado = false;
    if (gpsRep && gpsCur) {
      const d = haversineKm(gpsRep, gpsCur);
      if (d > 5) { gpsBloqueado = true; gpsOmitido.push({ codigo, dist: d }); }
    }

    const upd: Record<string, any> = {};
    const extra: Record<string, string> = {};
    const previos: Record<string, any> = {};
    const cur = (f: keyof PredioActual) => String((p as any)[f] ?? "").trim();

    const rellenar = (campo: string, valor: string, stat: string) => {
      if (valor && !cur(campo as keyof PredioActual)) {
        upd[campo] = valor; previos[campo] = (p as any)[campo] ?? null; stats[stat]++;
      }
    };

    rellenar("ciudad", primero(fila, ["Departamento_Reporte", "Incidencia_Departamento", "Predio_Departamento"]), "ciudad");
    rellenar("nombreInstitucion", primero(fila, ["Institucion_Reporte", "Incidencia_Nombre_Escuela"]), "nombreInstitucion");
    rellenar("cuePredio", primero(fila, ["Predio_CUE_Predio", "CUE_Reporte"]), "cuePredio");
    rellenar("telefono", g(fila, "Predio_Telefono"), "telefono");
    rellenar("ambito", g(fila, "Predio_Ambito"), "ambito");

    // lab: rellenar si vacío o reemplazar placeholder ("Sin-Adjudicar")
    const labRep = primero(fila, ["Incidencia_Proveedor_LAB", "Predio_Proveedor_LAB"]);
    if (labRep) {
      const labCur = cur("lab");
      if (!labCur) { upd.lab = labRep; previos.lab = p.lab ?? null; stats.lab++; }
      else if (PLACEHOLDER_LAB.has(labCur.toLowerCase())) { upd.lab = labRep; previos.lab = p.lab ?? null; stats.labPlaceholder++; }
    }

    // GPS: solo si no está bloqueado por discrepancia. El placeholder cuenta como
    // vacío, así que se sobrescribe con el dato real del reporte.
    if (!gpsBloqueado) {
      const gpsTextoVacio = !cur("gpsPredio") || curEsPlaceholder;
      let gpsDec = gpsCur || gpsRep;
      if (gpsTextoVacio && gpsRep) {
        upd.gpsPredio = `${gpsRep[0].toFixed(6)}S ${gpsRep[1].toFixed(6)}W`;
        previos.gpsPredio = p.gpsPredio ?? null; stats.gpsPredio++;
        gpsDec = gpsDec || gpsRep;
      }
      if (gpsDec && (p.latitud == null || p.longitud == null || curEsPlaceholder)) {
        upd.latitud = Number(gpsDec[0].toFixed(6));
        upd.longitud = Number(gpsDec[1].toFixed(6));
        previos.latitud = p.latitud; previos.longitud = p.longitud; stats.latlong++;
      }
    }

    // Fechas de cronograma: actualizar al valor del reporte (dato nuevo)
    const di = aFecha(g(fila, "Cronograma_Inicio_Reporte"));
    const df = aFecha(g(fila, "Cronograma_Fin_Reporte"));
    if (di) {
      const curD = p.fechaDesde ? p.fechaDesde.toISOString().slice(0, 10) : "";
      if (curD !== di.toISOString().slice(0, 10)) { upd.fechaDesde = di; previos.fechaDesde = p.fechaDesde; stats.fechaDesde++; }
    }
    if (df) {
      const curH = p.fechaHasta ? p.fechaHasta.toISOString().slice(0, 10) : "";
      if (curH !== df.toISOString().slice(0, 10)) { upd.fechaHasta = df; previos.fechaHasta = p.fechaHasta; stats.fechaHasta++; }
    }

    // ── Regla LAC-R según antigüedad de la fecha HASTA del cronograma ──
    // Usa la HASTA efectiva (la nueva del reporte o la actual). CONFORME nunca se toca.
    const estadoUp = (p.estadoNombre || "").trim().toUpperCase();
    const hastaEfectiva: Date | null = (upd.fechaHasta as Date | undefined) ?? p.fechaHasta;
    if (estadoUp !== "CONFORME" && hastaEfectiva) {
      const diff = diffDias(hastaEfectiva);
      if (diff >= 29) {
        // Cronograma viejo (29 días o más) → NO, en todos los estados no-CONFORME.
        if (cur("lacR").toUpperCase() !== "NO") { upd.lacR = "NO"; previos.lacR = p.lacR ?? null; stats.lacRNo++; }
      } else if (estadoUp === "SIN ASIGNAR" || estadoUp === "NO CONFORME") {
        // Cronograma vigente (menos de 29 días) → SI, en SIN ASIGNAR y NO CONFORME.
        if (cur("lacR").toUpperCase() !== "SI") { upd.lacR = "SI"; previos.lacR = p.lacR ?? null; stats.lacRSi++; }
      }
    }

    // camposExtra cantidades: rellenar si vacío (formato "X,00" del reporte)
    const ce = (p.camposExtra && typeof p.camposExtra === "object") ? p.camposExtra : {};
    const rellenarExtra = (key: string, col: string, stat: string) => {
      const v = g(fila, col);
      if (v && !String(ce[key] ?? "").trim()) { extra[key] = v; stats[stat]++; }
    };
    rellenarExtra("cantidad_aps_instalados", "Incidencia_Cantidad_Aps_instalados", "aps");
    rellenarExtra("cantidad_utm_instalados", "Incidencia_Cantidad_UTM_instalados", "utm");
    rellenarExtra("cantidad_switchs_instalados", "Incidencia_Cantidad_Switchs_instalados", "switch");
    rellenarExtra("cantidad_de_z3", "Incidencia_Cantidad_de_Z3", "z3");

    // notas: comentarios de incidencia no genéricos, preservando lo existente
    const coments = comentariosPorCodigo.get(codigo) || [];
    const notas = construirNotas(coments, genericos, cur("notas"));
    if (notas != null && notas !== cur("notas")) {
      upd.notas = notas; previos.notas = p.notas ?? null; stats.notas++;
    }

    if (Object.keys(upd).length > 0 || Object.keys(extra).length > 0) {
      cambios.push({ predioId: p.id, codigo, upd, extra, cambiosPrevios: previos });
    }
  }

  return { cambios, stats, conflictos, gpsOmitido, sinVerificar, salteadosConforme, salteadosYaEnriquecidos, sinMatch };
}
