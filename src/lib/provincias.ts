/**
 * Provincia del predio a partir del primer dígito del código:
 *   6xxxxx = Buenos Aires · 8xxxxx = Santa Fe · 3xxxxx = Entre Ríos.
 * El objetivo de conformes/semana por técnico depende de la zona: BA es más
 * accesible (7-8+); Santa Fe y Entre Ríos tienen más complejidad/distancia (5+).
 */
export type ProvinciaClave = "BA" | "SF" | "ER" | "OTRA";

export const PROVINCIAS_META: Record<ProvinciaClave, { nombre: string; corto: string; objetivo: number; objetivoLabel: string }> = {
  BA:   { nombre: "Buenos Aires", corto: "BA", objetivo: 7.5, objetivoLabel: "7-8+" },
  SF:   { nombre: "Santa Fe",     corto: "SF", objetivo: 5,   objetivoLabel: "5+" },
  ER:   { nombre: "Entre Ríos",   corto: "ER", objetivo: 5,   objetivoLabel: "5+" },
  OTRA: { nombre: "Otras",        corto: "—",  objetivo: 6,   objetivoLabel: "6+" },
};

export const PROVINCIAS_ORDEN: ProvinciaClave[] = ["BA", "SF", "ER", "OTRA"];

export function provinciaDeCodigo(codigo?: string | null): ProvinciaClave {
  const c = (codigo || "").trim();
  if (!/^\d/.test(c)) return "OTRA";
  switch (c[0]) {
    case "6": return "BA";
    case "8": return "SF";
    case "3": return "ER";
    default: return "OTRA";
  }
}
