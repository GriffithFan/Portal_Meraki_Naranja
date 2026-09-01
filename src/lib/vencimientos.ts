/**
 * Detección de vencimientos en las fichas de Personal: cualquier campo cuyo
 * nombre contenga "vencimiento" con una fecha próxima o pasada dispara alertas
 * (badge en la UI + notificación a Leonel vía cron).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Con cuánta anticipación se avisa de un vencimiento.
 *
 * Estaba en 7 y era muy tarde: renovar un seguro o un monotributo lleva más de una
 * semana, asi que el aviso llegaba cuando ya no se podia hacer nada. Ademas el cron
 * documentaba "≤30 dias" en su comentario pero llamaba a `analizarVencimientos` sin
 * argumento, o sea que usaba estos 7: el codigo y su propia documentacion decian cosas
 * distintas. Medido el 31/08/2026: 3 fichas vencidas -dos hacia 8 dias- y 7 por vencer.
 */
export const DIAS_ALERTA_VENCIMIENTO = 30;

export type EstadoVenc = "vencido" | "proximo" | "ok";

export interface VencInfo {
  seccion: string;
  campoId: string;
  label: string;
  valor: string;
  fechaISO: string; // yyyy-mm-dd
  dias: number;      // días hasta el vencimiento (negativo = vencido hace N días)
  estado: EstadoVenc;
}

/** ¿El nombre del campo alude a un vencimiento? (sin acentos, case-insensitive). */
export function esCampoVencimiento(label: string): boolean {
  return (label || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes("vencimiento");
}

/** Parsea una fecha flexible: yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy. Devuelve fecha a medianoche local. */
export function parseFechaVenc(valor: string): Date | null {
  const s = (valor || "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d.getTime()) ? null : d; }
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; const d = new Date(y, +m[2] - 1, +m[1]); return isNaN(d.getTime()) ? null : d; }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Analiza todas las fechas de vencimiento de una ficha. */
export function analizarVencimientos(secciones: any, dias = DIAS_ALERTA_VENCIMIENTO): VencInfo[] {
  if (!Array.isArray(secciones)) return [];
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const out: VencInfo[] = [];
  for (const s of secciones) {
    for (const c of (s?.campos || [])) {
      if (!esCampoVencimiento(c?.label || "")) continue;
      const f = parseFechaVenc(c?.valor || "");
      if (!f) continue;
      f.setHours(0, 0, 0, 0);
      const d = Math.round((f.getTime() - hoy.getTime()) / 86400000);
      const estado: EstadoVenc = d < 0 ? "vencido" : d <= dias ? "proximo" : "ok";
      const iso = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
      out.push({ seccion: s.titulo || "", campoId: String(c.id || ""), label: c.label || "", valor: c.valor || "", fechaISO: iso, dias: d, estado });
    }
  }
  return out;
}

/** Estado más urgente de una ficha (para el badge): vencido > próximo > ok > null. */
export function estadoVencMasUrgente(secciones: any): EstadoVenc | null {
  const arr = analizarVencimientos(secciones);
  if (arr.some((v) => v.estado === "vencido")) return "vencido";
  if (arr.some((v) => v.estado === "proximo")) return "proximo";
  return arr.length ? "ok" : null;
}

/** Texto humano del estado de un vencimiento puntual. */
export function textoVencimiento(v: VencInfo): string {
  if (v.dias < 0) return `Vencido hace ${Math.abs(v.dias)} día${Math.abs(v.dias) === 1 ? "" : "s"}`;
  if (v.dias === 0) return "Vence hoy";
  return `Vence en ${v.dias} día${v.dias === 1 ? "" : "s"}`;
}
