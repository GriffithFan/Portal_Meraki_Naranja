import * as XLSX from "xlsx";
import { ordenarTecnicosAsignados } from "@/utils/equipoUtils";
import { normalizarRecablear } from "@/lib/camposPredio";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Generación del reporte de facturación (una fila por predio CONFORME), COMPARTIDA
 * por la generación manual (`/api/facturacion`) y la automática (`/api/cron/facturacion`)
 * para que nunca vuelvan a divergir de formato.
 *
 * Cada predio aparece UNA sola vez, con dos columnas de técnico:
 *  - "Técnico (resolvió)"  = ÚLTIMO asignado → pago completo.
 *  - "Técnico anterior"    = el/los asignados previos → porcentaje (vacío si es uno solo).
 */

type AsigLite = {
  createdAt: Date | string;
  usuario: { id: string; nombre: string | null; rol?: string | null; activo?: boolean | null } | null;
};

export type PredioFacturacion = {
  id: string;
  codigo: string | null;
  nombre: string | null;
  incidencias?: string | null;
  provincia: string | null;
  fechaActualizacion: Date | null;
  camposExtra: any;
  asignaciones: AsigLite[];
};

export interface FilaFacturacion {
  id: string;
  codigo: string | null;
  incidencia: string | null;
  nombre: string | null;
  provincia: string | null;
  fecha: string | null;
  mas20Ap: boolean;
  /** Puntos recableados que cargo el tecnico (1 a 5), o "" si no cargo nada. */
  recablear: string;
  resolvio: string;   // último asignado (pago completo), o "Sin asignar"
  anterior: string;   // asignado(s) previo(s) (porcentaje), o ""
}

const esMas20 = (camposExtra: any) => String(camposExtra?.tieneMas20Ap || "").trim().toUpperCase() === "SI";
const recableadoDe = (camposExtra: any) => normalizarRecablear(camposExtra?.recablear) ?? "";
const fechaAR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-AR") : "");

/** Una fila por predio, con quién resolvió (último) y quién estuvo antes. */
export function filasFacturacion(predios: PredioFacturacion[]): FilaFacturacion[] {
  const filas = predios.map((p) => {
    const ordenados = ordenarTecnicosAsignados(p.asignaciones); // [primero…, último]
    const resolvio = ordenados.length ? ordenados[ordenados.length - 1].displayName : "Sin asignar";
    const anterior = ordenados.length > 1 ? ordenados.slice(0, -1).map((t) => t.displayName).join(" + ") : "";
    return {
      id: p.id,
      codigo: p.codigo,
      incidencia: p.incidencias ?? null,
      nombre: p.nombre,
      provincia: p.provincia,
      fecha: p.fechaActualizacion ? p.fechaActualizacion.toISOString() : null,
      mas20Ap: esMas20(p.camposExtra),
      recablear: recableadoDe(p.camposExtra),
      resolvio,
      anterior,
    };
  });
  filas.sort((a, b) => a.resolvio.localeCompare(b.resolvio, "es") || String(a.codigo || "").localeCompare(String(b.codigo || ""), "es"));
  return filas;
}

export function csvFacturacion(filas: FilaFacturacion[], totalTareas: number, totalMas20: number): string {
  const esc = (v: unknown) => String(v ?? "").replace(/"/g, '""');
  const lines = ["Predio,Incidencia,Técnico (resolvió),Técnico anterior,Fecha,Provincia,Más de 20 AP"];
  for (const t of filas) {
    lines.push(
      `"${esc(t.codigo || "")}","${esc(t.incidencia || "")}","${esc(t.resolvio)}","${esc(t.anterior)}","${esc(fechaAR(t.fecha))}","${esc(t.provincia || "")}","${t.mas20Ap ? "Sí" : ""}"`
    );
  }
  lines.push("");
  lines.push(`"TOTAL: ${totalTareas} predios","","","","","","${totalMas20 ? `${totalMas20} con +20 AP` : ""}"`);
  return lines.join("\n");
}

export function xlsxBufferFacturacion(filas: FilaFacturacion[], totalTareas: number, totalMas20: number): Buffer {
  const rows: any[] = filas.map((t) => ({
    Predio: t.codigo || "",
    Incidencia: t.incidencia || "",
    "Técnico (resolvió)": t.resolvio,
    "Técnico anterior": t.anterior,
    Fecha: fechaAR(t.fecha),
    Provincia: t.provincia || "",
    "Más de 20 AP": t.mas20Ap ? "Sí" : "",
    Recablear: t.recablear ? Number(t.recablear) : "",
  }));
  const totalRecableados = filas.filter((f) => f.recablear).length;
  const puntosRecableados = filas.reduce((suma, f) => suma + (Number(f.recablear) || 0), 0);
  rows.push({ Predio: `TOTAL: ${totalTareas} predios`, Incidencia: "", "Técnico (resolvió)": "", "Técnico anterior": "", Fecha: "", Provincia: "", "Más de 20 AP": totalMas20 ? `${totalMas20} con +20 AP` : "", Recablear: totalRecableados ? `${totalRecableados} predios · ${puntosRecableados} puntos` : "" });
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 13 }, { wch: 11 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Facturación");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * Resumen por técnico para guardar en el registro (lo usa la UI). Acredita a TODOS
 * los técnicos del predio (cuenta de predios por técnico), deduplicado por equipo.
 */
export function resumenPorTecnico(predios: PredioFacturacion[]) {
  const porTecnico: Record<string, { tecnicoId: string; tecnicoNombre: string; cantidad: number; tareas: any[] }> = {};
  for (const p of predios) {
    const tareaData = {
      id: p.id, nombre: p.nombre, codigo: p.codigo, provincia: p.provincia,
      incidencia: p.incidencias ?? null,
      fecha: p.fechaActualizacion ? p.fechaActualizacion.toISOString() : null,
      mas20Ap: esMas20(p.camposExtra),
      recablear: recableadoDe(p.camposExtra),
    };
    const ordenados = ordenarTecnicosAsignados(p.asignaciones);
    if (ordenados.length === 0) {
      const k = "SIN_ASIGNAR";
      if (!porTecnico[k]) porTecnico[k] = { tecnicoId: k, tecnicoNombre: "Sin asignar", cantidad: 0, tareas: [] };
      porTecnico[k].cantidad++;
      porTecnico[k].tareas.push(tareaData);
    } else {
      for (const t of ordenados) {
        if (!porTecnico[t.mergeKey]) porTecnico[t.mergeKey] = { tecnicoId: t.mergeKey, tecnicoNombre: t.displayName, cantidad: 0, tareas: [] };
        porTecnico[t.mergeKey].cantidad++;
        porTecnico[t.mergeKey].tareas.push(tareaData);
      }
    }
  }
  return Object.values(porTecnico);
}
