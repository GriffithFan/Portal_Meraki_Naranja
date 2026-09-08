import * as XLSX from "xlsx";
import { ordenarTecnicosAsignados } from "@/utils/equipoUtils";
import { CAMPOS_TECNICO, mostrarValorCampo, valorCampoTecnico } from "@/lib/camposPredio";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Generación del reporte de facturación (una fila por predio CONFORME), COMPARTIDA
 * por la generación manual (`/api/facturacion`) y la automática (`/api/cron/facturacion`)
 * para que nunca vuelvan a divergir de formato.
 *
 * Cada predio aparece UNA sola vez, con dos columnas de técnico:
 *  - "Técnico (resolvió)"  = ÚLTIMO asignado → pago completo.
 *  - "Técnico anterior"    = el/los asignados previos → porcentaje (vacío si es uno solo).
 *
 * Las columnas que carga el técnico (recablear, AP reinstalados, cambio de rack…) NO
 * se escriben a mano acá: salen de CAMPOS_TECNICO en lib/camposPredio. Se hacía a mano
 * y `recablear` estuvo meses sin salir en el CSV aunque el dato estaba cargado.
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
  /** Valor cargado por el técnico, por clave de CAMPOS_TECNICO. "" = sin dato. */
  campos: Record<string, string>;
  resolvio: string;   // último asignado (pago completo), o "Sin asignar"
  anterior: string;   // asignado(s) previo(s) (porcentaje), o ""
}

const fechaAR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-AR") : "");

/** Los valores del técnico de un predio, ya normalizados, por clave. */
export function camposTecnicoDe(camposExtra: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const def of CAMPOS_TECNICO) out[def.clave] = valorCampoTecnico(camposExtra, def.clave);
  return out;
}

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
      campos: camposTecnicoDe(p.camposExtra),
      resolvio,
      anterior,
    };
  });
  filas.sort((a, b) => a.resolvio.localeCompare(b.resolvio, "es") || String(a.codigo || "").localeCompare(String(b.codigo || ""), "es"));
  return filas;
}

/**
 * El pie de cada columna del técnico: "3 predios · 7 puntos", "2 chicos · 1 grande".
 * Recibe las filas y devuelve el texto por clave, para que el CSV y el Excel muestren
 * exactamente lo mismo.
 */
export function totalesCamposTecnico(valoresPorClave: (clave: string) => string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const def of CAMPOS_TECNICO) {
    out[def.clave] = def.resumen(valoresPorClave(def.clave).filter(Boolean));
  }
  return out;
}

const totalesDeFilas = (filas: FilaFacturacion[]) =>
  totalesCamposTecnico((clave) => filas.map((f) => f.campos[clave] || ""));

