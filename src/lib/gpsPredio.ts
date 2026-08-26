import { prisma } from "@/lib/prisma";

/**
 * Validación y detección de coordenadas basura en los predios.
 *
 * El problema real que resuelve: en Carrot hay coordenadas que no son ubicaciones sino
 * relleno — la del centro del partido, la de otro predio, o 0,0. Un técnico abre el mapa
 * y el predio le aparece a 300 km, o cinco escuelas de pueblos distintos aparecen
 * apiladas en el mismo punto. Paso el 26/08/2026: seis predios de General López (Aarón
 * Castellanos, Maggiolo, Sancti Spíritu, Lazzarino y dos de Venado Tuerto) estaban todos
 * en la coordenada de Venado Tuerto, y Salesforce tenía las seis bien y distintas.
 *
 * Por qué no se corregía solo: el enriquecimiento no pisa un GPS que discrepa más de 5 km
 * del que trae Salesforce, para no arruinar un dato bueno con uno dudoso. Pero cuando el
 * malo es el local, esa misma regla lo congela para siempre. De ahí `coordenadasCompartidas`:
 * marca las coordenadas que NO pueden ser reales para que el enriquecimiento las trate
 * como vacías y las reemplace.
 */

/** Tolerancia para considerar dos coordenadas "el mismo punto": ~100 m. */
const DECIMALES_CLAVE = 3;

/** Clave de agrupación de coordenadas cercanas. */
export function claveCoord(lat: number, lng: number): string {
  return `${lat.toFixed(DECIMALES_CLAVE)},${lng.toFixed(DECIMALES_CLAVE)}`;
}

/**
 * ¿Es una coordenada que puede corresponder a un predio real?
 *
 * Rechaza 0,0 — la "Isla Nula" frente a África, que es lo que queda cuando el origen
 * mandó "0S 0W" como forma de decir "no tengo el dato". Ojo con el orden: `Number(0)`
 * es finito, así que un chequeo de finitud NO alcanza para descartarla.
 */
export function esCoordenadaValida(lat: unknown, lng: unknown): boolean {
  const la = typeof lat === "number" ? lat : Number(lat);
  const ln = typeof lng === "number" ? lng : Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return false;
  // 0,0 y cualquier cosa a menos de ~1 km de ahí: relleno, no ubicación.
  if (Math.abs(la) < 0.01 && Math.abs(ln) < 0.01) return false;
  return true;
}

/** Lee un par de coordenadas de un texto libre ("-32.88, -60.70", "32°53'S 60°42'W"). */
export function parCoordenadas(texto: string | null | undefined): [number, number] | null {
  const nums = (texto || "").match(/-?\d+(?:[.,]\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const la = Number(nums[0].replace(",", "."));
  const ln = Number(nums[1].replace(",", "."));
  return esCoordenadaValida(la, ln) ? [la, ln] : null;
}

/**
 * Coordenadas que están compartidas por predios de LOCALIDADES DISTINTAS.
 *
 * Dos escuelas de pueblos diferentes no pueden estar en el mismo punto: cuando eso pasa,
 * la coordenada es relleno y no ubicación. Se compara por departamento (`ciudad`) porque
 * es el dato de ubicación más confiable que tenemos cargado.
 *
 * Devuelve las claves de `claveCoord`, para chequear con `has()` sin recorrer nada.
 */
export async function coordenadasCompartidas(): Promise<Set<string>> {
  const predios = await prisma.predio.findMany({
    where: { OR: [{ latitud: { not: null }, longitud: { not: null } }, { gpsPredio: { not: null } }] },
    select: { latitud: true, longitud: true, gpsPredio: true, ciudad: true },
  });

  const porPunto = new Map<string, Set<string>>();
  for (const p of predios) {
    let coord: [number, number] | null = null;
    if (esCoordenadaValida(p.latitud, p.longitud)) coord = [p.latitud as number, p.longitud as number];
    else coord = parCoordenadas(p.gpsPredio);
    if (!coord) continue;

    const localidad = (p.ciudad || "").trim().toUpperCase();
    if (!localidad) continue; // sin localidad no se puede decidir
    const clave = claveCoord(coord[0], coord[1]);
    const set = porPunto.get(clave) ?? new Set<string>();
    set.add(localidad);
    porPunto.set(clave, set);
  }

  const sospechosas = new Set<string>();
  for (const [clave, localidades] of Array.from(porPunto.entries())) {
    if (localidades.size > 1) sospechosas.add(clave);
  }
  return sospechosas;
}
