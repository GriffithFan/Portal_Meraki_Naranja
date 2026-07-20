import * as XLSX from "xlsx";
import type { FilaReporte, ComentarioIncidencia } from "./aplicar";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ExcelExtractor {
  filas: FilaReporte[];
  comentariosPorCodigo: Map<string, ComentarioIncidencia[]>;
}

/** Convierte una hoja a array de objetos {header: valor} (sin tope de columnas). */
function hojaAObjetos(sheet: XLSX.WorkSheet | undefined): Record<string, string>[] {
  if (!sheet) return [];
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (aoa.length < 2) return [];
  const headers = (aoa[0] as any[]).map((h) => (h == null ? "" : String(h).trim()));
  const filas: Record<string, string>[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i] as any[];
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      const val = row[c];
      if (val instanceof Date) obj[key] = val.toISOString().slice(0, 10);
      else obj[key] = val == null ? "" : String(val).trim();
    }
    filas.push(obj);
  }
  return filas;
}

/**
 * Parsea el Excel del extractor: la hoja Datos_Completos (una fila por par) y
 * los comentarios de incidencia (hojas Comentarios_Incidencias + Comentarios_Nivel3),
 * agregados y deduplicados por código de predio.
 */
export function parsearExcelExtractor(buffer: Buffer): ExcelExtractor {
  const wb = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
  });

  const datos = wb.Sheets["Datos_Completos"];
  if (!datos) {
    throw new Error('El Excel no tiene la hoja "Datos_Completos" (¿es la salida del extractor?)');
  }
  const filas = hojaAObjetos(datos);

  const comentariosPorCodigo = new Map<string, ComentarioIncidencia[]>();
  const vistoPorCodigo = new Map<string, Set<string>>();
  const agregar = (nombreHoja: string) => {
    const filasCom = hojaAObjetos(wb.Sheets[nombreHoja]);
    for (const f of filasCom) {
      const codigo = (f["Numero_Predio"] || "").trim();
      const com = (f["Comentario"] || "").trim();
      if (!codigo || !com) continue;
      const vistos = vistoPorCodigo.get(codigo) || new Set<string>();
      if (vistos.has(com)) continue;
      vistos.add(com);
      vistoPorCodigo.set(codigo, vistos);
      const arr = comentariosPorCodigo.get(codigo) || [];
      arr.push({
        ni: (f["Numero_Incidencia"] || "").trim(),
        fecha: (f["Fecha_de_creacion"] || "").trim(),
        com,
      });
      comentariosPorCodigo.set(codigo, arr);
    }
  };
  agregar("Comentarios_Incidencias");
  agregar("Comentarios_Nivel3");

  return { filas, comentariosPorCodigo };
}
