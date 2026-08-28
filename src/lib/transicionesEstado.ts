/**
 * Lectura de los cambios de estado que quedan registrados en el log de actividad.
 *
 * Existe porque hay DOS formas legítimas de contar una semana y hacían falta las dos:
 *
 *  - **Por estado actual** (lo que hacía el ranking): predios que HOY están en conforme /
 *    NC / instalado y que se tocaron esta semana. Es una foto del momento.
 *  - **Por movimiento** (esto): cuántos predios PASARON a cada estado durante la semana,
 *    hayan seguido moviéndose después o no.
 *
 * Las dos dan números distintos y ninguna está mal; miden cosas distintas. Medido en la
 * semana W34: por estado actual daba 108 conformes, 58 NC y 39 instalados/auditar; por
 * movimiento, 118 conformes, 19 NC y 129 instalados/auditar.
 *
 * La brecha de NC es la que más engaña: de los 58 que mostraba la foto, solo 19 son NC
 * NUEVOS de la semana. El resto son NC viejos que siguen abiertos y que esa semana
 * recibieron cualquier actualización, así que aparecían como si fueran del período.
 * Al revés pasa con instalados/auditar: hubo 129 movimientos pero solo 39 seguían ahí
 * al momento de mirar, porque la mayoría ya había avanzado a conforme.
 */

/** El log guarda la descripción como "Estado: <ANTES> -> <DESPUÉS>" (puede seguir "; <otro campo>"). */
export function parseTransicion(desc?: string | null): { antes: string; despues: string } | null {
  const m = /Estado:\s*(.+?)\s*->\s*([^;]+)/.exec(desc || "");
  if (!m) return null;
  return { antes: normalizar(m[1]), despues: normalizar(m[2]) };
}

export function normalizar(value?: string | null) {
  return (value || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_\s-]+/g, "");
}

/**
 * Un NC solo cuenta como nuevo si viene de trabajo real. Si viniera de cualquier estado,
 * entrarían correcciones administrativas que no son trabajo rechazado.
 */
const ORIGEN_NC = new Set(["enprogreso", "instalado", "auditar"]);

const esInstAuditar = (s: string) => s === "instalado" || s === "auditar";

export type BucketMovimiento = "conformes" | "noConformes" | "instaladosAuditar";

/**
 * A qué cuenta corresponde un movimiento, o null si no corresponde a ninguna.
 *
 * Ojo con instalado/auditar: pasar de instalado a auditar NO es trabajo nuevo, es el
 * mismo predio avanzando dentro del mismo grupo. Solo cuenta entrar al grupo desde afuera.
 */
export function bucketDeMovimiento(antes: string, despues: string): BucketMovimiento | null {
  if (despues === "conforme" && antes !== "conforme") return "conformes";
  if (despues === "noconforme" && ORIGEN_NC.has(antes)) return "noConformes";
  if (esInstAuditar(despues) && !esInstAuditar(antes)) return "instaladosAuditar";
  return null;
}
