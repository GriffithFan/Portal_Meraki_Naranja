/**
 * Autocompletado por prefijo de número de serie (primeros 4 caracteres).
 *
 * Fuente única de verdad para la página de Stock y el importador de Excel (antes
 * estaba duplicado en ambos y divergía). Cada prefijo mapea a los datos que se
 * derivan SOLO del serial. `proveedor` se incluye únicamente donde el origen es
 * confiable (ver porcentaje al lado, medido sobre el stock real):
 *   - FCW2 (Cisco 2960L): 96% BAPRO — estos switches solo vienen de Bapro.
 *   - Q2AJ/LD25/Q2CX/4E25/Q2TN: 99-100% DINATECH.
 *   - M1HT (Starlink) / U654 (rotuladora): 100% THNET.
 * El autocompletado es SOLO para rellenar el formulario/borrador; nunca envía.
 */
export type SerialPrefixInfo = {
  nombre: string;
  modelo?: string;
  marca?: string;
  proveedor?: string;
};

export const SERIAL_PREFIX_MAP: Record<string, SerialPrefixInfo> = {
  // ── Meraki (proveedor dominante: DINATECH) ──
  Q2PD: { nombre: "AP", modelo: "MR33", marca: "Meraki", proveedor: "DINATECH" },   // 98%
  Q3AJ: { nombre: "AP", modelo: "MR36", marca: "Meraki", proveedor: "DINATECH" },   // 92%
  Q2AJ: { nombre: "AP", modelo: "MR36", marca: "Meraki", proveedor: "DINATECH" },   // 100%
  Q3AL: { nombre: "AP", modelo: "MR44", marca: "Meraki", proveedor: "DINATECH" },   // 91%
  Q2GW: { nombre: "SWITCH 24P", modelo: "MS225", marca: "Meraki", proveedor: "DINATECH" }, // 96%
  Q2CX: { nombre: "SWITCH 8P", modelo: "MS120", marca: "Meraki", proveedor: "DINATECH" },  // 100%
  Q2PN: { nombre: "UTM", modelo: "MX84", marca: "Meraki", proveedor: "DINATECH" },  // 94%
  Q2YN: { nombre: "UTM", modelo: "MX85", marca: "Meraki", proveedor: "DINATECH" },  // 93%
  Q2TN: { nombre: "Gateway", modelo: "Z3", marca: "Meraki", proveedor: "DINATECH" }, // 99.5%
  // ── Huawei (DINATECH) ──
  LD25: { nombre: "SWITCH", modelo: "S5735-L8T4S-A-V2", marca: "Huawei", proveedor: "DINATECH" },   // 100%
  "4E25": { nombre: "SWITCH", modelo: "S5735-S24P4XE-V2", marca: "Huawei", proveedor: "DINATECH" }, // 100%
  // ── Cisco — SOLO vienen de BAPRO ──
  FCW2: { nombre: "SWITCH", modelo: "WS-C2960L-8PS-LL", marca: "Cisco", proveedor: "BAPRO" },       // 96%
  // ── Starlink (THNET) — modelo variable, no se autocompleta modelo ──
  M1HT: { nombre: "Starlink", marca: "Starlink", proveedor: "THNET" }, // 100%
  // ── Rotuladora (THNET) ──
  U654: { nombre: "Rotuladora", marca: "Brother", proveedor: "THNET" }, // 100%
};

/** Devuelve el auto-completado para un serial (o null si el prefijo no está mapeado). */
export function detectarPorSerial(serial?: string | null): SerialPrefixInfo | null {
  const s = (serial || "").trim();
  if (s.length < 4) return null;
  return SERIAL_PREFIX_MAP[s.slice(0, 4).toUpperCase()] || null;
}
