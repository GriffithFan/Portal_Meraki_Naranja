/**
 * Autocompletado por prefijo de número de serie (primeros 4 caracteres).
 *
 * Fuente única de verdad para la página de Stock y el importador de Excel (antes
 * estaba duplicado en ambos y divergía). Cada prefijo mapea a los datos que se
 * derivan SOLO del serial.
 *
 * IMPORTANTE con `proveedor`: solo se incluye donde el equipo viene EXCLUSIVAMENTE
 * de un proveedor, para no mezclar. Los Meraki y Huawei comparten seriales/modelos
 * entre DINATECH y OCP, así que NO se autocompleta su proveedor (lo elige la
 * persona). Solo autocompletan proveedor:
 *   - FCW2 (Cisco 2960L) → BAPRO (solo vienen de Bapro).
 *   - M1HT (Starlink) / U654 (rotuladora) → THNET.
 * El autocompletado es SOLO para rellenar el formulario/borrador; nunca envía.
 */
export type SerialPrefixInfo = {
  nombre: string;
  modelo?: string;
  marca?: string;
  proveedor?: string;
};

export const SERIAL_PREFIX_MAP: Record<string, SerialPrefixInfo> = {
  // ── Meraki (DINATECH y OCP comparten seriales → NO se autocompleta proveedor) ──
  Q2PD: { nombre: "AP", modelo: "MR33", marca: "Meraki" },
  Q3AJ: { nombre: "AP", modelo: "MR36", marca: "Meraki" },
  Q2AJ: { nombre: "AP", modelo: "MR36", marca: "Meraki" },
  Q3AL: { nombre: "AP", modelo: "MR44", marca: "Meraki" },
  Q2KD: { nombre: "AP", modelo: "MR42", marca: "Meraki" },
  Q2LD: { nombre: "AP", modelo: "MR52", marca: "Meraki" },
  Q2GW: { nombre: "SWITCH 24P", modelo: "MS225", marca: "Meraki" },
  Q2CX: { nombre: "SWITCH 8P", modelo: "MS120", marca: "Meraki" },
  Q2PN: { nombre: "UTM", modelo: "MX84", marca: "Meraki" },
  Q2YN: { nombre: "UTM", modelo: "MX85", marca: "Meraki" },
  Q2TN: { nombre: "Gateway", modelo: "Z3", marca: "Meraki" },
  // ── Huawei (misma razón: no se autocompleta proveedor) ──
  LD25: { nombre: "SWITCH", modelo: "S5735-L8T4S-A-V2", marca: "Huawei" },
  "4E25": { nombre: "SWITCH", modelo: "S5735-S24P4XE-V2", marca: "Huawei" },
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
