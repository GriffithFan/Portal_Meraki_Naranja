/**
 * Indicador semanal: técnicos de pisos activos ejecutando incidencias de
 * MANTENIMIENTO. Se publica los viernes a Alberto y Fernando.
 *
 * Reglas acordadas:
 *  - Semana operativa: sábado 06:00 → viernes 17:00 ART (la misma del ranking).
 *  - Se cuenta al técnico que cerró al menos una incidencia en la semana.
 *  - El crédito va al ÚLTIMO técnico asignado, salvo Gustavo: su trabajo se
 *    acredita al otro técnico asignado al predio (no se lo contabiliza).
 *  - Tipo de incidencia sin registrar = mantenimiento (verificado: en las
 *    semanas con dato completo el 100% son de mantenimiento).
 */
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { prediosFacturadosHasta, yaFueFacturado } from "@/lib/prediosFacturados";
import { provinciaCanonica } from "@/utils/provinciaUtils";
import { inicioSemana, SEMANA_MS } from "@/lib/semanaRanking";

const NO_CONTABILIZAR = ["Gustavo"];

export interface SemanaKpi {
  desde: string;            // ISO (yyyy-mm-dd) del sábado de inicio
  etiqueta: string;         // dd/mm
  tecnicos: number;
  incidencias: number;      // las de MANTENIMIENTO (el indicador que se publica)
  porProvincia: Record<string, number>;
  /**
   * ── Trabajo EJECUTADO en la semana y cómo termino ──────────────────────────
   * Vista de cohorte: se toman los predios que se trabajaron en campo esa semana
   * (entraron a INSTALADO / AUDITAR) y se los sigue hasta su desenlace, ocurra
   * cuando ocurra. El resultado se le imputa a la semana en que se HIZO el
   * trabajo, no a la semana en que se aprobo.
   *
   * Por eso `conformes + noConformes + sinRevisar === realizados` siempre. Contar
   * los conformes por la semana en que salieron daba sumas mayores al total de
   * realizados y se prestaba a malinterpretarse.
   */
  realizados: number;       // predios que pasaron a INSTALADO / AUDITAR esa semana
  conformes: number;        // de esos, los que terminaron aprobados
  noConformes: number;      // de esos, los que terminaron rechazados
  sinRevisar: number;       // de esos, los que todavia no se revisaron
  /** El mismo desenlace abierto por provincia. */
  porZona: Record<string, Desenlace>;
  /** Lo que se movio en la semana (predios unicos). Es la vista que se publica. */
  mov: Movimientos;
  movPorZona: Record<string, Movimientos>;
}

/**
 * Lo que se MOVIO en la semana, contado por predios unicos.
 *
 * Es la vista que se publica: cuantas conformidades nuevas hubo, cuantos NC nuevos
 * quedaron, y cuantos predios se trabajaron (entraron a INSTALADO/AUDITAR).
 *
 * Cada predio cuenta UNA vez por cuenta, aunque lo hayan trabajado dos tecnicos y aunque
 * rebote de estado varias veces en la semana. Se acredita al ultimo asignado, igual que
 * el ranking y la facturacion: sin eso, un predio compartido inflaba el total.
 */
export interface Movimientos {
  /** Predios que pasaron a CONFORME durante la semana. */
  conformes: number;
  /** Predios que pasaron a NO CONFORME viniendo de trabajo real. */
  ncNuevos: number;
  /** Predios que entraron a INSTALADO / AUDITAR: el trabajo ejecutado. */
  trabajados: number;
}

/** Trabajo realizado y en qué terminó. Siempre conformes + noConformes + sinRevisar = realizados. */
export interface Desenlace {
  realizados: number;
  conformes: number;
  noConformes: number;
  sinRevisar: number;
}

/** Desenlace del trabajo de un técnico, en total y semana por semana. */
export interface VolumenTecnico {
  nombre: string;
  thNumero: number | null;
  total: Desenlace;
  porSemana: Record<string, Desenlace>;
}
export interface TecnicoKpi {
  nombre: string;
  thNumero: number | null;
  porSemana: Record<string, number>;
  total: number;
  promedio: number;
}
export interface DatosKpi {
  semanas: SemanaKpi[];
  tecnicos: TecnicoKpi[];
  ultima: SemanaKpi;
  totalPeriodo: number;
  /** false si la última semana del informe todavía no cerró (viernes 17:00 ART). */
  ultimaCerrada: boolean;
  /** Trabajo realizado y su desenlace, por técnico. Mismo criterio de cohorte que `semanas`. */
  volumenTecnicos: VolumenTecnico[];
  /** Acumulado del período por provincia. */
  volumenZonas: Array<{ zona: string } & Desenlace>;
  /** Acumulado del período (suma de todas las semanas). */
  volumenTotal: Desenlace;
  /** Movimientos por tecnico, semana a semana y en total. */
  movTecnicos: Array<{ nombre: string; thNumero: number | null; total: Movimientos; porSemana: Record<string, Movimientos> }>;
  /** Movimientos por provincia, acumulado del periodo. */
  movZonas: Array<{ zona: string } & Movimientos>;
  /** Acumulado del periodo. */
  movTotal: Movimientos;
}

