import { readFile, readdir, stat } from "fs/promises";
import path from "path";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Lectura de los paquetes de evidencias fotográficas (ODK/Kobo: LAC_M / USAP...)
 * que llegan por el chat como .zip. Cada envío guarda un submission.xml que mapea
 * cada foto a su PUNTO (campo RPTn / la foto geolocalizada de portada).
 */

// Leyenda RPT/campo -> nombre de punto, POR TIPO DE FORMULARIO (sfNetType).
// Cada tipo (USAP/GSAP/GAP) asigna sus propios puntos a los mismos RPT.
export const LEYENDAS_POR_TIPO: Record<string, Record<string, string>> = {
  USAP: {
    "a01Qn00000RQMfAIAX": "1 — Frente / Portada (geolocalizada)",
    "1": "2.1 — RACK LIMPIO, rotulado y cableado emprolijado (puerta ABIERTA)",
    "2": "2.2 — RACK LIMPIO, rotulado y cableado emprolijado (puerta CERRADA)",
    "4": "2.3 — MODEM del ISP dentro del RACK / 4G / Starlink",
    "5": "2.4 — Protector ETHERNET",
    "6": "2.5 — Protector FILTRO de TENSIÓN",
    "8": "3.1 — AP: instalación + canalización + rotulado (caja cerrada)",
    "9": "3.2 — AP: funcionamiento + roseta (caja abierta)",
    "13": "4.1 — GABINETE SECUNDARIO (puerta abierta y cerrada)",
    "14": "4.2 — CANALIZACIONES",
    "17": "5.1 — TOPOLOGÍA",
    "19": "5.2 — AP's conectados en GIGA",
    "21": "6.1 — COBERTURA: irradiación con MAC",
    "35": "6.2 — COBERTURA: navegación WiFi (todos los SSID)",
    "44": "7.1 — EVIDENCIAS",
    "45": "8.1 — ACTA de RELEVAMIENTO DE RED LOCAL",
    "60": "8.2 — ACTA DETALLE RED LOCAL",
    "61": "8.3 — ACTA de CONECTIVIDAD",
  },
  GSAP: {
    "1": "2.1 — GABINETE LIMPIO, rotulado y cableado emprolijado (puerta ABIERTA)",
    "2": "2.2 — GABINETE LIMPIO, rotulado y cableado emprolijado (puerta CERRADA)",
    "4": "2.3 — MODEM del ISP correspondiente / 4G / Starlink",
    "5": "2.4 — Protector ETHERNET",
    "6": "2.5 — Protector FILTRO de TENSIÓN",
    "8": "3.1 — AP: instalación + canalización + rotulado (caja cerrada)",
    "9": "3.2 — AP: funcionamiento + roseta (caja abierta)",
    "13": "4.1 — TOPOLOGÍA",
    "14": "4.2 — AP's conectados en GIGA",
    "17": "5.1 — COBERTURA: irradiación con MAC",
    "19": "5.2 — COBERTURA: navegación WiFi (todos los SSID)",
    "21": "6.1 — EVIDENCIAS",
    "35": "7.1 — ACTA de RELEVAMIENTO DE RED LOCAL",
    "44": "7.2 — ACTA DETALLE RED LOCAL",
    "45": "7.3 — ACTA de CONECTIVIDAD",
    "61": "7.4 — ACTA de UNIFICACIÓN (si corresponde)",
  },
  // GAP: INFERIDO (los campos de GAP son un subconjunto de GSAP: sin Evidencias
  // ni Unificación). A confirmar con la captura de puntos de un GAP.
  GAP: {
    "1": "2.1 — GABINETE LIMPIO, rotulado y cableado emprolijado (puerta ABIERTA)",
    "2": "2.2 — GABINETE LIMPIO, rotulado y cableado emprolijado (puerta CERRADA)",
    "4": "2.3 — MODEM del ISP correspondiente / 4G / Starlink",
    "5": "2.4 — Protector ETHERNET",
    "6": "2.5 — Protector FILTRO de TENSIÓN",
    "8": "3.1 — AP: instalación + canalización + rotulado (caja cerrada)",
    "9": "3.2 — AP: funcionamiento + roseta (caja abierta)",
    "13": "4.1 — TOPOLOGÍA",
    "14": "4.2 — AP's conectados en GIGA",
    "17": "5.1 — COBERTURA: irradiación con MAC",
    "19": "5.2 — COBERTURA: navegación WiFi (todos los SSID)",
    "35": "6.1 — ACTA de RELEVAMIENTO DE RED LOCAL",
    "44": "6.2 — ACTA DETALLE RED LOCAL",
    "45": "6.3 — ACTA de CONECTIVIDAD",
  },
};

export interface FotoEv { rel: string; hora: string }
export interface PuntoEv { clave: string; label: string; orden: number; fotos: FotoEv[] }
export interface EnvioEv {
  carpetaRel: string;
  nombre: string;
  draft: boolean | null;
  tecnico: string;
  cron: string;
  fecha: string;
  fechaOrden: number; // epoch ms para ordenar
  total: number;
  puntos: PuntoEv[];
}

function horaDe(archivo: string): string {
  const m = archivo.match(/-(\d{1,2})_(\d{1,2})_(\d{1,2})\.(?:jpe?g|png|heic)$/i);
  if (!m) return "";
  const p = (n: string) => String(parseInt(n, 10)).padStart(2, "0");
  return `${p(m[1])}:${p(m[2])}:${p(m[3])}`;
}

