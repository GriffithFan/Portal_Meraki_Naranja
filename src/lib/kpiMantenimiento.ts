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
import { inicioSemana, SEMANA_MS } from "@/lib/semanaRanking";

const NO_CONTABILIZAR = ["Gustavo"];

export interface SemanaKpi {
  desde: string;            // ISO (yyyy-mm-dd) del sábado de inicio
  etiqueta: string;         // dd/mm
  tecnicos: number;
  incidencias: number;      // las de MANTENIMIENTO (el indicador que se publica)
  porProvincia: Record<string, number>;
  // ── Volumen total de la semana (todas las incidencias, no solo mantenimiento) ──
  conformes: number;        // predios que pasaron a CONFORME
  noConformes: number;      // predios que pasaron a NO CONFORME
  trabajos: number;         // conformes + NC = intentos cerrados en la semana
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
      provincia: true, tipoIncidencia: true, fechaActualizacion: true,
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

  for (const p of predios) {
    if (!esMantenimiento(p.tipoIncidencia)) continue;
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
    const prov = p.provincia || "Sin provincia";
    porSemana[k].prov[prov] = (porSemana[k].prov[prov] || 0) + 1;
    const m = (matriz[u.nombre] ??= { th: u.thNumero, sem: {} });
    m.sem[k] = (m.sem[k] || 0) + 1;
  }

  // ── Volumen total de la semana: conformes y NC por transicion de estado ──
  // Se lee de Actividad (no del estado actual del predio) para contar el EVENTO en
  // la semana en que ocurrio, aunque despues el predio haya vuelto a cambiar.
  const transiciones = await prisma.actividad.findMany({
    where: { entidad: "PREDIO", descripcion: { contains: "Estado:" }, createdAt: { gte: primera, lte: hasta } },
    select: { descripcion: true, createdAt: true },
  });
  const volumen: Record<string, { conf: number; nc: number }> = {};
  claves.forEach((k) => (volumen[k] = { conf: 0, nc: 0 }));
  for (const a of transiciones) {
    const tr = parseTransicion(a.descripcion);
    if (!tr) continue;
    const esConforme = tr.despues === "conforme" && tr.antes !== "conforme";
    const esNc = tr.despues === "noconforme" && ORIGEN_NC.has(tr.antes);
    if (!esConforme && !esNc) continue;
    // Los NC solo cuentan de lunes a viernes (mismo criterio que el ranking).
    if (esNc) { const dow = a.createdAt.getDay(); if (dow === 0 || dow === 6) continue; }
    const k = inicioSemana(a.createdAt).toISOString().slice(0, 10);
    if (!volumen[k]) continue;
    if (esConforme) volumen[k].conf++; else volumen[k].nc++;
  }

  const semanas: SemanaKpi[] = claves.map((k) => ({
    desde: k, etiqueta: ddmm(k), tecnicos: porSemana[k].tec.size,
    incidencias: porSemana[k].n, porProvincia: porSemana[k].prov,
    conformes: volumen[k].conf, noConformes: volumen[k].nc,
    trabajos: volumen[k].conf + volumen[k].nc,
  }));
  const tecnicos: TecnicoKpi[] = Object.entries(matriz)
    .map(([nombre, d]) => {
      const vals = claves.map((k) => d.sem[k] || 0);
      const total = vals.reduce((a, b) => a + b, 0);
      const activas = vals.filter((v) => v > 0).length || 1;
      return { nombre, thNumero: d.th, porSemana: d.sem, total, promedio: +(total / activas).toFixed(1) };
    })
    .sort((a, b) => b.total - a.total);

  return { semanas, tecnicos, ultima: semanas[semanas.length - 1],
           totalPeriodo: semanas.reduce((a, s) => a + s.incidencias, 0), ultimaCerrada };
}

/** Texto listo para pegar en el correo. */
export function textoCorreo(d: DatosKpi): string {
  const u = d.ultima;
  const finSemana = new Date(new Date(u.desde).getTime() + 6 * 86400000).toLocaleDateString("es-AR");
  const iniSemana = new Date(u.desde).toLocaleDateString("es-AR");
  const prov = Object.entries(u.porProvincia).sort((a, b) => b[1] - a[1])
    .map(([p, n]) => `${p} ${n}`).join(" · ");
  const evol = d.semanas.map((s) => {
    const f = new Date(new Date(s.desde).getTime() + 6 * 86400000);
    return `- Semana del ${ddmm(s.desde)} al ${f.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}: ` +
           `${s.tecnicos} técnicos – ${s.incidencias} incidencias`;
  }).join("\n");
  // Volumen total: TODAS las incidencias, no solo las de mantenimiento.
  const volumen = d.semanas.map((s) => {
    const f = new Date(new Date(s.desde).getTime() + 6 * 86400000);
    const tasa = s.trabajos > 0 ? Math.round((s.conformes / s.trabajos) * 100) : 0;
    return `- Semana del ${ddmm(s.desde)} al ${f.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}: ` +
           `${s.trabajos} trabajos – ${s.conformes} conformes y ${s.noConformes} no conformes (${tasa}% de conformidad)`;
  }).join("\n");
  const top = d.tecnicos.slice(0, 3).map((t) => `${t.nombre} (${t.total})`).join(", ");

  return `Asunto: Indicador semanal — Técnicos activos en incidencias de mantenimiento

Alberto, Fernando:

Les comparto el indicador semanal. Adjunto la planilla con el detalle por técnico.

En la semana del ${iniSemana} al ${finSemana} trabajaron ${u.tecnicos} técnicos, que finalizaron ${u.incidencias} incidencias de mantenimiento (${prov}).

La evolución de las últimas ${d.semanas.length} semanas:

${evol}

Tomando todas las incidencias, no solo las de mantenimiento, el trabajo cerrado por semana fue:

${volumen}

Mayor volumen del período: ${top}.

Quedo atento a cualquier corte adicional que necesiten o si prefieren otra periodicidad.

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
  t2.value = `Período: ${ddmm(d.semanas[0].desde)} al ${finU.toLocaleDateString("es-AR")}   ·   ` +
             `Semana operativa: sábado a viernes   ·   Emitido: ${new Date().toLocaleDateString("es-AR")}`;
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
  tv.value = "VOLUMEN TOTAL POR SEMANA (todas las incidencias, no solo mantenimiento)";
  tv.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  tv.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  tv.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(rv).height = 22;
  rv++;

  const filasVol: Array<[string, (s: SemanaKpi) => number, string]> = [
    ["Trabajos cerrados", (s) => s.trabajos, AZUL2],
    ["Conformes", (s) => s.conformes, VERDE],
    ["No conformes", (s) => s.noConformes, ROJO],
    ["% de conformidad", (s) => (s.trabajos > 0 ? Math.round((s.conformes / s.trabajos) * 100) : 0), AZUL],
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

  ws.mergeCells(r + 3, 1, r + 3, nCols);
  const nota = ws.getCell(r + 3, 1);
  nota.value = "Criterio: se contabiliza al técnico que registró al menos una incidencia de mantenimiento finalizada en la semana (sábado a viernes). Verde: mejoró respecto de la primera semana del período.";
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

  return Buffer.from(await wb.xlsx.writeBuffer());
}