export function csvFacturacion(filas: FilaFacturacion[], totalTareas: number): string {
  const esc = (v: unknown) => String(v ?? "").replace(/"/g, '""');
  const encabezados = ["Predio", "Incidencia", "Técnico (resolvió)", "Técnico anterior", "Fecha", "Provincia",
    ...CAMPOS_TECNICO.map((d) => d.etiqueta)];
  const lines = [encabezados.join(",")];
  for (const t of filas) {
    const celdas = [
      t.codigo || "", t.incidencia || "", t.resolvio, t.anterior, fechaAR(t.fecha), t.provincia || "",
      ...CAMPOS_TECNICO.map((d) => mostrarValorCampo(d, t.campos[d.clave] || "")),
    ];
    lines.push(celdas.map((c) => `"${esc(c)}"`).join(","));
  }
  const totales = totalesDeFilas(filas);
  lines.push("");
  const pie = [`TOTAL: ${totalTareas} predios`, "", "", "", "", "", ...CAMPOS_TECNICO.map((d) => totales[d.clave])];
  lines.push(pie.map((c) => `"${esc(c)}"`).join(","));
  return lines.join("\n");
}

export function xlsxBufferFacturacion(filas: FilaFacturacion[], totalTareas: number): Buffer {
  const rows: any[] = filas.map((t) => {
    const fila: any = {
      Predio: t.codigo || "",
      Incidencia: t.incidencia || "",
      "Técnico (resolvió)": t.resolvio,
      "Técnico anterior": t.anterior,
      Fecha: fechaAR(t.fecha),
      Provincia: t.provincia || "",
    };
    for (const d of CAMPOS_TECNICO) {
      const v = t.campos[d.clave] || "";
      // Los numéricos van como número para que Excel los pueda sumar.
      fila[d.etiqueta] = d.tipo === "numero" ? (v ? Number(v) : "") : mostrarValorCampo(d, v);
    }
    return fila;
  });
  const totales = totalesDeFilas(filas);
  const pie: any = { Predio: `TOTAL: ${totalTareas} predios`, Incidencia: "", "Técnico (resolvió)": "", "Técnico anterior": "", Fecha: "", Provincia: "" };
  for (const d of CAMPOS_TECNICO) pie[d.etiqueta] = totales[d.clave];
  rows.push(pie);

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 16 },
    ...CAMPOS_TECNICO.map((d) => ({ wch: Math.max(12, d.etiqueta.length + 3) }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Facturación");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * Resumen por técnico para guardar en el registro (lo usa la UI). Acredita a TODOS
 * los técnicos del predio (cuenta de predios por técnico), deduplicado por equipo.
 */
export function resumenPorTecnico(predios: PredioFacturacion[]) {
  const porTecnico: Record<string, {
    tecnicoId: string; tecnicoNombre: string;
    /** En cuantos predios participo. NO sirve para liquidar: los compartidos estan en dos. */
    cantidad: number;
    /** Los que le acreditan a EL. La suma de esto sobre todos da el total de predios. */
    acreditados: number;
    /** Participo pero acredita otro. */
    colaboraciones: number;
    tareas: any[];
  }> = {};
  for (const p of predios) {
    const campos = camposTecnicoDe(p.camposExtra);
    const tareaData = {
      id: p.id, nombre: p.nombre, codigo: p.codigo, provincia: p.provincia,
      incidencia: p.incidencias ?? null,
      fecha: p.fechaActualizacion ? p.fechaActualizacion.toISOString() : null,
      // Forma nueva: todo lo del tecnico junto, para que agregar un campo no obligue a
      // tocar el resumen. Se guardan tambien las claves viejas porque los reportes ya
      // emitidos las tienen y la pantalla sabe leer las dos.
      campos,
      mas20Ap: campos.tieneMas20Ap === "SI",
      recablear: campos.recablear,
      apReinstalados: campos.apReinstalados,
    };
    const ordenados = ordenarTecnicosAsignados(p.asignaciones);
    if (ordenados.length === 0) {
      const k = "SIN_ASIGNAR";
      if (!porTecnico[k]) porTecnico[k] = { tecnicoId: k, tecnicoNombre: "Sin asignar", cantidad: 0, acreditados: 0, colaboraciones: 0, tareas: [] };
      porTecnico[k].cantidad++;
      porTecnico[k].acreditados++;
      porTecnico[k].tareas.push({ ...tareaData, acreditado: true, acreditadoA: null });
    } else {
      // El predio se muestra bajo TODOS los que lo trabajaron, pero acredita UNO solo:
      // el ultimo asignado, que es el que lo resolvio y la misma regla que usa el ranking.
      //
      // Antes se sumaba `cantidad` para cada asignado, asi que un predio trabajado por dos
      // se contaba dos veces: en la semana del 22/08 el detalle sumaba 127 contra 120
      // predios reales, y cinco de esos siete eran el equipo de Ariel con los suyos.
      // Quien liquide sumando las filas por tecnico pagaba de mas.
      const ultimo = ordenados[ordenados.length - 1];
      for (const t of ordenados) {
        if (!porTecnico[t.mergeKey]) porTecnico[t.mergeKey] = { tecnicoId: t.mergeKey, tecnicoNombre: t.displayName, cantidad: 0, acreditados: 0, colaboraciones: 0, tareas: [] };
        const esElAcreditado = t.mergeKey === ultimo.mergeKey;
        porTecnico[t.mergeKey].cantidad++;
        if (esElAcreditado) porTecnico[t.mergeKey].acreditados++;
        else porTecnico[t.mergeKey].colaboraciones++;
        porTecnico[t.mergeKey].tareas.push({
          ...tareaData,
          acreditado: esElAcreditado,
          acreditadoA: esElAcreditado ? null : ultimo.displayName,
        });
      }
    }
  }
  return Object.values(porTecnico);
}