const nuevoMov = (): Movimientos => ({ conformes: 0, ncNuevos: 0, trabajados: 0 });

const nuevoDesenlace = (): Desenlace => ({ realizados: 0, conformes: 0, noConformes: 0, sinRevisar: 0 });

/** Índice de rechazo: NC sobre el trabajo YA REVISADO. Null si todavía no se revisó nada. */
export function tasaNc(d: Desenlace): number | null {
  const revisados = d.conformes + d.noConformes;
  if (revisados <= 0) return null;
  return Math.round((d.noConformes / revisados) * 1000) / 10;
}

/** Conformidad: la otra cara de la misma moneda. */
export function tasaConformidad(d: Desenlace): number | null {
  const t = tasaNc(d);
  return t === null ? null : Math.round((100 - t) * 10) / 10;
}

const esMantenimiento = (t: string | null) => {
  if (!t) return true;
  const s = t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return s.includes("mantenimiento") || s.includes("reparacion");
};

/**
 * Conformes y NC de la semana, contados por TRANSICION de estado (tabla Actividad),
 * con los mismos criterios que la matriz del ranking para que los numeros coincidan:
 *  - Conforme: pasa a CONFORME viniendo de cualquier otro estado.
 *  - NC: pasa a NO CONFORME viniendo de EN PROGRESO / INSTALADO / AUDITAR (asi no
 *    cuenta el NC administrativo de actualizar el LAC) y solo de lunes a viernes.
 * Ojo: esto mide TODAS las incidencias, no solo las de mantenimiento.
 */
const ORIGEN_NC = new Set(["enprogreso", "instalado", "auditar"]);

/**
 * Estados que significan "el tecnico ya trabajo el predio". Se cuenta la ENTRADA a
 * uno de ellos, no el estado actual, y se deduplica por predio dentro de la semana:
 * un predio que rebota (INSTALADO -> NC -> INSTALADO) se hizo una vez, y los cambios
 * que no son de estado (comentarios, notas) directamente no generan transicion.
 */
const REALIZADO = new Set(["instalado", "auditar"]);

const compacto = (v: string) =>
  (v || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_\s-]+/g, "");

function parseTransicion(desc?: string | null): { antes: string; despues: string } | null {
  const m = /Estado:\s*(.+?)\s*->\s*([^;]+)/.exec(desc || "");
  return m ? { antes: compacto(m[1]), despues: compacto(m[2]) } : null;
}

const ddmm = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

/**
 * dd/mm y dd/mm/aaaa propios. `toLocaleDateString("es-AR")` NO rellena el mes con
 * cero aunque se le pida `month: "2-digit"`, y el informe salia con fechas mezcladas
 * ("Semana del 25/07 al 31/7"). En un correo a dirección se nota.
 */
const p2 = (n: number) => String(n).padStart(2, "0");
const fDia = (d: Date) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
const fFecha = (d: Date) => `${fDia(d)}/${d.getFullYear()}`;

/**
 * Calcula el indicador de las últimas `nSemanas`.
 *
 * Por defecto solo entran semanas CERRADAS (la que está en curso queda afuera, que
 * es lo que corresponde para el envío automático de los viernes). Con
 * `incluirEnCurso` se agrega la semana actual con lo que va hasta el momento.
 *
 * Sirve para emitir el informe junto con el reporte de facturación, que se genera
 * los viernes alrededor de las 14 ART — o sea antes del cierre formal de las 17.
 * Con la misma hora de corte, los dos informes dan números consistentes.
 * `ultimaCerrada` queda expuesto por si algún consumidor necesita distinguirlo.
 */