function labelDeClave(clave: string, tipo: string): string {
  const ley = LEYENDAS_POR_TIPO[tipo] || {};
  if (ley[clave]) return ley[clave];
  if (/^\d+$/.test(clave)) return `Punto ${clave}`;
  return "Frente / Portada";
}

function metaValor(texto: string, campo: string): string {
  const m = texto.match(new RegExp(`<${campo}>([^<]*)</${campo}>`));
  return m ? m[1] : "";
}

/** Parsea un submission.xml: metadata + fotos agrupadas por punto (en orden del formulario). */
export function parsearSubmission(texto: string, carpetaRel: string): { meta: any; puntos: PuntoEv[]; fechaOrden: number } {
  const tipoRed = metaValor(texto, "sfNetType");
  const meta = {
    tecnico: metaValor(texto, "sfUserId"),
    cron: `${metaValor(texto, "sfCronType")}/${tipoRed}`.replace(/^\/$/, ""),
    start: metaValor(texto, "start"),
    end: metaValor(texto, "end"),
    today: metaValor(texto, "today"),
  };

  const grupos = new Map<string, { orden: number; fotos: FotoEv[] }>();
  let i = 0;
  const re = /<([A-Za-z0-9_]+)\s+type="file">\s*([^<]+?\.(?:jpe?g|png|heic))\s*</gi;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(texto)) !== null) {
    i++;
    const campo = mm[1];
    const arch = mm[2].trim();
    const rpt = campo.match(/^RPT(\d+)_/);
    const clave = rpt ? rpt[1] : campo;
    if (!grupos.has(clave)) grupos.set(clave, { orden: i, fotos: [] });
    grupos.get(clave)!.fotos.push({ rel: `${carpetaRel}/${arch}`.replace(/\\/g, "/"), hora: horaDe(arch) });
  }

  const puntos: PuntoEv[] = Array.from(grupos.entries())
    .map(([clave, g]) => ({ clave, label: labelDeClave(clave, tipoRed), orden: g.orden, fotos: g.fotos.sort((a, b) => a.hora.localeCompare(b.hora)) }))
    .sort((a, b) => a.orden - b.orden);

  // Fecha para ordenar (más nuevo primero).
  let fechaOrden = 0;
  for (const cand of [meta.start, meta.end, meta.today]) {
    if (cand) { const t = Date.parse(cand); if (!Number.isNaN(t)) { fechaOrden = t; break; } }
  }
  return { meta, puntos, fechaOrden };
}

async function buscarSubmissions(dir: string, base: string, prof: number, acc: string[]) {
  if (prof > 5) return;
  let entries: any[];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await buscarSubmissions(full, base, prof + 1, acc);
    } else if (e.name.toLowerCase() === "submission.xml") {
      acc.push(full);
    }
  }
}

async function nombreLocal(carpetaEnvio: string): Promise<{ nombre: string; draft: boolean | null }> {
  const leaf = path.basename(carpetaEnvio);
  for (const metaDir of [path.dirname(carpetaEnvio), path.dirname(path.dirname(carpetaEnvio))]) {
    const metaPath = path.join(metaDir, "meta.json");
    try {
      const meta = JSON.parse(await readFile(metaPath, "utf8"));
      if (Array.isArray(meta)) {
        const found = meta.find((m: any) => m.folder === leaf);
        if (found) return { nombre: found["local name"] || leaf, draft: found.draft ?? null };
      }
    } catch { /* seguir */ }
  }
  return { nombre: leaf, draft: null };
}

/** Analiza una carpeta ya descomprimida y devuelve los envíos (más nuevo primero). */
export async function analizarPaquete(cacheDir: string): Promise<EnvioEv[]> {
  const xmls: string[] = [];
  await buscarSubmissions(cacheDir, cacheDir, 0, xmls);

  const envios: EnvioEv[] = [];
  for (const xmlPath of xmls) {
    const carpeta = path.dirname(xmlPath);
    const carpetaRel = path.relative(cacheDir, carpeta).replace(/\\/g, "/");
    let texto = "";
    try { texto = await readFile(xmlPath, "utf8"); } catch { continue; }
    const { meta, puntos, fechaOrden } = parsearSubmission(texto, carpetaRel);
    const ln = await nombreLocal(carpeta);
    // Descartar fotos cuyo archivo no exista en el paquete.
    for (const p of puntos) {
      const fotosOk: FotoEv[] = [];
      for (const f of p.fotos) {
        try { await stat(path.join(cacheDir, f.rel)); fotosOk.push(f); } catch { /* falta */ }
      }
      p.fotos = fotosOk;
    }
    const puntosConFotos = puntos.filter((p) => p.fotos.length > 0);
    const total = puntosConFotos.reduce((n, p) => n + p.fotos.length, 0);
    let fechaOrd = fechaOrden;
    if (!fechaOrd) {
      const mf = path.basename(carpeta).match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
      if (mf) fechaOrd = new Date(+mf[1], +mf[2] - 1, +mf[3], +mf[4], +mf[5], +mf[6]).getTime();
    }
    envios.push({
      carpetaRel, nombre: ln.nombre, draft: ln.draft, tecnico: meta.tecnico, cron: meta.cron,
      fecha: meta.today || (meta.start ? meta.start.slice(0, 10) : ""), fechaOrden: fechaOrd, total, puntos: puntosConFotos,
    });
  }
  return envios.sort((a, b) => b.fechaOrden - a.fechaOrden);
}