export async function calcularKpi(nSemanas = 3, incluirEnCurso = false): Promise<DatosKpi> {
  const estado = await prisma.estadoConfig.findFirst({ where: { nombre: "CONFORME" }, select: { id: true } });
  if (!estado) throw new Error("No existe el estado CONFORME");

  const ahora = new Date();
  const iniActual = inicioSemana(ahora);
  const finActual = new Date(iniActual.getTime() + 6 * 86400000);
  finActual.setUTCHours(20, 0, 0, 0);                       // viernes 17:00 ART
  // si la semana en curso todavía no cerró, la última completa es la anterior
  const enCurso = ahora < finActual;
  const ultimaCerrada = !enCurso || !incluirEnCurso;
  const ultimaCompleta = enCurso && !incluirEnCurso ? new Date(iniActual.getTime() - SEMANA_MS) : iniActual;
  const primera = new Date(ultimaCompleta.getTime() - (nSemanas - 1) * SEMANA_MS);
  const hasta = new Date(ultimaCompleta.getTime() + 6 * 86400000);
  hasta.setUTCHours(20, 0, 0, 0);

  const predios = await prisma.predio.findMany({
    where: { estadoId: estado.id, fechaActualizacion: { gte: primera, lte: hasta } },
    select: {
      id: true, provincia: true, tipoIncidencia: true, fechaActualizacion: true,
      asignaciones: {
        where: { tipo: { in: ["TAREA", "TECNICO"] } },
        select: { createdAt: true, usuario: { select: { nombre: true, thNumero: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const claves: string[] = [];
  for (let i = 0; i < nSemanas; i++) {
    claves.push(new Date(primera.getTime() + i * SEMANA_MS).toISOString().slice(0, 10));
  }
  const porSemana: Record<string, { tec: Set<string>; n: number; prov: Record<string, number> }> = {};
  claves.forEach((k) => (porSemana[k] = { tec: new Set(), n: 0, prov: {} }));
  const matriz: Record<string, { th: number | null; sem: Record<string, number> }> = {};

  // Un predio ya facturado que vuelve a CONFORME no se cuenta otra vez (ver
  // lib/prediosFacturados.ts).
  const facturados = await prediosFacturadosHasta();

  for (const p of predios) {
    if (!esMantenimiento(p.tipoIncidencia)) continue;
    if (p.fechaActualizacion && yaFueFacturado(facturados, p.id, p.fechaActualizacion)) continue;
    let asignados = p.asignaciones.filter((a) => a.usuario);
    if (!asignados.length) continue;
    // Gustavo no se contabiliza: se acredita al otro técnico asignado
    if (NO_CONTABILIZAR.includes(asignados[asignados.length - 1].usuario!.nombre)) {
      asignados = asignados.filter((a) => !NO_CONTABILIZAR.includes(a.usuario!.nombre));
      if (!asignados.length) continue;
    }
    const u = asignados[asignados.length - 1].usuario!;
    const k = inicioSemana(new Date(p.fechaActualizacion!)).toISOString().slice(0, 10);
    if (!porSemana[k]) continue;
    porSemana[k].tec.add(u.nombre);
    porSemana[k].n++;
    const prov = provinciaCanonica(p.provincia) || "Sin provincia";
    porSemana[k].prov[prov] = (porSemana[k].prov[prov] || 0) + 1;
    const m = (matriz[u.nombre] ??= { th: u.thNumero, sem: {} });
    m.sem[k] = (m.sem[k] || 0) + 1;
  }

  // ── Trabajo ejecutado por semana y su desenlace (vista de cohorte) ──────────
  // Se traen las transiciones DESDE la primera semana HASTA AHORA (no hasta el fin
  // del periodo): el desenlace de lo realizado la ultima semana puede haber ocurrido
  // despues, y hay que capturarlo igual.
  const transiciones = await prisma.actividad.findMany({
    where: { entidad: "PREDIO", descripcion: { contains: "Estado:" }, createdAt: { gte: primera } },
    select: { entidadId: true, descripcion: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  type Evento = { fecha: Date; antes: string; despues: string };
  const eventos = new Map<string, Evento[]>();
  for (const a of transiciones) {
    const tr = parseTransicion(a.descripcion);
    if (!tr) continue;
    const lista = eventos.get(a.entidadId) || [];
    lista.push({ fecha: a.createdAt, antes: tr.antes, despues: tr.despues });
    eventos.set(a.entidadId, lista);
  }

  /** ¿Este evento cierra la revision del predio? Devuelve el desenlace o null. */
  const desenlaceDe = (e: Evento): "conforme" | "noconforme" | null => {
    if (e.despues === "conforme" && e.antes !== "conforme") return "conforme";
    if (e.despues === "noconforme" && ORIGEN_NC.has(e.antes)) {
      // Los NC solo cuentan de lunes a viernes (mismo criterio que el ranking).
      const dow = e.fecha.getDay();
      if (dow === 0 || dow === 6) return null;
      return "noconforme";
    }
    return null;
  };

  const volumen: Record<string, { realiz: number; conf: number; nc: number; pend: number }> = {};
  claves.forEach((k) => (volumen[k] = { realiz: 0, conf: 0, nc: 0, pend: 0 }));

  // Para abrir el desenlace por técnico y por zona hace falta saber, de cada predio de
  // la cohorte, quién lo trabajó y dónde está. La consulta de arriba no sirve: esa trae
  // solo los CONFORME de mantenimiento, y acá entran todos los predios que pasaron por
  // INSTALADO/AUDITAR, terminen como terminen.
  const idsCohorte = Array.from(eventos.keys());
  const datosCohorte = idsCohorte.length
    ? await prisma.predio.findMany({
        where: { id: { in: idsCohorte } },
        select: {
          id: true, provincia: true,
          asignaciones: {
            where: { tipo: { in: ["TAREA", "TECNICO"] } },
            select: { createdAt: true, usuario: { select: { nombre: true, thNumero: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      })
    : [];
  /** Mismo criterio que el resto del informe: el último asignado, salteando a Gustavo. */
  const responsableDe = new Map<string, { nombre: string; thNumero: number | null } | null>();
  const zonaDe = new Map<string, string>();
  for (const p of datosCohorte) {
    zonaDe.set(p.id, provinciaCanonica(p.provincia) || "Sin provincia");
    let asignados = p.asignaciones.filter((a) => a.usuario);
    if (asignados.length && NO_CONTABILIZAR.includes(asignados[asignados.length - 1].usuario!.nombre)) {
      asignados = asignados.filter((a) => !NO_CONTABILIZAR.includes(a.usuario!.nombre));
    }
    const u = asignados.length ? asignados[asignados.length - 1].usuario! : null;
    responsableDe.set(p.id, u ? { nombre: u.nombre, thNumero: u.thNumero } : null);
  }

  const volTecnicos = new Map<string, { th: number | null; total: Desenlace; sem: Record<string, Desenlace> }>();
  const volZonas: Record<string, Record<string, Desenlace>> = {};
  claves.forEach((k) => (volZonas[k] = {}));

  const sumar = (d: Desenlace, cual: "conformes" | "noConformes" | "sinRevisar") => {
    d.realizados++;
    d[cual]++;
  };

  for (const [predioId, lista] of Array.from(eventos.entries())) {
    // Primera vez que el predio entro a INSTALADO/AUDITAR en cada semana del periodo.
    const primeraDeLaSemana = new Map<string, Date>();
    for (const e of lista) {
      if (!REALIZADO.has(e.despues) || REALIZADO.has(e.antes)) continue;
      const k = inicioSemana(e.fecha).toISOString().slice(0, 10);
      if (!volumen[k] || primeraDeLaSemana.has(k)) continue;
      primeraDeLaSemana.set(k, e.fecha);
    }
    for (const [k, cuando] of Array.from(primeraDeLaSemana.entries())) {
      volumen[k].realiz++;
      // Desenlace = la primera revision POSTERIOR a ese trabajo, sin importar en
      // que semana haya caido.
      const cierre = lista.find((e: Evento) => e.fecha > cuando && desenlaceDe(e) !== null);
      const cual: "conformes" | "noConformes" | "sinRevisar" =
        !cierre ? "sinRevisar" : desenlaceDe(cierre) === "conforme" ? "conformes" : "noConformes";
      if (cual === "sinRevisar") volumen[k].pend++;
      else if (cual === "conformes") volumen[k].conf++;
      else volumen[k].nc++;

      const zona = zonaDe.get(predioId) || "Sin provincia";
      sumar((volZonas[k][zona] ??= nuevoDesenlace()), cual);

      const resp = responsableDe.get(predioId);
      if (resp) {
        const t = volTecnicos.get(resp.nombre)
          ?? { th: resp.thNumero, total: nuevoDesenlace(), sem: {} };
        sumar(t.total, cual);
        sumar((t.sem[k] ??= nuevoDesenlace()), cual);
        volTecnicos.set(resp.nombre, t);
      }
    }
  }

  // ── Movimientos de la semana: conformes, NC nuevos y trabajados ────────────
  // Se cuenta por PREDIO UNICO y por semana en que ocurrio el movimiento. Distinto de la
  // cohorte de arriba, que imputa el desenlace a la semana en que se HIZO el trabajo.
  // Las dos vistas conviven a proposito: la cohorte dice como salio lo que se trabajo,
  // esta dice que paso durante la semana.
  const mov: Record<string, Movimientos> = {};
  const movZona: Record<string, Record<string, Movimientos>> = {};
  const movTec = new Map<string, { th: number | null; total: Movimientos; sem: Record<string, Movimientos> }>();
  claves.forEach((k) => { mov[k] = nuevoMov(); movZona[k] = {}; });

  const yaContado = new Set<string>();
  for (const [predioId, lista] of Array.from(eventos.entries())) {
    for (const e of lista) {
      const k = inicioSemana(e.fecha).toISOString().slice(0, 10);
      if (!mov[k]) continue;
      let cual: keyof Movimientos | null = null;
      if (e.despues === "conforme" && e.antes !== "conforme") cual = "conformes";
      else if (desenlaceDe(e) === "noconforme") cual = "ncNuevos";
      else if (REALIZADO.has(e.despues) && !REALIZADO.has(e.antes)) cual = "trabajados";
      if (!cual) continue;

      // Un predio que rebota en la misma semana cuenta una sola vez por cuenta.
      const clave = `${predioId}|${k}|${cual}`;
      if (yaContado.has(clave)) continue;
      yaContado.add(clave);

      // Un conforme de un predio ya facturado antes no es trabajo nuevo.
      if (cual === "conformes" && yaFueFacturado(facturados, predioId, e.fecha)) continue;

      mov[k][cual]++;
      const zona = zonaDe.get(predioId) || "Sin provincia";
      (movZona[k][zona] ??= nuevoMov())[cual]++;
      const resp = responsableDe.get(predioId);
      if (resp) {
        const t = movTec.get(resp.nombre) ?? { th: resp.thNumero, total: nuevoMov(), sem: {} };
        t.total[cual]++;
        (t.sem[k] ??= nuevoMov())[cual]++;
        movTec.set(resp.nombre, t);
      }
    }
  }

  const semanas: SemanaKpi[] = claves.map((k) => ({
    desde: k, etiqueta: ddmm(k), tecnicos: porSemana[k].tec.size,
    incidencias: porSemana[k].n, porProvincia: porSemana[k].prov,
    realizados: volumen[k].realiz,
    conformes: volumen[k].conf,
    noConformes: volumen[k].nc,
    sinRevisar: volumen[k].pend,
    porZona: volZonas[k],
    mov: mov[k],
    movPorZona: movZona[k],
  }));
  const tecnicos: TecnicoKpi[] = Object.entries(matriz)
    .map(([nombre, d]) => {
      const vals = claves.map((k) => d.sem[k] || 0);
      const total = vals.reduce((a, b) => a + b, 0);
      const activas = vals.filter((v) => v > 0).length || 1;
      return { nombre, thNumero: d.th, porSemana: d.sem, total, promedio: +(total / activas).toFixed(1) };
    })
    .sort((a, b) => b.total - a.total);

  const volumenTecnicos: VolumenTecnico[] = Array.from(volTecnicos.entries())
    .map(([nombre, d]) => ({ nombre, thNumero: d.th, total: d.total, porSemana: d.sem }))
    .sort((a, b) => b.total.realizados - a.total.realizados || a.nombre.localeCompare(b.nombre, "es"));

  const zonasAcum: Record<string, Desenlace> = {};
  for (const k of claves) {
    for (const [zona, d] of Object.entries(volZonas[k])) {
      const acc = (zonasAcum[zona] ??= nuevoDesenlace());
      acc.realizados += d.realizados; acc.conformes += d.conformes;
      acc.noConformes += d.noConformes; acc.sinRevisar += d.sinRevisar;
    }
  }
  const volumenZonas = Object.entries(zonasAcum)
    .map(([zona, d]) => ({ zona, ...d }))
    .sort((a, b) => b.realizados - a.realizados);

  const volumenTotal = semanas.reduce((acc, s) => ({
    realizados: acc.realizados + s.realizados,
    conformes: acc.conformes + s.conformes,
    noConformes: acc.noConformes + s.noConformes,
    sinRevisar: acc.sinRevisar + s.sinRevisar,
  }), nuevoDesenlace());

  const movTecnicos = Array.from(movTec.entries())
    .map(([nombre, d]) => ({ nombre, thNumero: d.th, total: d.total, porSemana: d.sem }))
    .sort((a, b) => b.total.conformes - a.total.conformes || a.nombre.localeCompare(b.nombre, "es"));

  const zonasMov: Record<string, Movimientos> = {};
  for (const k of claves) for (const [z, m] of Object.entries(movZona[k])) {
    const acc = (zonasMov[z] ??= nuevoMov());
    acc.conformes += m.conformes; acc.ncNuevos += m.ncNuevos; acc.trabajados += m.trabajados;
  }
  const movZonas = Object.entries(zonasMov).map(([zona, m]) => ({ zona, ...m }))
    .sort((a, b) => b.conformes - a.conformes);
  const movTotal = semanas.reduce((a, sm) => ({
    conformes: a.conformes + sm.mov.conformes,
    ncNuevos: a.ncNuevos + sm.mov.ncNuevos,
    trabajados: a.trabajados + sm.mov.trabajados,
  }), nuevoMov());

  return { semanas, tecnicos, ultima: semanas[semanas.length - 1], movTecnicos, movZonas, movTotal,
           totalPeriodo: semanas.reduce((a, s) => a + s.incidencias, 0), ultimaCerrada,
           volumenTecnicos, volumenZonas, volumenTotal };
}

/** Texto listo para pegar en el correo. */
/**
 * Borrador del correo a dirección.
 *
 * Es un RESUMEN a propósito. La version anterior listaba semana por semana, provincia por
 * provincia y tecnico por tecnico, dos veces —una por movimientos y otra por cohorte— y
 * quedaba tan larga que no se leia. El detalle completo va en la planilla adjunta.
 *
 * Lo que tiene que poder responderse de un vistazo: como viene la evolucion, que
 * porcentaje de conformidad hay, y cuantos predios se trabajaron.
 */
export function textoCorreo(d: DatosKpi): string {
  const u = d.ultima;
  const iniSemana = fFecha(new Date(u.desde));
  const finSemana = fFecha(new Date(new Date(u.desde).getTime() + 6 * 86400000));

  /** Conformidad sobre lo resuelto: conformes / (conformes + NC). */
  const conf = (m: Movimientos) => {
    const base = m.conformes + m.ncNuevos;
    return base > 0 ? Math.round((m.conformes / base) * 100) : null;
  };
  const pct = (m: Movimientos) => { const c = conf(m); return c === null ? "s/d" : `${c}%`; };
  /** Porcentaje de NC sobre lo resuelto. Es el numero que se sigue semana a semana. */
  const pctNc = (m: Movimientos) => {
    const base = m.conformes + m.ncNuevos;
    return base > 0 ? `${Math.round((m.ncNuevos / base) * 1000) / 10}%` : "s/d";
  };

  // Tabla alineada: en un correo de texto plano es lo unico que se lee de un vistazo.
  const col = (t: string | number, n: number) => String(t).padStart(n);
  const filaSem = (etiqueta: string, m: Movimientos) =>
    `  ${etiqueta.padEnd(16)}${col(m.conformes, 10)}${col(m.ncNuevos, 11)}${col(m.trabajados, 12)}${col(pctNc(m), 9)}${col(pct(m), 13)}`;

  const tabla = [
    `  ${"Semana".padEnd(16)}${col("Conformes", 10)}${col("No conf.", 11)}${col("Trabajados", 12)}${col("% NC", 9)}${col("Conformidad", 13)}`,
    `  ${"-".repeat(71)}`,
    ...d.semanas.map((sm) => filaSem(`${ddmm(sm.desde)} al ${fDia(new Date(new Date(sm.desde).getTime() + 6 * 86400000))}`, sm.mov)),
    `  ${"-".repeat(71)}`,
    filaSem("Total", d.movTotal),
  ].join("\n");

  // Se dice explicitamente "de NC": la version anterior ponia el porcentaje de
  // conformidad pegado al numero de NC —"28 NC (88%)"— y se leia como si el 88 fuera
  // el rechazo. En un correo a direccion eso se malinterpreta una sola vez y ya.
  const zonas = d.movZonas
    .filter((z) => z.conformes + z.ncNuevos > 0)
    .map((z) => `${z.zona}: ${z.conformes} conformes y ${z.ncNuevos} NC, ${pctNc(z)} de NC`)
    .join(" · ");

  const previa = d.semanas.length > 1 ? d.semanas[d.semanas.length - 2].mov : null;
  const delta = previa ? u.mov.conformes - previa.conformes : 0;
  const tendencia = !previa ? ""
    : delta > 0 ? ` (${delta} más que la semana anterior)`
    : delta < 0 ? ` (${Math.abs(delta)} menos que la semana anterior)`
    : " (igual que la semana anterior)";

  return `Asunto: Indicador semanal — Semana del ${iniSemana} al ${finSemana}

Alberto, Fernando:

Les comparto el indicador de la semana. Adjunto la planilla con el detalle por técnico y por zona.

En la semana del ${iniSemana} al ${finSemana} trabajaron ${u.tecnicos} técnicos, con ${u.mov.conformes} conformidades${tendencia} y ${u.mov.ncNuevos} no conformidades nuevas sobre ${u.mov.trabajados} predios trabajados.

Evolución de las últimas ${d.semanas.length} semanas:

${tabla}

Por provincia en el período: ${zonas}.

"Trabajados" son los predios que entraron a instalación o auditoría en la semana. La conformidad se calcula sobre lo ya resuelto (conformes sobre conformes más no conformes).

Quedo atento a cualquier corte adicional que necesiten.

Saludos,
Ulises`;
}

/** Excel presentable para adjuntar. */
export async function excelKpi(d: DatosKpi): Promise<Buffer> {
  const AZUL = "FF1F3864", AZUL2 = "FF2E5C99", GRIS = "FFF2F5F9", VERDE = "FF2E7D32", ROJO = "FFC62828";
  const wb = new ExcelJS.Workbook();
  wb.creator = "THNET — Carrot";
  wb.created = new Date();

  const nCols = 2 + d.semanas.length + 2;
  const ws = wb.addWorksheet("Indicador semanal", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 5 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.mergeCells(1, 1, 1, nCols);
  const t1 = ws.getCell(1, 1);
  t1.value = "TÉCNICOS DE PISOS ACTIVOS EN INCIDENCIAS DE MANTENIMIENTO";
  t1.font = { size: 15, bold: true, color: { argb: "FFFFFFFF" } };
  t1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  t1.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, nCols);
  const finU = new Date(new Date(d.ultima.desde).getTime() + 6 * 86400000);
  const t2 = ws.getCell(2, 1);
  t2.value = `Período: ${ddmm(d.semanas[0].desde)} al ${fFecha(finU)}   ·   ` +
             `Semana operativa: sábado a viernes   ·   Emitido: ${fFecha(new Date())}`;
  t2.font = { size: 10, italic: true, color: { argb: "FF555555" } };
  t2.alignment = { horizontal: "center" };
  ws.getRow(3).height = 6;

  const tarjetas: [string, number | string][] = [
    ["Técnicos activos (última semana)", d.ultima.tecnicos],
    ["Incidencias finalizadas (última semana)", d.ultima.incidencias],
    ["Total del período", d.totalPeriodo],
  ];
  let col = 1;
  for (const [txt, val] of tarjetas) {
    ws.mergeCells(4, col, 4, col + 1);
    const c = ws.getCell(4, col);
    c.value = `${txt}:  ${val}`;
    c.font = { bold: true, size: 11, color: { argb: AZUL } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    const b = { style: "thin" as const, color: { argb: "FFBBBBBB" } };
    c.border = { top: b, bottom: b, left: b, right: b };
    col += 2;
  }
  ws.getRow(4).height = 24;

  const cab = ["TH", "Técnico", ...d.semanas.map((s) => s.etiqueta), "Total", "Prom."];
  const hr = ws.getRow(5);
  cab.forEach((v, i) => {
    const c = hr.getCell(i + 1);
    c.value = v;
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL2 } };
    c.alignment = { horizontal: i < 2 ? "left" : "center", vertical: "middle" };
    c.border = { bottom: { style: "medium", color: { argb: AZUL } } };
  });
  hr.height = 22;

  let r = 6;
  for (const t of d.tecnicos) {
    const vals = d.semanas.map((s) => t.porSemana[s.desde] || 0);
    const row = ws.getRow(r);
    row.getCell(1).value = t.thNumero ? `TH${String(t.thNumero).padStart(2, "0")}` : "";
    row.getCell(2).value = t.nombre;
    vals.forEach((v, i) => (row.getCell(3 + i).value = v || null));
    row.getCell(2 + d.semanas.length + 1).value = t.total;
    row.getCell(2 + d.semanas.length + 2).value = t.promedio;
    row.eachCell({ includeEmpty: true }, (c, i) => {
      c.alignment = { horizontal: i < 3 ? "left" : "center" };
      c.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
      if (r % 2 === 0) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
    });
    row.getCell(2).font = { bold: true };
    row.getCell(2 + d.semanas.length + 1).font = { bold: true, color: { argb: AZUL } };
    const ini = vals[0], fin = vals[vals.length - 1];
    if (ini && fin) {
      const c = row.getCell(2 + d.semanas.length);
      if (fin > ini) c.font = { bold: true, color: { argb: VERDE } };
      else if (fin < ini) c.font = { color: { argb: ROJO } };
    }
    row.height = 18;
    r++;
  }

  const tr = ws.getRow(r);
  tr.getCell(2).value = "TOTAL INCIDENCIAS";
  d.semanas.forEach((s, i) => (tr.getCell(3 + i).value = s.incidencias));
  tr.getCell(2 + d.semanas.length + 1).value = d.totalPeriodo;
  tr.eachCell({ includeEmpty: true }, (c, i) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL2 } };
    c.alignment = { horizontal: i < 3 ? "left" : "center" };
  });
  const ar = ws.getRow(r + 1);
  ar.getCell(2).value = "TÉCNICOS ACTIVOS";
  d.semanas.forEach((s, i) => (ar.getCell(3 + i).value = s.tecnicos));
  ar.eachCell({ includeEmpty: true }, (c, i) => {
    c.font = { bold: true, color: { argb: AZUL } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
    c.alignment = { horizontal: i < 3 ? "left" : "center" };
  });

  // ── Volumen total: TODAS las incidencias, no solo las de mantenimiento ──
  let rv = r + 3;
  ws.mergeCells(rv, 1, rv, nCols);
  const tv = ws.getCell(rv, 1);
  tv.value = "RESULTADO DE CADA SEMANA (todas las incidencias, predios únicos)";
  tv.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  tv.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  tv.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(rv).height = 22;
  rv++;

  const porc = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 100) : 0);
  // Estos son los MISMOS numeros que muestra la pantalla y el correo: predios unicos que
  // se movieron en la semana. Antes esta seccion usaba la vista de cohorte -de lo
  // trabajado en la semana, cuanto termino aprobado- y daba 104 donde el resto de la
  // planilla decia 120. Tres cifras distintas de "conformes" en el mismo archivo: nadie
  // podia saber cual mirar.
  const filasVol: Array<[string, (s: SemanaKpi) => number, string]> = [
    ["Predios trabajados (pasaron a instalar/auditar)", (s) => s.mov.trabajados, AZUL2],
    ["→ Conformes", (s) => s.mov.conformes, VERDE],
    ["→ No conformes nuevos", (s) => s.mov.ncNuevos, ROJO],
    ["% de NC (sobre lo resuelto)", (s) => porc(s.mov.ncNuevos, s.mov.conformes + s.mov.ncNuevos), ROJO],
    ["% de conformidad (sobre lo resuelto)", (s) => porc(s.mov.conformes, s.mov.conformes + s.mov.ncNuevos), AZUL],
  ];
  for (const [etiqueta, valor, color] of filasVol) {
    const esPorcentaje = etiqueta.startsWith("%");
    const row = ws.getRow(rv);
    row.getCell(2).value = etiqueta;
    d.semanas.forEach((s, i) => {
      const c = row.getCell(3 + i);
      c.value = esPorcentaje ? valor(s) / 100 : valor(s);
      if (esPorcentaje) c.numFmt = "0%";
    });
    if (!esPorcentaje) {
      row.getCell(2 + d.semanas.length + 1).value = d.semanas.reduce((a, s) => a + valor(s), 0);
    }
    row.eachCell({ includeEmpty: true }, (c, i) => {
      c.font = { bold: true, color: { argb: color } };
      c.alignment = { horizontal: i < 3 ? "left" : "center" };
      c.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
    });
    row.height = 18;
    rv++;
  }
  // La nota al pie va debajo del bloque (antes vivia en r + 3, que ahora ocupa este).
  const filaNota = rv + 1;

  ws.mergeCells(filaNota, 1, filaNota, nCols);
  const nota = ws.getCell(filaNota, 1);
  nota.value = "Indicador (tabla de arriba): se contabiliza al técnico que registró al menos una incidencia de mantenimiento finalizada en la semana (sábado a viernes). Verde: mejoró respecto de la primera semana del período. "
    + "Trabajo ejecutado (tabla de abajo): predios que pasaron a INSTALADO o AUDITAR, contados una vez por predio y por semana; los cambios que no son de estado, como un comentario, no suman. "
    + "A cada predio se le imputa el resultado que terminó teniendo aunque la revisión haya ocurrido semanas después, por eso conformes + no conformes + sin revisar da siempre el total realizado. "
    + "La última semana suele tener varios sin revisar: su % de conformidad se calcula solo sobre lo ya revisado y todavía puede moverse.";
  nota.font = { size: 9, italic: true, color: { argb: "FF666666" } };
  nota.alignment = { wrapText: true, vertical: "top" };

  ws.getColumn(1).width = 7;
  ws.getColumn(2).width = 24;
  d.semanas.forEach((_, i) => (ws.getColumn(3 + i).width = 11));
  ws.getColumn(2 + d.semanas.length + 1).width = 10;
  ws.getColumn(2 + d.semanas.length + 2).width = 9;

  // ── hoja por provincia ──
  const wp = wb.addWorksheet("Por provincia");
  const provincias = Array.from(
    new Set(d.semanas.flatMap((s) => Object.keys(s.porProvincia)))
  ).sort();
  const cabP = ["Provincia", ...d.semanas.map((s) => s.etiqueta), "Total"];
  const hp = wp.getRow(1);
  cabP.forEach((v, i) => {
    const c = hp.getCell(i + 1);
    c.value = v;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL2 } };
    c.alignment = { horizontal: i === 0 ? "left" : "center" };
  });
  provincias.forEach((p, idx) => {
    const row = wp.getRow(idx + 2);
    row.getCell(1).value = p;
    let tot = 0;
    d.semanas.forEach((s, i) => {
      const n = s.porProvincia[p] || 0;
      tot += n;
      row.getCell(2 + i).value = n || null;
      row.getCell(2 + i).alignment = { horizontal: "center" };
    });
    row.getCell(2 + d.semanas.length).value = tot;
    row.getCell(2 + d.semanas.length).font = { bold: true, color: { argb: AZUL } };
    row.getCell(2 + d.semanas.length).alignment = { horizontal: "center" };
  });
  wp.getColumn(1).width = 22;
  d.semanas.forEach((_, i) => (wp.getColumn(2 + i).width = 11));
  wp.getColumn(2 + d.semanas.length).width = 10;

  // ── Conformidad y NC: por técnico, por zona y por semana ───────────────────
  // Va en hojas aparte para no ensuciar el indicador que se publica, que mide otra
  // cosa (técnicos activos en incidencias de mantenimiento).
  const cabecera = (ws: ExcelJS.Worksheet, cols: string[]) => {
    const h = ws.getRow(1);
    cols.forEach((v, i) => {
      const c = h.getCell(i + 1);
      c.value = v;
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL2 } };
      c.alignment = { horizontal: i === 0 ? "left" : "center" };
    });
  };

  // Las hojas "Conformidad por tecnico/zona/semana" se sacaron: usaban la vista de
  // cohorte -a cada predio se le imputa la semana en que se TRABAJO, con el resultado
  // que termino teniendo- y daban numeros distintos a los del resto de la planilla para
  // la misma palabra "conformes". Tener dos metodologias en el mismo archivo, sin que
  // nada lo aclarara, hacia imposible saber cual mirar. El calculo sigue existiendo en
  // `volumenTecnicos` / `volumenZonas` por si vuelve a hacer falta.

  // ── Movimientos: los mismos numeros que muestra la pantalla ────────────────
  // Faltaban en la planilla: se descargaba el Excel y no traia lo que se estaba viendo.
  const COLS_MOV = ["Conformes", "No conformes nuevos", "Trabajados", "Conformidad"];
  const filaMov = (row: ExcelJS.Row, desde: number, m: Movimientos) => {
    const base = m.conformes + m.ncNuevos;
    const c = base > 0 ? m.conformes / base : null;
    const vals: (number | string | null)[] = [m.conformes || null, m.ncNuevos || null, m.trabajados || null, c === null ? "s/d" : c];
    vals.forEach((v, i) => {
      const cel = row.getCell(desde + i);
      cel.value = v;
      cel.alignment = { horizontal: "center" };
      if (i === 3 && c !== null) {
        cel.numFmt = "0%";
        const p = c * 100;
        cel.font = { bold: true, color: { argb: p >= 90 ? VERDE : p >= 80 ? "FFB26A00" : ROJO } };
      }
    });
  };
  const hojaMov = (nombre: string, etiqueta: string, filas: Array<{ n: string; m: Movimientos }>) => {
    const w = wb.addWorksheet(nombre);
    cabecera(w, [etiqueta, ...COLS_MOV]);
    filas.forEach((f, i) => {
      const row = w.getRow(i + 2);
      row.getCell(1).value = f.n;
      filaMov(row, 2, f.m);
    });
    const tot = w.getRow(filas.length + 2);
    tot.getCell(1).value = "Total";
    tot.getCell(1).font = { bold: true, color: { argb: AZUL } };
    filaMov(tot, 2, d.movTotal);
    tot.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } }));
    w.getColumn(1).width = 26;
    COLS_MOV.forEach((_, i) => (w.getColumn(2 + i).width = 19));
  };

  hojaMov("Resumen por semana", "Semana", d.semanas.map((sm) => ({ n: sm.etiqueta, m: sm.mov })));
  hojaMov("Resumen por zona", "Provincia", d.movZonas.map((z) => ({ n: z.zona, m: z })));
  hojaMov("Resumen por técnico", "Técnico", d.movTecnicos.map((t) => ({
    n: t.thNumero ? `TH${String(t.thNumero).padStart(2, "0")} · ${t.nombre}` : t.nombre, m: t.total,
  })));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
